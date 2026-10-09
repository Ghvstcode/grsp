//! Commits: a branch's recent history, and resolving one commit or a run of
//! commits to the base and head a review session is pinned to.

use super::{count_commits, git_cmd, rev_parse, run_git, run_git_raw, run_git_timeout, GitResult};
use crate::model::{CommitInfo, CommitList};
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

/// Commits listed when the caller doesn't say how many.
pub const COMMIT_LIST_DEFAULT: u32 = 50;
/// The most commits one listing returns.
pub const COMMIT_LIST_MAX: u32 = 200;
/// How long the best-effort fetch before a listing may take.
pub const COMMIT_FETCH_TIMEOUT: Duration = Duration::from_secs(8);
/// Commits of a reviewed run whose messages are kept for the description.
pub const RANGE_COMMITS_MAX: usize = 100;

/// One record per commit: a record separator, then unit-separated fields.
/// `--numstat` lines follow the last field. Control characters can't appear
/// in a path and are vanishingly unlikely in a message, unlike any printable
/// delimiter.
const LOG_FORMAT: &str = "--format=%x1e%H%x1f%P%x1f%an%x1f%aI%x1f%s%x1f%b%x1f";
const RECORD_SEP: char = '\x1e';
const FIELD_SEP: char = '\x1f';

fn short(sha: &str) -> &str {
    &sha[..sha.len().min(7)]
}

/// Parse `git log` output written with `LOG_FORMAT`, with or without
/// `--numstat`. Pure.
pub fn parse_commit_log(text: &str) -> Vec<CommitInfo> {
    text.split(RECORD_SEP)
        .filter_map(|record| {
            let mut fields = record.splitn(7, FIELD_SEP);
            let sha = fields.next()?.trim();
            if sha.len() < 7 || !sha.chars().all(|c| c.is_ascii_hexdigit()) {
                return None;
            }
            let parents = fields.next()?;
            let author = fields.next()?;
            let authored_at = fields.next()?;
            let subject = fields.next()?;
            let body = fields.next()?;
            let stats = fields.next().unwrap_or("");

            let (mut files_changed, mut added, mut removed) = (0u32, 0u32, 0u32);
            for line in stats.lines() {
                // "12\t3\tpath", or "-\t-\tpath" for a binary file.
                let mut cols = line.splitn(3, '\t');
                let (Some(a), Some(r), Some(_)) = (cols.next(), cols.next(), cols.next()) else {
                    continue;
                };
                let number = |s: &str| (s == "-").then_some(0).or_else(|| s.parse::<u32>().ok());
                let (Some(a), Some(r)) = (number(a), number(r)) else {
                    continue;
                };
                files_changed += 1;
                added = added.saturating_add(a);
                removed = removed.saturating_add(r);
            }
            Some(CommitInfo {
                sha: sha.to_string(),
                short_sha: short(sha).to_string(),
                subject: subject.trim().to_string(),
                body: body.trim().to_string(),
                author: author.trim().to_string(),
                authored_at: authored_at.trim().to_string(),
                files_changed,
                added,
                removed,
                is_merge: parents.split_whitespace().count() > 1,
            })
        })
        .collect()
}

/// `git log` for `revs`, newest first, at most `limit` commits.
fn read_log(dir: &Path, revs: &str, limit: usize, numstat: bool) -> GitResult<Vec<CommitInfo>> {
    let limit = limit.to_string();
    let run = |diff_merges: bool| {
        let mut args = vec![
            "-c",
            "log.showSignature=false",
            "-c",
            "core.quotepath=false",
            "log",
            "--no-color",
            "-n",
            &limit,
            LOG_FORMAT,
        ];
        if numstat {
            args.extend(["--numstat", "--no-ext-diff", "--no-textconv"]);
            if diff_merges {
                // A merge is measured against its first parent, the same
                // diff a review of that commit shows.
                args.push("--diff-merges=first-parent");
            }
        }
        args.extend([revs, "--"]);
        run_git(dir, &args)
    };
    let out = match run(true) {
        Ok(out) => out,
        // A git too old for --diff-merges still lists; merges show no stats.
        Err(_) if numstat => run(false)?,
        Err(e) => return Err(e),
    };
    Ok(parse_commit_log(&out))
}

