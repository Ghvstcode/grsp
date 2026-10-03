//! CodeRef verification (SPEC §3.1).

use super::{FileSource, ANCHOR_NEAR, ANCHOR_SNAP};
use crate::model::{CodeRef, RawCodeRef};
use std::path::Path;

/// Which version of the file a ref is checked against.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefSide {
    /// The worktree only.
    Head,
    /// The merge base only (removed code); the result has `at_base`.
    Base,
    /// The worktree; the merge base only if the file no longer exists at head.
    Auto,
}

/// Normalise an agent-supplied path to a repo-relative one: `\` → `/`,
/// strip `./` and leading `/`, relativise absolute paths inside `root`,
/// resolve `.` / `..`. `None` if empty or escaping the worktree.
pub fn normalize_path(raw: &str, root: Option<&Path>) -> Option<String> {
    let trimmed = raw
        .trim()
        .trim_matches(|c| c == '`' || c == '"' || c == '\'');
    if trimmed.is_empty() || trimmed.contains('\0') {
        return None;
    }
    let mut path = trimmed.replace('\\', "/");
    if let Some(root) = root {
        let root_str = root.to_string_lossy().replace('\\', "/");
        let root_str = root_str.trim_end_matches('/');
        if !root_str.is_empty() {
            if path == root_str {
                return None;
            }
            if let Some(rest) = path.strip_prefix(&format!("{root_str}/")) {
                path = rest.to_string();
            }
        }
    }
    let mut out: Vec<&str> = Vec::new();
    for seg in path.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                // Climbing above the repo root is an escape, not a path.
                out.pop()?;
            }
            s => out.push(s),
        }
    }
    if out.is_empty() {
        return None;
    }
    Some(out.join("/"))
}

/// Remove all whitespace, for whitespace-insensitive anchor matching.
pub(crate) fn squash(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace()).collect()
}

/// The anchor as matched: its first non-blank line, whitespace removed.
fn anchor_needle(anchor: Option<&str>) -> Option<String> {
    let line = anchor?.lines().find(|l| !l.trim().is_empty())?;
    let needle = squash(line);
    (!needle.is_empty()).then_some(needle)
}

/// The line nearest `start` (within `radius`) containing `needle`.
fn find_anchor(lines: &[&str], start: u32, needle: &str, radius: u32) -> Option<u32> {
    let total = lines.len() as i64;
    let has = |n: i64| -> bool {
        n >= 1 && n <= total && squash(lines[(n - 1) as usize]).contains(needle)
    };
    let start = i64::from(start);
    (0..=i64::from(radius)).find_map(|d| {
        if has(start + d) {
            Some((start + d) as u32)
        } else if d > 0 && has(start - d) {
            Some((start - d) as u32)
        } else {
            None
        }
    })
}

fn verify_in(raw: &RawCodeRef, path: String, text: &str, at_base: bool) -> Result<CodeRef, String> {
    let lines: Vec<&str> = text.lines().collect();
    let total = lines.len() as u32;
    if raw.start_line == 0 {
        return Err("no line number".to_string());
    }
    if total == 0 {
        return Err("the file is empty".to_string());
    }
    let mut start = raw.start_line;
    // An end before the start is noise; treat the ref as a point.
    let mut end = raw.end_line.filter(|e| *e >= start);
    let mut snapped = None;

    match anchor_needle(raw.anchor.as_deref()) {
        Some(needle) => {
            let found = find_anchor(&lines, start, &needle, ANCHOR_SNAP).ok_or_else(|| {
                format!(
                    "anchor {:?} not found within {ANCHOR_SNAP} lines of line {start}",
                    raw.anchor.as_deref().unwrap_or("").trim()
                )
            })?;
            let distance = found.abs_diff(start);
            let in_file = start <= total;
            if distance > ANCHOR_NEAR || !in_file {
                // Snap: shift the whole range to where the anchor really is.
                let len = end.map(|e| e - start);
                start = found;
                end = len.map(|l| start + l);
                snapped = Some(true);
            } else if end.is_none() {
                // A point ref a line or two off: point at the anchor itself.
                start = found;
            }
            // The anchor vouches for the start; an end past EOF is clamped.
            end = end.map(|e| e.min(total));
        }
        None => {
            if start > total || end.is_some_and(|e| e > total) {
                return Err(format!("line range is outside the file ({total} lines)"));
            }
        }
    }

    Ok(CodeRef {
        file: path,
        start_line: start,
        end_line: end,
        anchor: raw
            .anchor
            .as_deref()
            .map(str::trim)
            .filter(|a| !a.is_empty())
            .map(str::to_string),
        verified: true,
        snapped,
        at_base: at_base.then_some(true),
    })
}

