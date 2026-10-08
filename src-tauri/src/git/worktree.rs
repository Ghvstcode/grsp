//! Session worktrees: detached, at headSha, used for reading only.

use super::{rev_parse, run_git, run_git_raw, GitResult, WorktreeCandidate, WORKTREE_MAX_AGE_DAYS};
use chrono::{DateTime, NaiveDateTime, Utc};
use std::path::{Path, PathBuf};

/// `{app_data}/worktrees/{session_id}`.
pub fn worktree_path(app_data_dir: &Path, session_id: &str) -> PathBuf {
    // Session ids are UUIDs; anything else is flattened so it can't leave the folder.
    let safe: String = session_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    app_data_dir.join("worktrees").join(safe)
}

/// Create a detached worktree at `head_sha`. Fails if `dest` already exists.
pub fn create_worktree(repo_path: &str, dest: &Path, head_sha: &str) -> GitResult<()> {
    if dest.exists() {
        return Err(format!(
            "Worktree folder already exists: {}",
            dest.display()
        ));
    }
    let sha = rev_parse(repo_path, head_sha)?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Couldn't create {}: {e}", parent.display()))?;
    }
    let repo = Path::new(repo_path);
    // Forget registrations whose folders were deleted behind git's back.
    let _ = run_git(repo, &["worktree", "prune"]);
    let dest_str = dest.to_string_lossy();
    run_git(
        repo,
        &["worktree", "add", "--detach", "--quiet", &dest_str, &sha],
    )
    .map_err(|e| format!("Couldn't create the worktree: {e}"))?;
    Ok(())
}

/// Make sure a worktree exists at `dest` checked out at `head_sha`,
/// recreating it when missing or at a different commit.
pub fn ensure_worktree(repo_path: &str, dest: &Path, head_sha: &str) -> GitResult<()> {
    if dest.is_dir() {
        let at = run_git(dest, &["rev-parse", "HEAD"]).unwrap_or_default();
        if at.trim() == head_sha {
            return Ok(());
        }
        remove_worktree(repo_path, dest)?;
    }
    create_worktree(repo_path, dest, head_sha)
}

/// Remove a worktree and its registration. Succeeds if it's already gone.
pub fn remove_worktree(repo_path: &str, dest: &Path) -> GitResult<()> {
    let repo = Path::new(repo_path);
    let repo_exists = repo.is_dir();
    if dest.exists() && repo_exists {
        let dest_str = dest.to_string_lossy();
        let _ = run_git_raw(repo, &["worktree", "remove", "--force", &dest_str]);
    }
    if dest.exists() {
        // Only ever delete folders grsp created: `…/worktrees/{id}`.
        let in_worktrees_dir = dest
            .parent()
            .and_then(Path::file_name)
            .is_some_and(|n| n == "worktrees");
        if !in_worktrees_dir {
            return Err(format!("Refusing to delete {}", dest.display()));
        }
        std::fs::remove_dir_all(dest)
            .map_err(|e| format!("Couldn't remove {}: {e}", dest.display()))?;
    }
    if repo_exists {
        let _ = run_git(repo, &["worktree", "prune"]);
    }
    Ok(())
}

fn parse_timestamp(s: &str) -> Option<DateTime<Utc>> {
    let s = s.trim();
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Utc));
    }
    for fmt in ["%Y-%m-%d %H:%M:%S%.f", "%Y-%m-%dT%H:%M:%S%.f"] {
        if let Ok(naive) = NaiveDateTime::parse_from_str(s, fmt) {
            return Some(naive.and_utc());
        }
    }
    None
}

/// True when `last_opened_at` is more than `max_age_days` before `now`.
/// Unparseable timestamps are never stale.
pub fn is_stale_timestamp(last_opened_at: &str, now: DateTime<Utc>, max_age_days: i64) -> bool {
    parse_timestamp(last_opened_at)
        .is_some_and(|t| now.signed_duration_since(t) > chrono::Duration::days(max_age_days))
}