fn valid_branch_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('-')
        && !name.contains("..")
        && !name
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || "~^:?*[\\".contains(c))
}

/// Recent commits on `branch`, newest first, with their diff totals.
///
/// The branch is fetched from its remote first so freshly pushed commits
/// show up. That is best effort: when it fails the list comes from what is
/// already here and `offline` is set. The remote-tracking branch is listed
/// when there is one, otherwise the local branch. `last_reviewed_sha` is
/// left for the caller, who knows the sessions.
pub fn list_commits(repo_path: &str, branch: &str, limit: Option<u32>) -> GitResult<CommitList> {
    let branch = branch.trim();
    if !valid_branch_name(branch) {
        return Err("Choose a branch.".to_string());
    }
    let dir = Path::new(repo_path);
    let limit = limit
        .unwrap_or(COMMIT_LIST_DEFAULT)
        .clamp(1, COMMIT_LIST_MAX);

    let remotes: Vec<String> = run_git(dir, &["remote"])
        .unwrap_or_default()
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    let has_local = rev_parse(repo_path, &format!("refs/heads/{branch}")).is_ok();
    // "origin/x" names a remote branch unless a local branch is called that.
    let named_remote = branch
        .split_once('/')
        .filter(|(remote, rest)| {
            !has_local && !rest.is_empty() && remotes.iter().any(|r| r == remote)
        })
        .map(|(remote, rest)| (remote.to_string(), rest.to_string()));
    let (remote, name) = match named_remote {
        Some((remote, rest)) => (Some(remote), rest),
        None => (
            remotes.iter().find(|r| *r == "origin").cloned(),
            branch.to_string(),
        ),
    };

    let mut offline = false;
    if let Some(remote) = &remote {
        let spec = format!("+refs/heads/{name}:refs/remotes/{remote}/{name}");
        let fetched = run_git_timeout(
            dir,
            &["fetch", "--no-tags", "--quiet", remote, &spec],
            COMMIT_FETCH_TIMEOUT,
        );
        offline = match fetched {
            Ok(out) if out.ok => false,
            // The remote answered: the branch just isn't there (local only).
            Ok(out) => !out
                .stderr
                .to_ascii_lowercase()
                .contains("couldn't find remote ref"),
            Err(_) => true,
        };
    }

    let tip = remote
        .as_ref()
        .and_then(|remote| rev_parse(repo_path, &format!("refs/remotes/{remote}/{name}")).ok())
        .or_else(|| rev_parse(repo_path, &format!("refs/heads/{name}")).ok())
        .or_else(|| rev_parse(repo_path, branch).ok())
        .ok_or_else(|| format!("Couldn't find branch {branch}."))?;

    let commits = read_log(dir, &tip, limit as usize, true)
        .map_err(|e| format!("Couldn't read the commits on {branch}: {e}"))?;
    Ok(CommitList {
        branch: branch.to_string(),
        commits,
        last_reviewed_sha: None,
        offline: offline.then_some(true),
    })
}

/// One commit or a run of commits, resolved for a review session.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitRange {
    /// First parent of the oldest commit; git's empty tree for a root commit.
    pub base_sha: String,
    pub head_sha: String,
    /// Commits in `base..head`.
    pub count: u32,
    /// The commits, oldest first. Only the newest `RANGE_COMMITS_MAX` of a
    /// longer run.
    pub commits: Vec<CommitInfo>,
    /// The oldest commit has no parent.
    pub from_root: bool,
}

/// True for git's empty tree (SHA-1 or SHA-256), the base of a review that
/// starts at a root commit.
pub fn is_empty_tree(sha: &str) -> bool {
    matches!(
        sha,
        "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
            | "6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321"
    )
}

/// The id of the empty tree in this repository's hash format.
fn empty_tree_sha(dir: &Path) -> GitResult<String> {
    let out = git_cmd(dir)
        .args(["hash-object", "-t", "tree", "--stdin"])
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("Couldn't run git: {e}"))?;
    let sha = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if out.status.success() && !sha.is_empty() {
        Ok(sha)
    } else {
        Err("Couldn't work out the empty tree.".to_string())
    }
}