/// Verify one ref (SPEC §3.1). `Err` carries the plain-language drop reason.
///
/// - the file must exist (worktree, or merge base for removed code);
/// - the range must be within the file;
/// - an anchor must appear, whitespace-insensitively, on `startLine` or
///   within ±2 lines (verified in place), or within ±10 (snapped).
pub fn verify_ref(
    raw: &RawCodeRef,
    src: &dyn FileSource,
    side: RefSide,
) -> Result<CodeRef, String> {
    let path = normalize_path(&raw.file, src.root())
        .ok_or_else(|| "path is empty or outside the repository".to_string())?;
    match side {
        RefSide::Head => match src.read_head(&path) {
            Some(text) => verify_in(raw, path, &text, false),
            None => Err("file not found in the worktree".to_string()),
        },
        RefSide::Base => match src.read_base(&path) {
            Some(text) => verify_in(raw, path, &text, true),
            None => Err("file not found at the merge base".to_string()),
        },
        RefSide::Auto => match src.read_head(&path) {
            Some(text) => verify_in(raw, path, &text, false),
            None => match src.read_base(&path) {
                Some(text) => verify_in(raw, path, &text, true),
                None => Err("file not found in the worktree or at the merge base".to_string()),
            },
        },
    }
}

#[cfg(test)]
mod tests {
    use super::super::MemorySource;
    use super::*;