/// Remove the worktrees of sessions untouched for `WORKTREE_MAX_AGE_DAYS`.
/// The caller supplies the candidates and clears `worktree_path` in the DB
/// for the returned session ids.
pub fn prune_stale_worktrees(candidates: &[WorktreeCandidate], now: DateTime<Utc>) -> Vec<String> {
    candidates
        .iter()
        .filter(|c| is_stale_timestamp(&c.last_opened_at, now, WORKTREE_MAX_AGE_DAYS))
        .filter(|c| remove_worktree(&c.repo_path, Path::new(&c.worktree_path)).is_ok())
        .map(|c| c.session_id.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::super::testutil::*;
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn lfs_files_check_out_as_pointers_without_git_lfs() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo(&repo);
        write(
            &repo,
            ".gitattributes",
            "*.docx filter=lfs diff=lfs merge=lfs -text\n",
        );
        let pointer = "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 12\n";
        write(&repo, "template.docx", pointer);
        write(&repo, "a.txt", "one\n");
        // Through run_git, so a global LFS setup on this machine can't interfere.
        run_git(&repo, &["add", "-A"]).unwrap();
        run_git(&repo, &["commit", "-q", "-m", "lfs"]).unwrap();
        let sha = run_git(&repo, &["rev-parse", "HEAD"])
            .unwrap()
            .trim()
            .to_string();
        // A repo set up for LFS on a machine where the filter can't run.
        run_git(&repo, &["config", "filter.lfs.required", "true"]).unwrap();
        run_git(
            &repo,
            &[
                "config",
                "filter.lfs.process",
                "git-lfs-not-installed filter-process",
            ],
        )
        .unwrap();
        run_git(
            &repo,
            &[
                "config",
                "filter.lfs.smudge",
                "git-lfs-not-installed smudge %f",
            ],
        )
        .unwrap();

        // `git lfs install` also leaves a post-checkout hook that fails
        // when git-lfs is missing.
        let hook = repo.join(".git/hooks/post-checkout");
        std::fs::create_dir_all(hook.parent().unwrap()).unwrap();
        std::fs::write(
            &hook,
            "#!/bin/sh\necho 'This repository is configured for Git LFS but git-lfs was not found' >&2\nexit 2\n",
        )
        .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
        }

        let dest = worktree_path(&tmp.path().join("appdata"), "lfs");
        create_worktree(repo.to_str().unwrap(), &dest, &sha).unwrap();
        assert_eq!(
            std::fs::read_to_string(dest.join("template.docx")).unwrap(),
            pointer
        );
        assert_eq!(
            std::fs::read_to_string(dest.join("a.txt")).unwrap(),
            "one\n"
        );
    }

    #[test]
    fn worktree_path_layout() {
        let p = worktree_path(Path::new("/data/app"), "abc-123");
        assert_eq!(p, PathBuf::from("/data/app/worktrees/abc-123"));
        let p = worktree_path(Path::new("/data/app"), "../../etc");
        assert_eq!(p, PathBuf::from("/data/app/worktrees/______etc"));
    }

    #[test]
    fn staleness() {
        let now = Utc.with_ymd_and_hms(2026, 3, 20, 12, 0, 0).unwrap();
        assert!(is_stale_timestamp("2026-03-01 10:00:00", now, 14));
        assert!(is_stale_timestamp("2026-03-01T10:00:00Z", now, 14));
        assert!(is_stale_timestamp("2026-03-06T11:59:59+00:00", now, 14));
        assert!(!is_stale_timestamp("2026-03-06T12:00:01Z", now, 14));
        assert!(!is_stale_timestamp("2026-03-19 10:00:00", now, 14));
        assert!(!is_stale_timestamp("garbage", now, 14));
    }

    #[test]
    fn create_ensure_remove_and_prune() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo(&repo);
        write(&repo, "a.txt", "one\n");
        let c1 = commit_all(&repo, "one");
        write(&repo, "a.txt", "two\n");
        let c2 = commit_all(&repo, "two");
        let rp = repo.to_str().unwrap();

        let dest = worktree_path(&tmp.path().join("appdata"), "s1");
        create_worktree(rp, &dest, &c1).unwrap();
        assert_eq!(
            std::fs::read_to_string(dest.join("a.txt")).unwrap(),
            "one\n"
        );
        // Detached, so the user's branches are untouched.
        assert!(run_git(&dest, &["symbolic-ref", "-q", "HEAD"]).is_err());
        assert!(create_worktree(rp, &dest, &c1).is_err());

        // Same sha: untouched. New sha: recreated.
        ensure_worktree(rp, &dest, &c1).unwrap();
        ensure_worktree(rp, &dest, &c2).unwrap();
        assert_eq!(
            std::fs::read_to_string(dest.join("a.txt")).unwrap(),
            "two\n"
        );

        // Folder deleted behind git's back: recreated on demand.
        std::fs::remove_dir_all(&dest).unwrap();
        ensure_worktree(rp, &dest, &c2).unwrap();
        assert!(dest.join("a.txt").exists());

        remove_worktree(rp, &dest).unwrap();
        assert!(!dest.exists());
        remove_worktree(rp, &dest).unwrap();
        assert!(!run_git(&repo, &["worktree", "list"])
            .unwrap()
            .contains("s1"));

        // Pruning: only the stale candidate goes.
        let old = worktree_path(&tmp.path().join("appdata"), "old");
        let fresh = worktree_path(&tmp.path().join("appdata"), "fresh");
        create_worktree(rp, &old, &c1).unwrap();
        create_worktree(rp, &fresh, &c2).unwrap();
        let now = Utc.with_ymd_and_hms(2026, 3, 20, 12, 0, 0).unwrap();
        let cands = vec![
            WorktreeCandidate {
                session_id: "old".into(),
                repo_path: rp.into(),
                worktree_path: old.to_string_lossy().into(),
                last_opened_at: "2026-03-01 00:00:00".into(),
            },
            WorktreeCandidate {
                session_id: "fresh".into(),
                repo_path: rp.into(),
                worktree_path: fresh.to_string_lossy().into(),
                last_opened_at: "2026-03-19T00:00:00Z".into(),
            },
        ];
        assert_eq!(prune_stale_worktrees(&cands, now), vec!["old".to_string()]);
        assert!(!old.exists());
        assert!(fresh.exists());
    }

    #[test]
    fn refuses_to_delete_outside_a_worktrees_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let victim = tmp.path().join("precious");
        std::fs::create_dir_all(&victim).unwrap();
        assert!(remove_worktree(tmp.path().join("no-repo").to_str().unwrap(), &victim).is_err());
        assert!(victim.exists());
    }
}