/// Resolve `head` (and optionally `from`, the oldest commit to include) to
/// the base and head of a review. The base is the first parent of the oldest
/// commit, so a merge commit is reviewed as what it brought into its branch,
/// and a root commit is reviewed against the empty tree.
pub fn resolve_commit_range(
    repo_path: &str,
    head: &str,
    from: Option<&str>,
) -> GitResult<CommitRange> {
    let head = head.trim();
    if head.is_empty() {
        return Err("Choose a commit.".to_string());
    }
    let dir = Path::new(repo_path);
    let head_sha =
        rev_parse(repo_path, head).map_err(|_| format!("Couldn't find commit {head}."))?;
    let oldest = match from.map(str::trim).filter(|f| !f.is_empty()) {
        Some(from) => {
            let sha =
                rev_parse(repo_path, from).map_err(|_| format!("Couldn't find commit {from}."))?;
            let ancestor = run_git_raw(dir, &["merge-base", "--is-ancestor", &sha, &head_sha])?;
            if !ancestor.ok {
                return Err(format!(
                    "{} isn't in the history of {}, so they can't be reviewed as one run. Choose commits from the same branch, with the oldest first.",
                    short(&sha),
                    short(&head_sha)
                ));
            }
            sha
        }
        None => head_sha.clone(),
    };

    let parents = run_git(dir, &["rev-list", "--parents", "-n", "1", &oldest])
        .map_err(|e| format!("Couldn't read commit {}: {e}", short(&oldest)))?;
    let first_parent = parents.split_whitespace().nth(1).map(str::to_string);
    let (base_sha, from_root, revs) = match first_parent {
        Some(parent) => {
            let revs = format!("{parent}..{head_sha}");
            (parent, false, revs)
        }
        None => (empty_tree_sha(dir)?, true, head_sha.clone()),
    };
    let count = if from_root {
        run_git(dir, &["rev-list", "--count", &head_sha])?
            .trim()
            .parse::<u32>()
            .map_err(|_| "Couldn't count commits.".to_string())?
    } else {
        count_commits(repo_path, &base_sha, &head_sha)?
    };
    let mut commits = read_log(dir, &revs, RANGE_COMMITS_MAX, false)?;
    commits.reverse();
    if commits.is_empty() || count == 0 {
        return Err(format!("Couldn't read commit {}.", short(&head_sha)));
    }
    Ok(CommitRange {
        base_sha,
        head_sha,
        count,
        commits,
        from_root,
    })
}

// ── Session fields from commits ────────────────────────────

/// The session title: the subject of a single commit, or how many commits
/// and where they are.
pub fn commit_session_title(range: &CommitRange, branch: Option<&str>) -> String {
    if range.count <= 1 {
        let subject = range
            .commits
            .last()
            .map(|c| c.subject.trim())
            .unwrap_or_default();
        return if subject.is_empty() {
            format!("Commit {}", short(&range.head_sha))
        } else {
            subject.to_string()
        };
    }
    match branch.map(str::trim).filter(|b| !b.is_empty()) {
        Some(branch) => format!("{} commits on {branch}", range.count),
        None => format!(
            "{} commits ending at {}",
            range.count,
            short(&range.head_sha)
        ),
    }
}

/// What the author wrote: the body of a single commit's message, or for a
/// run a markdown list of every subject, oldest first, each with its body
/// indented beneath.
pub fn commit_session_description(range: &CommitRange) -> String {
    if range.count <= 1 {
        return range
            .commits
            .last()
            .map(|c| c.body.trim().to_string())
            .unwrap_or_default();
    }
    let mut out = String::new();
    let unlisted = (range.count as usize).saturating_sub(range.commits.len());
    if unlisted > 0 {
        out.push_str(&format!("- ({unlisted} earlier commits are not listed)\n"));
    }
    for c in &range.commits {
        let subject = if c.subject.trim().is_empty() {
            "(no message)"
        } else {
            c.subject.trim()
        };
        out.push_str(&format!("- {subject}\n"));
        let body = c.body.trim();
        if !body.is_empty() {
            out.push('\n');
            for line in body.lines() {
                if line.trim().is_empty() {
                    out.push('\n');
                } else {
                    out.push_str(&format!("  {}\n", line.trim_end()));
                }
            }
            out.push('\n');
        }
    }
    out.trim_end().to_string()
}