    /// 30 lines: "line 1" … with a few recognisable ones.
    fn file() -> String {
        (1..=30)
            .map(|n| match n {
                12 => "    def create(self, data):".to_string(),
                20 => "\tif order.total   >  THRESHOLD:".to_string(),
                n => format!("line {n}"),
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn src() -> MemorySource {
        MemorySource::new()
            .with_head("orders/services.py", &file())
            .with_base("orders/legacy.py", "def old():\n    return 1\n")
            .with_root("/data/worktrees/s1")
    }

    fn check(
        file: &str,
        start: u32,
        end: Option<u32>,
        anchor: Option<&str>,
    ) -> Result<CodeRef, String> {
        verify_ref(
            &RawCodeRef::new(file, start, end, anchor),
            &src(),
            RefSide::Auto,
        )
    }

    #[test]
    fn exact_anchor_match() {
        let r = check("orders/services.py", 12, Some(18), Some("def create")).unwrap();
        assert!(r.verified);
        assert_eq!((r.start_line, r.end_line), (12, Some(18)));
        assert_eq!(r.snapped, None);
        assert_eq!(r.at_base, None);
        assert_eq!(r.anchor.as_deref(), Some("def create"));
    }

    #[test]
    fn anchor_is_whitespace_insensitive() {
        let r = check(
            "orders/services.py",
            20,
            None,
            Some("if order.total > THRESHOLD:"),
        )
        .unwrap();
        assert_eq!(r.start_line, 20);
        let r = check(
            "orders/services.py",
            20,
            None,
            Some("order.total>THRESHOLD"),
        )
        .unwrap();
        assert_eq!(r.start_line, 20);
        // Case still matters.
        assert!(check("orders/services.py", 20, None, Some("ORDER.TOTAL")).is_err());
    }

    #[test]
    fn anchor_within_two_lines_verifies_without_snapping() {
        // Range: kept as the agent gave it (it may start at a decorator).
        let r = check("orders/services.py", 10, Some(18), Some("def create")).unwrap();
        assert_eq!((r.start_line, r.end_line, r.snapped), (10, Some(18), None));
        let r = check("orders/services.py", 14, Some(18), Some("def create")).unwrap();
        assert_eq!((r.start_line, r.snapped), (14, None));
        // Point: lands on the anchor line.
        let r = check("orders/services.py", 13, None, Some("def create")).unwrap();
        assert_eq!((r.start_line, r.end_line, r.snapped), (12, None, None));
    }

    #[test]
    fn anchor_within_ten_lines_snaps_the_whole_range() {
        let r = check("orders/services.py", 5, Some(9), Some("def create")).unwrap();
        assert_eq!(
            (r.start_line, r.end_line, r.snapped),
            (12, Some(16), Some(true))
        );
        let r = check("orders/services.py", 22, None, Some("def create")).unwrap();
        assert_eq!((r.start_line, r.snapped), (12, Some(true)));
        // Snapped end is clamped to the file.
        let r = check("orders/services.py", 15, Some(29), Some("order.total")).unwrap();
        assert_eq!(
            (r.start_line, r.end_line, r.snapped),
            (20, Some(30), Some(true))
        );
    }

    #[test]
    fn anchor_too_far_or_absent_drops() {
        assert!(check("orders/services.py", 1, None, Some("def create")).is_err());
        assert!(check("orders/services.py", 23, None, Some("def create")).is_err());
        let err = check("orders/services.py", 12, None, Some("def destroy")).unwrap_err();
        assert!(err.contains("def destroy"));
    }

    #[test]
    fn nearest_match_wins() {
        let text = "x = 1\nfoo()\ny = 2\nz = 3\nfoo()\n";
        let s = MemorySource::new().with_head("a.py", text);
        let r = verify_ref(
            &RawCodeRef::new("a.py", 4, None, Some("foo()")),
            &s,
            RefSide::Head,
        )
        .unwrap();
        assert_eq!(r.start_line, 5);
    }

    #[test]
    fn no_anchor_needs_a_valid_range() {
        let r = check("orders/services.py", 3, Some(30), None).unwrap();
        assert_eq!((r.start_line, r.end_line), (3, Some(30)));
        assert!(check("orders/services.py", 31, None, None).is_err());
        assert!(check("orders/services.py", 3, Some(31), None).is_err());
        assert!(check("orders/services.py", 0, None, None).is_err());
        // Blank anchors count as no anchor.
        assert!(check("orders/services.py", 3, None, Some("   ")).is_ok());
        // End before start: treated as a point.
        let r = check("orders/services.py", 12, Some(4), None).unwrap();
        assert_eq!(r.end_line, None);
    }

    #[test]
    fn anchor_vouches_for_start_so_end_is_clamped() {
        let r = check("orders/services.py", 12, Some(99), Some("def create")).unwrap();
        assert_eq!(r.end_line, Some(30));
        // Start past EOF but anchor nearby: snapped.
        let r = check("orders/services.py", 32, None, Some("line 30")).unwrap();
        assert_eq!((r.start_line, r.snapped), (30, Some(true)));
    }

    #[test]
    fn hallucinated_file_drops() {
        assert!(check("orders/nope.py", 1, None, None).is_err());
        assert!(check("", 1, None, None).is_err());
    }

    #[test]
    fn base_side_for_removed_code() {
        // Auto falls back to the merge base when the file is gone at head.
        let r = check("orders/legacy.py", 1, Some(2), Some("def old")).unwrap();
        assert_eq!(r.at_base, Some(true));
        assert!(r.is_at_base());
        // Head only: dropped.
        let raw = RawCodeRef::new("orders/legacy.py", 1, None, Some("def old"));
        assert!(verify_ref(&raw, &src(), RefSide::Head).is_err());
        // Base only: a file that exists only at head is dropped.
        let raw = RawCodeRef::new("orders/services.py", 12, None, None);
        assert!(verify_ref(&raw, &src(), RefSide::Base).is_err());
        // Wrong anchor at base still drops.
        let raw = RawCodeRef::new("orders/legacy.py", 1, None, Some("def new"));
        assert!(verify_ref(&raw, &src(), RefSide::Base).is_err());
    }

    #[test]
    fn path_normalisation() {
        let root = Path::new("/data/worktrees/s1");
        let n = |p: &str| normalize_path(p, Some(root));
        assert_eq!(
            n("./orders/services.py").as_deref(),
            Some("orders/services.py")
        );
        assert_eq!(
            n("/orders/services.py").as_deref(),
            Some("orders/services.py")
        );
        assert_eq!(
            n("orders//services.py").as_deref(),
            Some("orders/services.py")
        );
        assert_eq!(
            n("orders/./x/../services.py").as_deref(),
            Some("orders/services.py")
        );
        assert_eq!(
            n("orders\\services.py").as_deref(),
            Some("orders/services.py")
        );
        assert_eq!(
            n("`orders/services.py`").as_deref(),
            Some("orders/services.py")
        );
        assert_eq!(
            n("/data/worktrees/s1/orders/services.py").as_deref(),
            Some("orders/services.py")
        );
        assert_eq!(n("/data/worktrees/s1"), None);
        assert_eq!(n(""), None);
        assert_eq!(n("   "), None);
        assert_eq!(n("./"), None);
    }

    #[test]
    fn path_escape_is_rejected() {
        let root = Path::new("/data/worktrees/s1");
        assert_eq!(normalize_path("../secret.txt", Some(root)), None);
        assert_eq!(normalize_path("orders/../../secret.txt", Some(root)), None);
        assert_eq!(
            normalize_path("/data/worktrees/s1/../s2/a.py", Some(root)),
            None
        );
        assert_eq!(normalize_path("..", None), None);
        // An absolute path elsewhere becomes repo-relative and then simply
        // doesn't exist in the worktree.
        assert_eq!(
            normalize_path("/etc/passwd", Some(root)).as_deref(),
            Some("etc/passwd")
        );
        assert!(check("/etc/passwd", 1, None, None).is_err());
        assert!(check("../../etc/passwd", 1, None, None).is_err());
        // Absolute paths inside the worktree verify.
        assert!(check(
            "/data/worktrees/s1/orders/services.py",
            12,
            None,
            Some("def create")
        )
        .is_ok());
        assert_eq!(
            check("./orders/services.py", 12, None, None).unwrap().file,
            "orders/services.py"
        );
    }
}
