//! Git facts: PR resolution, worktrees, DiffMap (SPEC §2.1–2.4).
//!
//! Everything here shells out to a resolved `git` binary or parses its text
//! output. Parsing functions are pure and tested from text input.
//! All fallible functions return `Result<_, String>` with a plain-language
//! message suitable for showing in the UI.

use crate::model::{DiffMap, DiffStats};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

mod diff;
mod repo;
mod url;
mod worktree;

pub use diff::*;
pub use repo::*;
pub use url::*;
pub use worktree::*;

pub type GitResult<T> = Result<T, String>;

/// More than this many changed files makes a PR "large" (SPEC §4.3).
pub const LARGE_PR_FILES: u32 = 60;
/// More than this many changed lines makes a PR "large" (SPEC §4.3).
pub const LARGE_PR_LINES: u32 = 3000;
/// Per-file raw diff cap for the context pack (SPEC §4.2).
pub const RAW_DIFF_MAX_LINES: usize = 400;
/// Worktrees of sessions untouched this long are pruned (SPEC §2.4).
pub const WORKTREE_MAX_AGE_DAYS: i64 = 14;

/// A parsed GitHub pull request URL.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrUrl {
    /// `"github"` for github.com.
    pub host: String,
    pub owner: String,
    pub name: String,
    pub number: u64,
}

/// The three SHAs a session is pinned to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedRefs {
    pub base_sha: String,
    pub head_sha: String,
    pub merge_base_sha: String,
}

/// One file's raw unified diff for the context pack.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawFileDiff {
    pub path: String,
    /// The file's diff section, truncated at `RAW_DIFF_MAX_LINES` with a note.
    pub text: String,
    pub truncated: bool,
}

/// Everything `build_diff` knows about a PR's changes.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DiffBundle {
    /// Changed files after exclusions.
    pub map: DiffMap,
    /// Raw per-file diff text, same order as `map.files`.
    pub raw: Vec<RawFileDiff>,
    /// Totals over `map` (excluded files don't count).
    pub stats: DiffStats,
    /// Paths left out as vendored / generated / lock files / user globs.
    pub excluded: Vec<String>,
}

/// A group of changed files analysed together in a sharded discovery pass.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Shard {
    /// Top-level directory or package, e.g. `"orders"` or `"(root)"`.
    pub label: String,
    pub files: Vec<String>,
}

/// A session's worktree, as input to `prune_stale_worktrees`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorktreeCandidate {
    pub session_id: String,
    pub repo_path: String,
    pub worktree_path: String,
    /// ISO 8601 or SQLite `YYYY-MM-DD HH:MM:SS` (UTC).
    pub last_opened_at: String,
}

/// Path of the git binary (well-known install locations, then bare `git`).
///
/// macOS .app bundles don't inherit the shell PATH, so a bare
/// `Command::new("git")` can fail even when git is installed.
pub fn git_binary() -> String {
    static BIN: OnceLock<String> = OnceLock::new();
    BIN.get_or_init(|| {
        let candidates = [
            PathBuf::from("/opt/homebrew/bin/git"),
            PathBuf::from("/usr/local/bin/git"),
            PathBuf::from("/usr/bin/git"),
        ];
        candidates
            .iter()
            .find(|c| c.exists())
            .map(|c| c.to_string_lossy().to_string())
            .unwrap_or_else(|| "git".to_string())
    })
    .clone()
}