/// The author, or the distinct authors in order of first commit: up to
/// three names, then "+n".
pub fn commit_session_author(range: &CommitRange) -> String {
    let mut names: Vec<&str> = Vec::new();
    for c in &range.commits {
        let name = c.author.trim();
        if !name.is_empty() && !names.contains(&name) {
            names.push(name);
        }
    }
    if names.len() <= 3 {
        names.join(", ")
    } else {
        format!("{} +{}", names[..3].join(", "), names.len() - 3)
    }
}

#[cfg(test)]
mod tests {
    use super::super::testutil::*;
    use super::*;

    fn info(subject: &str, body: &str, author: &str) -> CommitInfo {
        CommitInfo {
            sha: "a".repeat(40),
            short_sha: "a".repeat(7),
            subject: subject.into(),
            body: body.into(),
            author: author.into(),
            ..Default::default()
        }
    }

    fn range(commits: Vec<CommitInfo>) -> CommitRange {
        CommitRange {
            base_sha: "b".repeat(40),
            head_sha: "c0ffee1".to_string() + &"0".repeat(33),
            count: commits.len() as u32,
            commits,
            from_root: false,
        }
    }

    #[test]
    fn log_records_parse_with_and_without_stats() {
        let sha1 = "1".repeat(40);
        let sha2 = "2".repeat(40);
        let text = format!(
            "\x1e{sha1}\x1f{sha2} {sha2}\x1fAna\x1f2026-10-01T10:00:00+02:00\x1fMerge it\x1fBody line\n\nSecond | para\x1f\n\n3\t1\ta.txt\n-\t-\tlogo.png\n0\t4\told name => new name\n\x1e{sha2}\x1f\x1fBo\x1f2026-09-30T09:00:00Z\x1fRoot\x1f\x1f\n"
        );
        let commits = parse_commit_log(&text);
        assert_eq!(commits.len(), 2);
        let c = &commits[0];
        assert_eq!(c.sha, sha1);
        assert_eq!(c.short_sha, "1111111");
        assert_eq!(c.subject, "Merge it");
        assert_eq!(c.body, "Body line\n\nSecond | para");
        assert_eq!(c.author, "Ana");
        assert_eq!(c.authored_at, "2026-10-01T10:00:00+02:00");
        assert!(c.is_merge);
        assert_eq!((c.files_changed, c.added, c.removed), (3, 3, 5));
        let root = &commits[1];
        assert!(!root.is_merge);
        assert_eq!(root.body, "");
        assert_eq!((root.files_changed, root.added, root.removed), (0, 0, 0));
        assert!(parse_commit_log("").is_empty());
        assert!(parse_commit_log("warning: something\n").is_empty());
    }

    #[test]
    fn single_commit_session_fields() {
        let r = range(vec![info(
            "Hold large orders",
            "Orders over the limit wait.\n\nRefs #4",
            "Ana",
        )]);
        assert_eq!(commit_session_title(&r, Some("main")), "Hold large orders");
        assert_eq!(
            commit_session_description(&r),
            "Orders over the limit wait.\n\nRefs #4"
        );
        assert_eq!(commit_session_author(&r), "Ana");

        // A subject on its own leaves nothing to compare the code against.
        let bare = range(vec![info("wip", "", "Ana")]);
        assert_eq!(commit_session_description(&bare), "");
        let untitled = range(vec![info("", "", "Ana")]);
        assert_eq!(commit_session_title(&untitled, None), "Commit c0ffee1");
    }

