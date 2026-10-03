//! DiffMap building: unified-diff parsing, exclusions, totals, shards.

use super::{
    git_cmd, run_git, DiffBundle, GitResult, RawFileDiff, Shard, LARGE_PR_FILES, LARGE_PR_LINES,
    RAW_DIFF_MAX_LINES,
};
use crate::model::{DiffFile, DiffMap, DiffStats, FileStatus, Hunk};
use std::collections::{BTreeMap, HashSet};
use std::io::Write;
use std::path::Path;
use std::process::Stdio;

// ── Unified diff parsing ───────────────────────────────────

/// Undo git's C-style path quoting (`"a\tb\303\251.txt"`).
fn unquote_path(s: &str) -> String {
    let s = s.trim_end_matches('\t');
    if !(s.len() >= 2 && s.starts_with('"') && s.ends_with('"')) {
        return s.to_string();
    }
    let inner = &s.as_bytes()[1..s.len() - 1];
    let mut out: Vec<u8> = Vec::with_capacity(inner.len());
    let mut i = 0;
    while i < inner.len() {
        let b = inner[i];
        if b != b'\\' || i + 1 >= inner.len() {
            out.push(b);
            i += 1;
            continue;
        }
        let c = inner[i + 1];
        match c {
            b'n' => out.push(b'\n'),
            b't' => out.push(b'\t'),
            b'r' => out.push(b'\r'),
            b'a' => out.push(7),
            b'b' => out.push(8),
            b'f' => out.push(12),
            b'v' => out.push(11),
            b'0'..=b'7' => {
                let mut val: u32 = 0;
                let mut n = 0;
                while n < 3 && i + 1 + n < inner.len() && (b'0'..=b'7').contains(&inner[i + 1 + n])
                {
                    val = val * 8 + u32::from(inner[i + 1 + n] - b'0');
                    n += 1;
                }
                out.push((val & 0xff) as u8);
                i += 1 + n;
                continue;
            }
            other => out.push(other),
        }
        i += 2;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// The path in a `--- a/x` / `+++ b/x` line; `None` for `/dev/null`.
fn marker_path(rest: &str, prefix: &str) -> Option<String> {
    let p = unquote_path(rest);
    if p == "/dev/null" {
        return None;
    }
    Some(p.strip_prefix(prefix).unwrap_or(&p).to_string())
}

/// Paths from `diff --git a/X b/Y` when no other header line names them
/// (mode-only changes, empty files, binary files).
fn header_paths(rest: &str) -> Option<(String, String)> {
    if rest.starts_with('"') {
        // "a/x" "b/y" or "a/x" b/y
        let bytes = rest.as_bytes();
        let mut i = 1;
        while i < bytes.len() {
            if bytes[i] == b'\\' {
                i += 2;
                continue;
            }
            if bytes[i] == b'"' {
                break;
            }
            i += 1;
        }
        if i >= bytes.len() {
            return None;
        }
        let a = unquote_path(&rest[..=i]);
        let b = unquote_path(rest[i + 1..].trim_start());
        return Some((
            a.strip_prefix("a/").unwrap_or(&a).to_string(),
            b.strip_prefix("b/").unwrap_or(&b).to_string(),
        ));
    }
    // Unquoted and identical on both sides: "a/P b/P".
    let len = rest.len();
    if len >= 5 && (len - 5).is_multiple_of(2) {
        let n = (len - 5) / 2;
        if rest.is_char_boundary(2 + n) {
            let a = &rest[2..2 + n];
            if rest.starts_with("a/") && rest[2 + n..] == format!(" b/{a}") {
                return Some((a.to_string(), a.to_string()));
            }
        }
    }
    // Different names without quoting: split at the first " b/".
    let idx = rest.find(" b/")?;
    let a = rest[..idx].strip_prefix("a/")?;
    Some((a.to_string(), rest[idx + 3..].to_string()))
}

/// `@@ -a[,b] +c[,d] @@`
fn parse_hunk_header(line: &str) -> Option<Hunk> {
    let rest = line.strip_prefix("@@ -")?;
    let end = rest.find(" @@")?;
    let (old, new) = rest[..end].split_once(" +")?;
    let range = |s: &str| -> Option<(u32, u32)> {
        match s.split_once(',') {
            Some((a, b)) => Some((a.parse().ok()?, b.parse().ok()?)),
            None => Some((s.parse().ok()?, 1)),
        }
    };
    let (old_start, old_lines) = range(old)?;
    let (new_start, new_lines) = range(new)?;
    Some(Hunk {
        old_start,
        old_lines,
        new_start,
        new_lines,
    })
}

#[derive(Default)]
struct Pending {
    file: DiffFile,
    raw: Vec<String>,
    header: Option<(String, String)>,
    minus: Option<String>,
    plus: Option<String>,
    rename_from: Option<String>,
    rename_to: Option<String>,
    explicit_status: Option<FileStatus>,
}

impl Pending {
    fn finish(mut self) -> (DiffFile, String) {
        let (header_a, header_b) = self.header.clone().unwrap_or_default();
        let status = if self.rename_to.is_some() {
            FileStatus::Renamed
        } else {
            self.explicit_status.unwrap_or(FileStatus::Modified)
        };
        let path = match status {
            FileStatus::Renamed => self.rename_to.clone().unwrap_or(header_b),
            FileStatus::Deleted => self.minus.clone().unwrap_or(header_a),
            _ => self.plus.clone().unwrap_or(header_b),
        };
        self.file.path = path;
        self.file.status = status;
        self.file.old_path = if status == FileStatus::Renamed {
            self.rename_from.clone()
        } else {
            None
        };
        self.file.removed_at.dedup();
        let mut raw = self.raw.join("\n");
        raw.push('\n');
        (self.file, raw)
    }
}

/// Parse `git diff` unified output into per-file facts plus each file's raw
/// diff text (untruncated). Pure.
pub fn parse_unified_diff(text: &str) -> Vec<(DiffFile, String)> {
    let mut out: Vec<(DiffFile, String)> = Vec::new();
    let mut cur: Option<Pending> = None;
    // Lines still owed to the current hunk; while either is non-zero a line
    // is hunk body, whatever it looks like (a removed "-- x" reads "--- x").
    let mut old_left: u32 = 0;
    let mut new_left: u32 = 0;
    let mut old_ln: u32 = 0;
    let mut new_ln: u32 = 0;

    for line in text.lines() {
        if old_left == 0 && new_left == 0 {
            if let Some(rest) = line.strip_prefix("diff --git ") {
                if let Some(p) = cur.take() {
                    out.push(p.finish());
                }
                cur = Some(Pending {
                    header: header_paths(rest),
                    raw: vec![line.to_string()],
                    ..Default::default()
                });
                continue;
            }
        }
        let Some(p) = cur.as_mut() else {
            continue; // preamble before the first file
        };
        p.raw.push(line.to_string());

        if old_left > 0 || new_left > 0 {
            match line.as_bytes().first() {
                Some(b'+') => {
                    p.file.added_lines.push(new_ln);
                    new_ln += 1;
                    new_left = new_left.saturating_sub(1);
                }
                Some(b'-') => {
                    p.file.removed_lines.push(old_ln);
                    p.file.removed_at.push(new_ln);
                    old_ln += 1;
                    old_left = old_left.saturating_sub(1);
                }
                Some(b'\\') => {} // "\ No newline at end of file"
                _ => {
                    // Context (a blank context line may have lost its space).
                    old_ln += 1;
                    new_ln += 1;
                    old_left = old_left.saturating_sub(1);
                    new_left = new_left.saturating_sub(1);
                }
            }
            continue;
        }

        if line.starts_with("@@ -") {
            if let Some(h) = parse_hunk_header(line) {
                old_left = h.old_lines;
                new_left = h.new_lines;
                // With a zero count, the start is the line *before* the change.
                old_ln = if h.old_lines == 0 {
                    h.old_start + 1
                } else {
                    h.old_start
                };
                new_ln = if h.new_lines == 0 {
                    h.new_start + 1
                } else {
                    h.new_start
                };
                p.file.hunks.push(h);
            }
        } else if let Some(rest) = line.strip_prefix("--- ") {
            p.minus = marker_path(rest, "a/");
        } else if let Some(rest) = line.strip_prefix("+++ ") {
            p.plus = marker_path(rest, "b/");
        } else if line.starts_with("new file mode") {
            p.explicit_status = Some(FileStatus::Added);
        } else if line.starts_with("deleted file mode") {
            p.explicit_status = Some(FileStatus::Deleted);
        } else if let Some(rest) = line.strip_prefix("rename from ") {
            p.rename_from = Some(unquote_path(rest));
        } else if let Some(rest) = line.strip_prefix("rename to ") {
            p.rename_to = Some(unquote_path(rest));
        } else if let Some(rest) = line.strip_prefix("copy to ") {
            p.plus = Some(unquote_path(rest));
            p.explicit_status = Some(FileStatus::Added);
        } else if line.starts_with("Binary files ") || line.starts_with("GIT binary patch") {
            p.file.binary = true;
        }
    }
    if let Some(p) = cur.take() {
        out.push(p.finish());
    }
    out
}

// ── Exclusions ─────────────────────────────────────────────

const EXCLUDED_DIRS: &[&str] = &["node_modules", "vendor", "dist", "build"];

const LOCKFILES: &[&str] = &[
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "bun.lock",
    "deno.lock",
    "go.sum",
    "packages.lock.json",
    "gradle.lockfile",
];

fn wildcard(pattern: &[char], text: &[char]) -> bool {
    match pattern.split_first() {
        None => text.is_empty(),
        Some(('*', rest)) => (0..=text.len()).any(|i| wildcard(rest, &text[i..])),
        Some(('?', rest)) => !text.is_empty() && wildcard(rest, &text[1..]),
        Some((c, rest)) => text.first() == Some(c) && wildcard(rest, &text[1..]),
    }
}

fn segment_match(pattern: &str, segment: &str) -> bool {
    let p: Vec<char> = pattern.chars().collect();
    let s: Vec<char> = segment.chars().collect();
    wildcard(&p, &s)
}

fn segments_match(pattern: &[&str], path: &[&str]) -> bool {
    match pattern.split_first() {
        // Pattern used up: it named this path or a directory above it.
        None => true,
        Some((&"**", rest)) => (0..=path.len()).any(|i| segments_match(rest, &path[i..])),
        Some((seg, rest)) => match path.split_first() {
            Some((first, path_rest)) => {
                segment_match(seg, first) && segments_match(rest, path_rest)
            }
            None => false,
        },
    }
}

/// Minimal gitignore-style glob: `*`, `?`, `**`; a pattern without `/`
/// matches any path component; a pattern naming a directory matches
/// everything under it. Pure.
pub fn glob_match(pattern: &str, path: &str) -> bool {
    let pattern = pattern.trim();
    if pattern.is_empty() || pattern.starts_with('#') {
        return false;
    }
    let anchored = pattern.starts_with('/');
    let pattern = pattern.trim_matches('/');
    let path = path.trim_matches('/');
    if pattern.is_empty() || path.is_empty() {
        return false;
    }
    let path_segs: Vec<&str> = path.split('/').collect();
    if !pattern.contains('/') && !anchored {
        return path_segs.iter().any(|seg| segment_match(pattern, seg));
    }
    let pat_segs: Vec<&str> = pattern.split('/').filter(|s| !s.is_empty()).collect();
    segments_match(&pat_segs, &path_segs)
}

/// True for paths excluded by convention (`node_modules`, `vendor`, `dist`,
/// `build`, `*.min.*`, lockfiles) or by a user glob. Pure.
pub fn is_excluded_path(path: &str, user_globs: &[String]) -> bool {
    let path = path.trim_matches('/');
    let mut segs: Vec<&str> = path.split('/').collect();
    let base = segs.pop().unwrap_or("");
    if segs.iter().any(|s| EXCLUDED_DIRS.contains(s)) {
        return true;
    }
    let lower = base.to_ascii_lowercase();
    if lower.contains(".min.") || lower.ends_with(".lock") || LOCKFILES.contains(&lower.as_str()) {
        return true;
    }
    user_globs.iter().any(|g| glob_match(g, path))
}

/// Parse the `exclude = ["glob", ...]` key of a `.grsp/config.toml`. Pure.
pub fn parse_config_excludes(toml_text: &str) -> Vec<String> {
    let Ok(table) = toml_text.parse::<toml::Table>() else {
        return Vec::new();
    };
    match table.get("exclude") {
        Some(toml::Value::Array(items)) => items
            .iter()
            .filter_map(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        Some(toml::Value::String(s)) if !s.trim().is_empty() => vec![s.trim().to_string()],
        _ => Vec::new(),
    }
}

/// User exclusion globs from `{worktree}/.grsp/config.toml` (empty if absent).
pub fn read_user_excludes(worktree: &Path) -> Vec<String> {
    std::fs::read_to_string(worktree.join(".grsp").join("config.toml"))
        .map(|t| parse_config_excludes(&t))
        .unwrap_or_default()
}

/// `.grsp/prompt.md` from the repo, if present and non-empty.
pub fn read_repo_prompt(worktree: &Path) -> Option<String> {
    const MAX_CHARS: usize = 20_000;
    let text = std::fs::read_to_string(worktree.join(".grsp").join("prompt.md")).ok()?;
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    Some(text.chars().take(MAX_CHARS).collect())
}

/// Pure half of the `.gitattributes` check: paths whose `linguist-generated`
/// or `linguist-vendored` attribute is set, from `git check-attr -z` output
/// (`path NUL attr NUL value NUL` …).
pub fn parse_check_attr_z(output: &str) -> HashSet<String> {
    let fields: Vec<&str> = output.split('\0').collect();
    fields
        .chunks(3)
        .filter(|c| c.len() == 3 && matches!(c[2], "set" | "true"))
        .map(|c| c[0].to_string())
        .collect()
}

/// Paths marked `linguist-generated` / `linguist-vendored` by the
/// `.gitattributes` files in `worktree`. Best effort: errors give none.
fn linguist_excluded(worktree: &Path, paths: &[String]) -> HashSet<String> {
    if paths.is_empty() {
        return HashSet::new();
    }
    let spawned = git_cmd(worktree)
        .args([
            "check-attr",
            "-z",
            "--stdin",
            "linguist-generated",
            "linguist-vendored",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn();
    let Ok(mut child) = spawned else {
        return HashSet::new();
    };
    let writer = child.stdin.take().map(|mut stdin| {
        let input: Vec<u8> = paths
            .iter()
            .flat_map(|p| p.bytes().chain(std::iter::once(0)))
            .collect();
        // Write from another thread so a full stdout pipe can't deadlock us.
        std::thread::spawn(move || {
            let _ = stdin.write_all(&input);
        })
    });
    let output = child.wait_with_output();
    if let Some(w) = writer {
        let _ = w.join();
    }
    match output {
        Ok(o) if o.status.success() => parse_check_attr_z(&String::from_utf8_lossy(&o.stdout)),
        _ => HashSet::new(),
    }
}

// ── Building ───────────────────────────────────────────────

fn truncate_raw(path: &str, raw: &str) -> RawFileDiff {
    let total = raw.lines().count();
    if total <= RAW_DIFF_MAX_LINES {
        return RawFileDiff {
            path: path.to_string(),
            text: raw.to_string(),
            truncated: false,
        };
    }
    let mut text: String = raw
        .lines()
        .take(RAW_DIFF_MAX_LINES)
        .collect::<Vec<_>>()
        .join("\n");
    text.push_str(&format!(
        "\n… diff truncated: {} more lines not shown. Read the file in the worktree for the rest.\n",
        total - RAW_DIFF_MAX_LINES
    ));
    RawFileDiff {
        path: path.to_string(),
        text,
        truncated: true,
    }
}

/// Pure half of `build_diff`: apply exclusions to parsed diff text.
/// `attr_excluded` holds paths excluded through `.gitattributes`.
pub fn bundle_from_diff_text(
    diff_text: &str,
    user_globs: &[String],
    attr_excluded: &HashSet<String>,
) -> DiffBundle {
    let mut bundle = DiffBundle::default();
    for (file, raw) in parse_unified_diff(diff_text) {
        if file.path.is_empty() {
            continue;
        }
        if attr_excluded.contains(&file.path) || is_excluded_path(&file.path, user_globs) {
            bundle.excluded.push(file.path);
            continue;
        }
        bundle.raw.push(truncate_raw(&file.path, &raw));
        bundle.map.files.push(file);
    }
    bundle.stats = diff_stats(&bundle.map);
    bundle
}

/// Build the DiffMap from `git diff --find-renames merge_base..head`, run in
/// `worktree` (the session worktree at head, so `.gitattributes` and
/// `.grsp/config.toml` are read at head). Applies all exclusions.
pub fn build_diff(worktree: &Path, merge_base_sha: &str, head_sha: &str) -> GitResult<DiffBundle> {
    if merge_base_sha.starts_with('-') || head_sha.starts_with('-') {
        return Err("Not a valid revision.".to_string());
    }
    let range = format!("{merge_base_sha}..{head_sha}");
    let text = run_git(
        worktree,
        &[
            "-c",
            "core.quotepath=false",
            "diff",
            "--find-renames",
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
            "--unified=3",
            "--src-prefix=a/",
            "--dst-prefix=b/",
            &range,
            "--",
        ],
    )
    .map_err(|e| format!("Couldn't read the diff: {e}"))?;
    let paths: Vec<String> = parse_unified_diff(&text)
        .into_iter()
        .map(|(f, _)| f.path)
        .collect();
    let attr_excluded = linguist_excluded(worktree, &paths);
    let globs = read_user_excludes(worktree);
    Ok(bundle_from_diff_text(&text, &globs, &attr_excluded))
}

/// Totals over a DiffMap.
pub fn diff_stats(map: &DiffMap) -> DiffStats {
    DiffStats {
        files: map.files.len() as u32,
        added: map.files.iter().map(|f| f.added_lines.len() as u32).sum(),
        removed: map.files.iter().map(|f| f.removed_lines.len() as u32).sum(),
    }
}

/// More than 60 files or 3,000 changed lines (SPEC §4.3).
pub fn is_large(stats: &DiffStats) -> bool {
    stats.files > LARGE_PR_FILES || stats.added + stats.removed > LARGE_PR_LINES
}

// ── Shards ─────────────────────────────────────────────────

fn group_key(path: &str, depth: usize) -> String {
    let segs: Vec<&str> = path.split('/').collect();
    if segs.len() <= 1 {
        return "(root)".to_string();
    }
    let dirs = &segs[..segs.len() - 1];
    dirs[..depth.min(dirs.len())].join("/")
}

/// Group changed files by top-level directory / package into at most
/// `max_shards` shards of roughly even size. A directory holding most of
/// the PR is split one level deeper. Pure and deterministic.
pub fn plan_shards(map: &DiffMap, max_shards: usize) -> Vec<Shard> {
    let max_shards = max_shards.max(1);
    let total = map.files.len();
    if total == 0 {
        return Vec::new();
    }
    // key → (depth used, files)
    let mut groups: BTreeMap<String, (usize, Vec<String>)> = BTreeMap::new();
    for f in &map.files {
        groups
            .entry(group_key(&f.path, 1))
            .or_insert_with(|| (1, Vec::new()))
            .1
            .push(f.path.clone());
    }
    // Split dominant groups deeper while that yields more, smaller groups.
    let fair = total.div_ceil(max_shards);
    for _ in 0..8 {
        if groups.len() >= max_shards {
            break;
        }
        let Some((key, depth)) = groups
            .iter()
            .filter(|(k, (d, files))| files.len() > fair && *d < 4 && k.as_str() != "(root)")
            .max_by_key(|(_, (_, files))| files.len())
            .map(|(k, (d, _))| (k.clone(), *d))
        else {
            break;
        };
        let Some((_, files)) = groups.remove(&key) else {
            break;
        };
        let mut split: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for p in &files {
            split
                .entry(group_key(p, depth + 1))
                .or_default()
                .push(p.clone());
        }
        if split.len() <= 1 {
            // Can't be split at this level; keep it and stop trying this key.
            groups.insert(key, (4, files));
            continue;
        }
        for (k, v) in split {
            groups
                .entry(k)
                .or_insert_with(|| (depth + 1, Vec::new()))
                .1
                .extend(v);
        }
    }

    let mut ordered: Vec<(String, Vec<String>)> = groups
        .into_iter()
        .map(|(k, (_, files))| (k, files))
        .collect();
    ordered.sort_by(|a, b| b.1.len().cmp(&a.1.len()).then_with(|| a.0.cmp(&b.0)));

    // Largest first into the currently smallest bin.
    let bins_n = max_shards.min(ordered.len());
    let mut bins: Vec<(Vec<String>, Vec<String>)> = vec![(Vec::new(), Vec::new()); bins_n];
    for (label, files) in ordered {
        let Some(target) = bins.iter_mut().min_by_key(|(_, f)| f.len()) else {
            break;
        };
        target.0.push(label);
        target.1.extend(files);
    }
    bins.into_iter()
        .filter(|(_, files)| !files.is_empty())
        .map(|(labels, mut files)| {
            files.sort();
            let label = if labels.len() <= 3 {
                labels.join(", ")
            } else {
                format!("{} +{} more", labels[..3].join(", "), labels.len() - 3)
            };
            Shard { label, files }
        })
        .collect()
}

// ── Context pack ───────────────────────────────────────────

fn status_label(f: &DiffFile) -> String {
    let base = match f.status {
        FileStatus::Added => "added".to_string(),
        FileStatus::Modified => "modified".to_string(),
        FileStatus::Deleted => "deleted".to_string(),
        FileStatus::Renamed => match &f.old_path {
            Some(old) => format!("renamed from {old}"),
            None => "renamed".to_string(),
        },
    };
    if f.binary {
        format!("{base}, binary")
    } else {
        base
    }
}

/// Render the context-pack diff section: one block per file with its status
/// and raw (truncated) diff. `only_files` restricts it to one shard.
pub fn render_diff_for_prompt(bundle: &DiffBundle, only_files: Option<&[String]>) -> String {
    let mut out = String::new();
    for (file, raw) in bundle.map.files.iter().zip(bundle.raw.iter()) {
        if let Some(only) = only_files {
            if !only.contains(&file.path) {
                continue;
            }
        }
        out.push_str(&format!(
            "### {} ({}, +{} -{})\n```diff\n{}",
            file.path,
            status_label(file),
            file.added_lines.len(),
            file.removed_lines.len(),
            raw.text
        ));
        if !raw.text.ends_with('\n') {
            out.push('\n');
        }
        out.push_str("```\n\n");
    }
    if !bundle.excluded.is_empty() {
        out.push_str(&format!(
            "{} generated, vendored or lock files changed and were left out.\n",
            bundle.excluded.len()
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::super::testutil::*;
    use super::*;

    const MODIFIED: &str = "\
diff --git a/orders/services.py b/orders/services.py
index 1111111..2222222 100644
--- a/orders/services.py
+++ b/orders/services.py
@@ -10,6 +10,9 @@ class OrderService:
     def create(self, data):
         order = Order(**data)
-        order.status = OK
+        if requires_approval(order):
+            order.status = REQUIRES_APPROVAL
+        else:
+            order.status = OK
         order.save()
         return order

@@ -40,6 +43,5 @@ def helper():
     a = 1
     b = 2
-    c = 3
     d = 4
     e = 5
     f = 6
";

    #[test]
    fn parses_modified_file_hunks_and_lines() {
        let files = parse_unified_diff(MODIFIED);
        assert_eq!(files.len(), 1);
        let (f, raw) = &files[0];
        assert_eq!(f.path, "orders/services.py");
        assert_eq!(f.status, FileStatus::Modified);
        assert_eq!(f.old_path, None);
        assert!(!f.binary);
        assert_eq!(
            f.hunks,
            vec![
                Hunk {
                    old_start: 10,
                    old_lines: 6,
                    new_start: 10,
                    new_lines: 9
                },
                Hunk {
                    old_start: 40,
                    old_lines: 6,
                    new_start: 43,
                    new_lines: 5
                },
            ]
        );
        assert_eq!(f.added_lines, vec![12, 13, 14, 15]);
        assert_eq!(f.removed_lines, vec![12, 42]);
        // Removal positions on the head side: before line 12, and before line 45.
        assert_eq!(f.removed_at, vec![12, 45]);
        assert!(raw.starts_with("diff --git a/orders/services.py"));
        assert!(raw.ends_with("     f = 6\n"));
    }

    #[test]
    fn parses_added_deleted_renamed_and_binary() {
        let text = "\
diff --git a/new.py b/new.py
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/new.py
@@ -0,0 +1,2 @@
+a = 1
+b = 2
diff --git a/old.py b/old.py
deleted file mode 100644
index 1111111..0000000
--- a/old.py
+++ /dev/null
@@ -1,3 +0,0 @@
-x = 1
-y = 2
-z = 3
diff --git a/src/a.py b/src/b.py
similarity index 90%
rename from src/a.py
rename to src/b.py
index 1111111..2222222 100644
--- a/src/a.py
+++ b/src/b.py
@@ -1,3 +1,3 @@
 one
-two
+TWO
 three
diff --git a/pure_old.txt b/pure_new.txt
similarity index 100%
rename from pure_old.txt
rename to pure_new.txt
diff --git a/logo.png b/logo.png
index 1111111..2222222 100644
Binary files a/logo.png and b/logo.png differ
diff --git a/new.bin b/new.bin
new file mode 100644
index 0000000..2222222
Binary files /dev/null and b/new.bin differ
diff --git a/empty.txt b/empty.txt
new file mode 100644
index 0000000..e69de29
diff --git a/run.sh b/run.sh
old mode 100644
new mode 100755
";
        let files: Vec<DiffFile> = parse_unified_diff(text)
            .into_iter()
            .map(|(f, _)| f)
            .collect();
        assert_eq!(files.len(), 8);

        assert_eq!(files[0].path, "new.py");
        assert_eq!(files[0].status, FileStatus::Added);
        assert_eq!(files[0].added_lines, vec![1, 2]);
        assert!(files[0].removed_lines.is_empty());

        assert_eq!(files[1].path, "old.py");
        assert_eq!(files[1].status, FileStatus::Deleted);
        assert_eq!(files[1].removed_lines, vec![1, 2, 3]);
        assert!(files[1].added_lines.is_empty());

        assert_eq!(files[2].path, "src/b.py");
        assert_eq!(files[2].status, FileStatus::Renamed);
        assert_eq!(files[2].old_path.as_deref(), Some("src/a.py"));
        assert_eq!(files[2].added_lines, vec![2]);
        assert_eq!(files[2].removed_lines, vec![2]);

        assert_eq!(files[3].path, "pure_new.txt");
        assert_eq!(files[3].status, FileStatus::Renamed);
        assert_eq!(files[3].old_path.as_deref(), Some("pure_old.txt"));
        assert!(files[3].hunks.is_empty());

        assert_eq!(files[4].path, "logo.png");
        assert!(files[4].binary);
        assert_eq!(files[4].status, FileStatus::Modified);
        assert!(files[4].hunks.is_empty());

        assert_eq!(files[5].path, "new.bin");
        assert!(files[5].binary);
        assert_eq!(files[5].status, FileStatus::Added);

        assert_eq!(files[6].path, "empty.txt");
        assert_eq!(files[6].status, FileStatus::Added);

        assert_eq!(files[7].path, "run.sh");
        assert_eq!(files[7].status, FileStatus::Modified);
    }

    #[test]
    fn hunk_body_that_looks_like_headers_is_still_body() {
        let text = "\
diff --git a/notes.md b/notes.md
index 1111111..2222222 100644
--- a/notes.md
+++ b/notes.md
@@ -1,4 +1,4 @@
 title
--- old rule
+++ new rule
-diff --git a/x b/x
+@@ -1 +1 @@
 end
";
        let files = parse_unified_diff(text);
        assert_eq!(files.len(), 1);
        let f = &files[0].0;
        assert_eq!(f.path, "notes.md");
        assert_eq!(f.hunks.len(), 1);
        assert_eq!(f.added_lines, vec![2, 3]);
        assert_eq!(f.removed_lines, vec![2, 3]);
    }

    #[test]
    fn single_line_hunks_no_newline_marker_and_spaces_in_paths() {
        let text = "\
diff --git a/my file.txt b/my file.txt
index 1111111..2222222 100644
--- a/my file.txt\t
+++ b/my file.txt\t
@@ -1 +1 @@
-old
\\ No newline at end of file
+new
\\ No newline at end of file
diff --git \"a/caf\\303\\251.txt\" \"b/caf\\303\\251.txt\"
index 1111111..2222222 100644
--- \"a/caf\\303\\251.txt\"
+++ \"b/caf\\303\\251.txt\"
@@ -3,0 +4,2 @@
+x
+y
";
        let files: Vec<DiffFile> = parse_unified_diff(text)
            .into_iter()
            .map(|(f, _)| f)
            .collect();
        assert_eq!(files[0].path, "my file.txt");
        assert_eq!(
            files[0].hunks[0],
            Hunk {
                old_start: 1,
                old_lines: 1,
                new_start: 1,
                new_lines: 1
            }
        );
        assert_eq!(files[0].added_lines, vec![1]);
        assert_eq!(files[0].removed_lines, vec![1]);
        assert_eq!(files[1].path, "café.txt");
        assert_eq!(files[1].added_lines, vec![4, 5]);
    }

    #[test]
    fn empty_and_garbage_input() {
        assert!(parse_unified_diff("").is_empty());
        assert!(parse_unified_diff("warning: something\nnot a diff\n").is_empty());
    }

    #[test]
    fn conventional_exclusions() {
        for p in [
            "node_modules/react/index.js",
            "web/node_modules/x.js",
            "vendor/lib/a.go",
            "dist/app.js",
            "packages/ui/build/out.js",
            "static/app.min.js",
            "static/site.min.css",
            "package-lock.json",
            "web/yarn.lock",
            "pnpm-lock.yaml",
            "Cargo.lock",
            "poetry.lock",
            "go.sum",
        ] {
            assert!(is_excluded_path(p, &[]), "{p} should be excluded");
        }
        for p in [
            "src/app.js",
            "orders/services.py",
            "builder/main.go",
            "docs/build.md",
            "src/vendors.ts",
            "admin.py",
            "build",
        ] {
            assert!(!is_excluded_path(p, &[]), "{p} should be kept");
        }
    }

    #[test]
    fn globs() {
        assert!(glob_match("*.snap", "tests/__snapshots__/a.snap"));
        assert!(glob_match("__snapshots__", "tests/__snapshots__/a.snap"));
        assert!(glob_match("fixtures/", "tests/fixtures/big.json"));
        assert!(glob_match("docs/**", "docs/a/b.md"));
        assert!(glob_match("docs", "docs/a/b.md"));
        assert!(glob_match(
            "**/generated/*.ts",
            "src/api/generated/client.ts"
        ));
        assert!(glob_match("src/**/*.pb.go", "src/x/y/z.pb.go"));
        assert!(glob_match("src/**/*.pb.go", "src/z.pb.go"));
        assert!(glob_match("/schema.sql", "schema.sql"));
        assert!(glob_match("migrations/*.sql", "migrations/001.sql"));
        assert!(glob_match("file?.txt", "file1.txt"));
        assert!(!glob_match("/schema.sql", "db/schema.sql"));
        assert!(!glob_match("migrations/*.sql", "app/migrations/001.sql"));
        assert!(!glob_match("*.snap", "a.snapshot"));
        assert!(!glob_match("docs/*.md", "src/docs.md"));
        assert!(!glob_match("", "a"));
        assert!(is_excluded_path(
            "api/schema.graphql",
            &["*.graphql".to_string()]
        ));
    }

    #[test]
    fn config_excludes() {
        assert_eq!(
            parse_config_excludes("exclude = [\"*.snap\", \" docs/** \", \"\"]\nother = 1\n"),
            vec!["*.snap".to_string(), "docs/**".to_string()]
        );
        assert!(parse_config_excludes("").is_empty());
        assert!(parse_config_excludes("exclude = 3").is_empty());
        assert!(parse_config_excludes("this is [not toml").is_empty());
    }

    #[test]
    fn check_attr_output() {
        let out = "a.gen.ts\0linguist-generated\0set\0a.gen.ts\0linguist-vendored\0unspecified\0\
third/x.c\0linguist-generated\0unspecified\0third/x.c\0linguist-vendored\0true\0\
src/a.ts\0linguist-generated\0unspecified\0src/a.ts\0linguist-vendored\0unset\0\
src/b.ts\0linguist-generated\0false\0";
        let set = parse_check_attr_z(out);
        assert_eq!(set.len(), 2);
        assert!(set.contains("a.gen.ts") && set.contains("third/x.c"));
    }

    #[test]
    fn bundle_applies_exclusions_and_totals() {
        let text = format!(
            "{MODIFIED}diff --git a/yarn.lock b/yarn.lock
index 1..2 100644
--- a/yarn.lock
+++ b/yarn.lock
@@ -1 +1 @@
-a
+b
diff --git a/api/client.gen.ts b/api/client.gen.ts
index 1..2 100644
--- a/api/client.gen.ts
+++ b/api/client.gen.ts
@@ -1 +1 @@
-a
+b
"
        );
        let attr: HashSet<String> = ["api/client.gen.ts".to_string()].into();
        let b = bundle_from_diff_text(&text, &[], &attr);
        assert_eq!(b.map.files.len(), 1);
        assert_eq!(
            b.excluded,
            vec!["yarn.lock".to_string(), "api/client.gen.ts".to_string()]
        );
        assert_eq!(
            b.stats,
            DiffStats {
                files: 1,
                added: 4,
                removed: 2
            }
        );
        assert_eq!(b.raw.len(), 1);
        assert!(!b.raw[0].truncated);
        assert!(!is_large(&b.stats));
    }

    #[test]
    fn raw_diff_is_truncated_at_400_lines_with_a_note() {
        let mut text = String::from(
            "diff --git a/big.txt b/big.txt\nnew file mode 100644\n--- /dev/null\n+++ b/big.txt\n@@ -0,0 +1,1000 @@\n",
        );
        for i in 0..1000 {
            text.push_str(&format!("+line {i}\n"));
        }
        let b = bundle_from_diff_text(&text, &[], &HashSet::new());
        assert_eq!(b.map.files[0].added_lines.len(), 1000);
        let raw = &b.raw[0];
        assert!(raw.truncated);
        assert_eq!(raw.text.lines().count(), RAW_DIFF_MAX_LINES + 1);
        assert!(raw.text.contains("diff truncated: 605 more lines"));
    }

    #[test]
    fn large_pr_thresholds() {
        assert!(!is_large(&DiffStats {
            files: 60,
            added: 1500,
            removed: 1500
        }));
        assert!(is_large(&DiffStats {
            files: 61,
            added: 0,
            removed: 0
        }));
        assert!(is_large(&DiffStats {
            files: 1,
            added: 3000,
            removed: 1
        }));
    }

    fn map_of(paths: &[String]) -> DiffMap {
        DiffMap {
            files: paths
                .iter()
                .map(|p| DiffFile {
                    path: p.clone(),
                    ..Default::default()
                })
                .collect(),
        }
    }

    #[test]
    fn shards_group_by_top_level_dir() {
        let mut paths = Vec::new();
        for i in 0..30 {
            paths.push(format!("orders/f{i}.py"));
        }
        for i in 0..20 {
            paths.push(format!("billing/f{i}.py"));
        }
        for i in 0..10 {
            paths.push(format!("web/f{i}.ts"));
        }
        paths.push("README.md".to_string());
        paths.push("docs/a.md".to_string());
        paths.push("ci/b.yml".to_string());
        let map = map_of(&paths);
        let shards = plan_shards(&map, 4);
        assert_eq!(shards.len(), 4);
        let total: usize = shards.iter().map(|s| s.files.len()).sum();
        assert_eq!(total, paths.len());
        assert_eq!(shards[0].label, "orders");
        assert_eq!(shards[0].files.len(), 30);
        assert_eq!(shards[1].label, "billing");
        // Every file lands in exactly one shard.
        let mut all: Vec<&String> = shards.iter().flat_map(|s| s.files.iter()).collect();
        all.sort();
        all.dedup();
        assert_eq!(all.len(), paths.len());
        // Deterministic.
        assert_eq!(shards, plan_shards(&map, 4));
    }

    #[test]
    fn shards_split_a_dominant_directory_deeper() {
        let mut paths = Vec::new();
        for pkg in ["api", "core", "ui", "jobs"] {
            for i in 0..20 {
                paths.push(format!("src/{pkg}/f{i}.ts"));
            }
        }
        let shards = plan_shards(&map_of(&paths), 4);
        assert_eq!(shards.len(), 4);
        assert!(shards.iter().all(|s| s.files.len() == 20));
        let labels: Vec<&str> = shards.iter().map(|s| s.label.as_str()).collect();
        assert!(labels.contains(&"src/api") && labels.contains(&"src/jobs"));
    }

    #[test]
    fn shards_edge_cases() {
        assert!(plan_shards(&DiffMap::default(), 4).is_empty());
        let one = plan_shards(&map_of(&["a.py".to_string(), "b.py".to_string()]), 4);
        assert_eq!(one.len(), 1);
        assert_eq!(one[0].label, "(root)");
        let flat: Vec<String> = (0..100).map(|i| format!("src/f{i}.ts")).collect();
        let s = plan_shards(&map_of(&flat), 4);
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].files.len(), 100);
        assert_eq!(plan_shards(&map_of(&flat), 0).len(), 1);
    }

    #[test]
    fn prompt_rendering() {
        let b = bundle_from_diff_text(MODIFIED, &[], &HashSet::new());
        let text = render_diff_for_prompt(&b, None);
        assert!(text.starts_with("### orders/services.py (modified, +4 -2)\n```diff\ndiff --git"));
        assert!(text.trim_end().ends_with("```"));
        assert_eq!(
            render_diff_for_prompt(&b, Some(&["other.py".to_string()])),
            ""
        );
    }

    // ── Real git ───────────────────────────────────────────

    #[test]
    fn build_diff_against_a_real_repo() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        init_repo(dir);
        write(dir, ".gitattributes", "*.gen.ts linguist-generated\nthird_party/** linguist-vendored=true\nkept.gen.ts -linguist-generated\n");
        write(
            dir,
            "orders/services.py",
            "def create(data):\n    order = Order(data)\n    order.save()\n    return order\n",
        );
        write(dir, "orders/legacy.py", "def old():\n    return 1\n");
        write(
            dir,
            "orders/names.py",
            "A = 1\nB = 2\nC = 3\nD = 4\nE = 5\nF = 6\n",
        );
        write(dir, "api/client.gen.ts", "export const a = 1;\n");
        write(dir, "kept.gen.ts", "export const k = 1;\n");
        write(dir, "third_party/lib.c", "int x;\n");
        write(dir, "package-lock.json", "{}\n");
        write(dir, "snap/a.snap", "one\n");
        std::fs::write(dir.join("logo.png"), [0u8, 159, 146, 150, 0, 1, 2]).unwrap();
        let base = commit_all(dir, "base");

        git(dir, &["checkout", "-q", "-b", "feature"]);
        write(dir, "orders/services.py", "def create(data):\n    order = Order(data)\n    if order.total > LIMIT:\n        order.status = 'hold'\n    order.save()\n    return order\n");
        std::fs::remove_file(dir.join("orders/legacy.py")).unwrap();
        git(dir, &["mv", "orders/names.py", "orders/constants.py"]);
        write(dir, "orders/policy.py", "LIMIT = 10\n");
        write(dir, "api/client.gen.ts", "export const a = 2;\n");
        write(dir, "kept.gen.ts", "export const k = 2;\n");
        write(dir, "third_party/lib.c", "int y;\n");
        write(dir, "package-lock.json", "{\"a\": 1}\n");
        write(dir, "snap/a.snap", "two\n");
        write(dir, ".grsp/config.toml", "exclude = [\"*.snap\"]\n");
        std::fs::write(dir.join("logo.png"), [0u8, 1, 2, 3, 0, 9, 9]).unwrap();
        let head = commit_all(dir, "feature");

        // Main moves on; using the merge base keeps this out of the PR.
        git(dir, &["checkout", "-q", "main"]);
        write(dir, "unrelated.py", "x = 1\n");
        commit_all(dir, "main moved");
        git(dir, &["checkout", "-q", "feature"]);
        let p = dir.to_str().unwrap();
        let mb = super::super::merge_base(p, "main", "feature").unwrap();
        assert_eq!(mb, base);

        let bundle = build_diff(dir, &mb, &head).unwrap();
        let by_path = |path: &str| bundle.map.file(path).cloned();

        assert!(by_path("unrelated.py").is_none());

        let svc = by_path("orders/services.py").unwrap();
        assert_eq!(svc.status, FileStatus::Modified);
        assert_eq!(svc.added_lines, vec![3, 4]);
        assert!(svc.removed_lines.is_empty());

        let legacy = by_path("orders/legacy.py").unwrap();
        assert_eq!(legacy.status, FileStatus::Deleted);
        assert_eq!(legacy.removed_lines, vec![1, 2]);

        let renamed = by_path("orders/constants.py").unwrap();
        assert_eq!(renamed.status, FileStatus::Renamed);
        assert_eq!(renamed.old_path.as_deref(), Some("orders/names.py"));
        // Lookup by the old path finds the same file.
        assert_eq!(
            bundle.map.file("orders/names.py").unwrap().path,
            "orders/constants.py"
        );

        assert_eq!(
            by_path("orders/policy.py").unwrap().status,
            FileStatus::Added
        );
        assert_eq!(
            by_path(".grsp/config.toml").unwrap().status,
            FileStatus::Added
        );

        let logo = by_path("logo.png").unwrap();
        assert!(logo.binary);
        assert!(logo.hunks.is_empty());

        // -linguist-generated overrides the wildcard.
        assert!(by_path("kept.gen.ts").is_some());

        for excluded in [
            "api/client.gen.ts",
            "third_party/lib.c",
            "package-lock.json",
            "snap/a.snap",
        ] {
            assert!(by_path(excluded).is_none(), "{excluded} should be excluded");
            assert!(
                bundle.excluded.contains(&excluded.to_string()),
                "{excluded} should be listed"
            );
        }

        assert_eq!(bundle.stats.files, bundle.map.files.len() as u32);
        assert_eq!(bundle.raw.len(), bundle.map.files.len());
        assert!(bundle
            .raw
            .iter()
            .any(|r| r.path == "orders/services.py"
                && r.text.contains("+    if order.total > LIMIT:")));
        assert!(build_diff(dir, "--output=/tmp/x", &head).is_err());
    }
}