/// A git command in `dir` that never prompts and prints stable messages.
pub(crate) fn git_cmd(dir: &Path) -> Command {
    let mut cmd = Command::new(git_binary());
    cmd.current_dir(dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("LC_ALL", "C");
    // grsp only reads text, so LFS files are checked out as their small
    // pointer files and no repository hooks run. Both would otherwise need
    // `git-lfs`, which isn't on the PATH a macOS app gets.
    for (i, (key, value)) in GIT_CONFIG_OVERRIDES.iter().enumerate() {
        cmd.env(format!("GIT_CONFIG_KEY_{i}"), key)
            .env(format!("GIT_CONFIG_VALUE_{i}"), value);
    }
    cmd.env("GIT_CONFIG_COUNT", GIT_CONFIG_OVERRIDES.len().to_string())
        .env("GIT_LFS_SKIP_SMUDGE", "1");
    cmd
}

/// Applied to every git command grsp runs.
///
/// - The LFS filter is switched off. An empty filter is a no-op, but only
///   when it isn't marked required, which `git lfs install` does.
/// - Repository hooks are switched off. `git lfs install` also adds a
///   post-checkout hook that fails without `git-lfs`, and a tool that only
///   reads a PR has no business running a repo's hooks anyway.
const GIT_CONFIG_OVERRIDES: [(&str, &str); 5] = [
    ("filter.lfs.required", "false"),
    ("filter.lfs.process", ""),
    ("filter.lfs.smudge", ""),
    ("filter.lfs.clean", ""),
    ("core.hooksPath", "/dev/null"),
];

pub(crate) struct GitOutput {
    pub ok: bool,
    pub stdout: String,
    pub stderr: String,
}

pub(crate) fn run_git_raw(dir: &Path, args: &[&str]) -> GitResult<GitOutput> {
    if !dir.is_dir() {
        return Err(format!("Folder not found: {}", dir.display()));
    }
    let out = git_cmd(dir)
        .args(args)
        .output()
        .map_err(|e| format!("Couldn't run git: {e}"))?;
    Ok(GitOutput {
        ok: out.status.success(),
        stdout: String::from_utf8_lossy(&out.stdout).to_string(),
        stderr: String::from_utf8_lossy(&out.stderr).trim().to_string(),
    })
}

/// Run git and return stdout, or its stderr as the error.
pub(crate) fn run_git(dir: &Path, args: &[&str]) -> GitResult<String> {
    let out = run_git_raw(dir, args)?;
    if out.ok {
        Ok(out.stdout)
    } else if out.stderr.is_empty() {
        Err(format!("git {} failed", args.first().unwrap_or(&"")))
    } else {
        Err(out.stderr)
    }
}

/// Detect the default branch of the repo at `path` (origin/HEAD, falling back to main/master).
pub fn detect_default_branch(path: &str) -> String {
    let dir = Path::new(path);
    if let Ok(s) = run_git(
        dir,
        &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    ) {
        if let Some(b) = s.trim().strip_prefix("origin/") {
            return b.to_string();
        }
    }
    for b in ["main", "master"] {
        let local = format!("refs/heads/{b}");
        if run_git(dir, &["rev-parse", "--verify", "--quiet", &local]).is_ok() {
            return b.to_string();
        }
    }
    for b in ["main", "master"] {
        let remote = format!("refs/remotes/origin/{b}");
        if run_git(dir, &["rev-parse", "--verify", "--quiet", &remote]).is_ok() {
            return b.to_string();
        }
    }
    // A fresh repo with an unborn branch.
    if let Ok(s) = run_git(dir, &["symbolic-ref", "--short", "HEAD"]) {
        let s = s.trim();
        if !s.is_empty() {
            return s.to_string();
        }
    }
    "main".to_string()
}

#[cfg(test)]
pub(crate) mod testutil {
    use super::*;
    use std::fs;

    /// Run git in `dir` for test setup, panicking on failure.
    pub fn git(dir: &Path, args: &[&str]) -> String {
        let out = git_cmd(dir)
            .args([
                "-c",
                "user.name=grsp-test",
                "-c",
                "user.email=test@grsp.invalid",
                "-c",
                "commit.gpgsign=false",
                "-c",
                "core.autocrlf=false",
            ])
            .args(args)
            .output()
            .expect("git runs");
        assert!(
            out.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }

    pub fn write(dir: &Path, rel: &str, content: &str) {
        let p = dir.join(rel);
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(p, content).unwrap();
    }

    pub fn init_repo(dir: &Path) {
        git(dir, &["init", "-q", "-b", "main"]);
    }

    pub fn commit_all(dir: &Path, msg: &str) -> String {
        git(dir, &["add", "-A"]);
        git(dir, &["commit", "-q", "--allow-empty", "-m", msg]);
        git(dir, &["rev-parse", "HEAD"])
    }
}