    #[test]
    fn a_run_of_commits_lists_subjects_oldest_first_with_bodies_indented() {
        let r = range(vec![
            info("Add the limit", "", "Ana"),
            info("Hold large orders", "First line.\n\n- a list item\n", "Bo"),
            info("Tidy", "", "Ana"),
        ]);
        assert_eq!(
            commit_session_title(&r, Some("feature/x")),
            "3 commits on feature/x"
        );
        assert_eq!(
            commit_session_title(&r, None),
            "3 commits ending at c0ffee1"
        );
        assert_eq!(
            commit_session_title(&r, Some("  ")),
            "3 commits ending at c0ffee1"
        );
        assert_eq!(
            commit_session_description(&r),
            "- Add the limit\n- Hold large orders\n\n  First line.\n\n  - a list item\n\n- Tidy"
        );
        assert_eq!(commit_session_author(&r), "Ana, Bo");

        let mut long = r.clone();
        long.count = 140;
        assert!(commit_session_description(&long)
            .starts_with("- (137 earlier commits are not listed)\n- Add the limit\n"));
    }

    #[test]
    fn authors_are_distinct_and_capped_at_three() {
        let many = range(
            ["Ana", "Bo", "Ana", "Cy", "Di", "Ed", " "]
                .iter()
                .map(|a| info("s", "", a))
                .collect(),
        );
        assert_eq!(commit_session_author(&many), "Ana, Bo, Cy +2");
        let three = range(
            ["Ana", "Bo", "Cy"]
                .iter()
                .map(|a| info("s", "", a))
                .collect(),
        );
        assert_eq!(commit_session_author(&three), "Ana, Bo, Cy");
    }

    /// main: root ── second ── third ──────── merge ── last
    ///                  └── side1 ── side2 ──┘
    struct Repo {
        _tmp: tempfile::TempDir,
        path: String,
        root: String,
        second: String,
        third: String,
        side2: String,
        merge: String,
        last: String,
    }

    fn history() -> Repo {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        init_repo(dir);
        write(dir, "a.txt", "one\n");
        let root = commit_all(dir, "Root commit");
        write(dir, "a.txt", "one\ntwo\n");
        write(dir, "b.txt", "b\n");
        git(dir, &["add", "-A"]);
        git(
            dir,
            &[
                "-c",
                "user.name=Second Author",
                "commit",
                "-q",
                "-m",
                "Second subject",
                "-m",
                "Body of the second commit.\n\nWith two paragraphs.",
            ],
        );
        let second = git(dir, &["rev-parse", "HEAD"]);
        git(dir, &["checkout", "-q", "-b", "side"]);
        write(dir, "side.txt", "s1\n");
        commit_all(dir, "Side one");
        write(dir, "side.txt", "s1\ns2\n");
        let side2 = commit_all(dir, "Side two");
        git(dir, &["checkout", "-q", "main"]);
        write(dir, "a.txt", "one\ntwo\nthree\n");
        let third = commit_all(dir, "Third");
        git(dir, &["merge", "-q", "--no-ff", "-m", "Merge side", "side"]);
        let merge = git(dir, &["rev-parse", "HEAD"]);
        std::fs::remove_file(dir.join("b.txt")).unwrap();
        let last = commit_all(dir, "Last");
        Repo {
            path: dir.to_str().unwrap().to_string(),
            _tmp: tmp,
            root,
            second,
            third,
            side2,
            merge,
            last,
        }
    }

    #[test]
    fn a_single_commit_is_reviewed_against_its_parent() {
        let r = history();
        let range = resolve_commit_range(&r.path, &r.second, None).unwrap();
        assert_eq!(range.base_sha, r.root);
        assert_eq!(range.head_sha, r.second);
        assert_eq!(range.count, 1);
        assert!(!range.from_root);
        assert_eq!(range.commits.len(), 1);
        assert_eq!(range.commits[0].subject, "Second subject");
        assert_eq!(
            range.commits[0].body,
            "Body of the second commit.\n\nWith two paragraphs."
        );
        assert_eq!(commit_session_title(&range, Some("main")), "Second subject");
        assert_eq!(commit_session_author(&range), "Second Author");

        // Short SHAs and refs resolve too; `from` equal to the head is one commit.
        let same = resolve_commit_range(&r.path, &r.second[..9], Some(&r.second)).unwrap();
        assert_eq!(same, range);
        assert_eq!(
            resolve_commit_range(&r.path, "main", None)
                .unwrap()
                .head_sha,
            r.last
        );
    }

