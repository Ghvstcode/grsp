//! Git facts: PR resolution, worktrees, DiffMap.

/// Detect the default branch of the repo at `path` (origin/HEAD, falling back to main/master).
pub fn detect_default_branch(path: &str) -> String {
    let out = std::process::Command::new("git")
        .args(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
        .current_dir(path)
        .output();
    if let Ok(o) = out {
        if o.status.success() {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if let Some(b) = s.strip_prefix("origin/") {
                return b.to_string();
            }
        }
    }
    for b in ["main", "master"] {
        let ok = std::process::Command::new("git")
            .args(["rev-parse", "--verify", "--quiet", b])
            .current_dir(path)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if ok {
            return b.to_string();
        }
    }
    "main".to_string()
}