    #[test]
    fn a_range_runs_from_the_parent_of_the_oldest_commit_to_the_head() {
        let r = history();
        let range = resolve_commit_range(&r.path, &r.third, Some(&r.second)).unwrap();
        assert_eq!(range.base_sha, r.root);
        assert_eq!(range.head_sha, r.third);
        assert_eq!(range.count, 2);
        let subjects: Vec<&str> = range.commits.iter().map(|c| c.subject.as_str()).collect();
        assert_eq!(subjects, ["Second subject", "Third"]);
        assert_eq!(
            commit_session_title(&range, Some("main")),
            "2 commits on main"
        );
        assert_eq!(
            commit_session_description(&range),
            "- Second subject\n\n  Body of the second commit.\n\n  With two paragraphs.\n\n- Third"
        );
        assert_eq!(commit_session_author(&range), "Second Author, grsp-test");

        // Across a merge the run includes what the merge brought in.
        let across = resolve_commit_range(&r.path, &r.last, Some(&r.third)).unwrap();
        assert_eq!(across.base_sha, r.second);
        assert_eq!(across.count, 5);
    }

    #[test]
    fn a_root_commit_is_reviewed_against_the_empty_tree() {
        let r = history();
        let range = resolve_commit_range(&r.path, &r.root, None).unwrap();
        assert!(range.from_root);
        assert_eq!(range.count, 1);
        assert_eq!(range.base_sha, "4b825dc642cb6eb9a060e54bf8d69288fbee4904");
        assert!(is_empty_tree(&range.base_sha));
        assert!(!is_empty_tree(&r.root));
        assert_eq!(range.commits[0].subject, "Root commit");

        // The whole file is new against the empty tree.
        let bundle =
            super::super::build_diff(Path::new(&r.path), &range.base_sha, &r.root).unwrap();
        assert_eq!(bundle.map.files.len(), 1);
        assert_eq!(bundle.map.files[0].path, "a.txt");
        assert_eq!(bundle.map.files[0].added_lines, vec![1]);
        assert_eq!(
            super::super::show_file_at(&r.path, &range.base_sha, "a.txt").unwrap(),
            None
        );

        // A run that starts at the root counts every commit up to the head.
        let from_root = resolve_commit_range(&r.path, &r.third, Some(&r.root)).unwrap();
        assert!(from_root.from_root);
        assert_eq!(from_root.count, 3);
        assert_eq!(from_root.commits.len(), 3);
        assert_eq!(from_root.commits[0].subject, "Root commit");
    }

    #[test]
    fn a_merge_commit_is_reviewed_against_its_first_parent() {
        let r = history();
        let range = resolve_commit_range(&r.path, &r.merge, None).unwrap();
        assert_eq!(range.base_sha, r.third, "first parent, not the side branch");
        assert_ne!(range.base_sha, r.side2);
        // The merge and the two side commits it brought in.
        assert_eq!(range.count, 3);
        let bundle =
            super::super::build_diff(Path::new(&r.path), &range.base_sha, &r.merge).unwrap();
        let paths: Vec<&str> = bundle.map.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, ["side.txt"]);
    }

    #[test]
    fn from_must_be_an_ancestor_of_head() {
        let r = history();
        // Newer than the head.
        let err = resolve_commit_range(&r.path, &r.second, Some(&r.third)).unwrap_err();
        assert!(err.contains("isn't in the history of"), "{err}");
        assert!(err.contains(&r.third[..7]), "{err}");
        // On a branch the head never merged.
        let err = resolve_commit_range(&r.path, &r.third, Some(&r.side2)).unwrap_err();
        assert!(err.contains("isn't in the history of"), "{err}");
        // Unknown and unsafe revisions.
        assert!(resolve_commit_range(&r.path, "nope", None)
            .unwrap_err()
            .contains("Couldn't find commit nope"));
        assert!(resolve_commit_range(&r.path, &r.last, Some("deadbeef")).is_err());
        assert!(resolve_commit_range(&r.path, "--all", None).is_err());
        assert!(resolve_commit_range(&r.path, "  ", None).is_err());
    }

    #[test]
    fn commits_are_listed_newest_first_with_totals() {
        let r = history();
        let list = list_commits(&r.path, "main", None).unwrap();
        assert_eq!(list.branch, "main");
        assert_eq!(
            list.offline, None,
            "no remote, so nothing to be offline from"
        );
        assert_eq!(list.last_reviewed_sha, None);
        let subjects: Vec<&str> = list.commits.iter().map(|c| c.subject.as_str()).collect();
        assert_eq!(subjects.first(), Some(&"Last"));
        assert_eq!(subjects.last(), Some(&"Root commit"));
        assert_eq!(list.commits.len(), 7);

        let by = |sha: &str| list.commits.iter().find(|c| c.sha == sha).unwrap().clone();
        let last = by(&r.last);
        assert_eq!((last.files_changed, last.added, last.removed), (1, 0, 1));
        assert!(!last.is_merge);
        assert_eq!(last.short_sha, &r.last[..7]);
        assert!(chrono::DateTime::parse_from_rfc3339(&last.authored_at).is_ok());

        let second = by(&r.second);
        assert_eq!(second.author, "Second Author");
        assert_eq!(
            second.body,
            "Body of the second commit.\n\nWith two paragraphs."
        );
        assert_eq!(
            (second.files_changed, second.added, second.removed),
            (2, 2, 0)
        );

        // A merge is measured against its first parent.
        let merge = by(&r.merge);
        assert!(merge.is_merge);
        assert_eq!((merge.files_changed, merge.added, merge.removed), (1, 2, 0));

        let two = list_commits(&r.path, "main", Some(2)).unwrap();
        assert_eq!(two.commits.len(), 2);
        assert_eq!(two.commits[0].sha, r.last);
        assert_eq!(
            list_commits(&r.path, "main", Some(0))
                .unwrap()
                .commits
                .len(),
            1
        );
        assert_eq!(
            list_commits(&r.path, "side", None).unwrap().commits.len(),
            4
        );

        assert!(list_commits(&r.path, "nope", None)
            .unwrap_err()
            .contains("Couldn't find branch nope"));
        for bad in ["", "--all", "a..b", "x:y"] {
            assert!(list_commits(&r.path, bad, None).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn listing_fetches_the_branch_and_prefers_the_remote_tracking_ref() {
        let tmp = tempfile::tempdir().unwrap();
        let origin = tmp.path().join("origin");
        std::fs::create_dir_all(&origin).unwrap();
        init_repo(&origin);
        write(&origin, "a.txt", "one\n");
        commit_all(&origin, "one");
        git(
            tmp.path(),
            &["clone", "-q", origin.to_str().unwrap(), "clone"],
        );
        let clone = tmp.path().join("clone");
        let p = clone.to_str().unwrap();

        // Pushed after the clone: only a fetch can show it.
        write(&origin, "a.txt", "one\ntwo\n");
        let pushed = commit_all(&origin, "two");
        let list = list_commits(p, "main", None).unwrap();
        assert_eq!(list.commits[0].sha, pushed);
        assert_eq!(list.offline, None);
        // "origin/main" names the same branch.
        let remote_form = list_commits(p, "origin/main", None).unwrap();
        assert_eq!(remote_form.commits[0].sha, pushed);
        assert_eq!(remote_form.branch, "origin/main");

        // A branch that only exists locally isn't "offline".
        git(&clone, &["checkout", "-q", "-b", "local-only"]);
        write(&clone, "b.txt", "b\n");
        let local = commit_all(&clone, "local work");
        let list = list_commits(p, "local-only", None).unwrap();
        assert_eq!(list.commits[0].sha, local);
        assert_eq!(list.offline, None);

        // The remote is unreachable: the list is what we already have.
        git(
            &clone,
            &[
                "remote",
                "set-url",
                "origin",
                tmp.path().join("gone").to_str().unwrap(),
            ],
        );
        let list = list_commits(p, "main", None).unwrap();
        assert_eq!(list.offline, Some(true));
        assert_eq!(list.commits[0].sha, pushed);
    }
}
