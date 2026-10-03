//! Repo inspection, branches and ref resolution.

use super::{
    detect_default_branch, parse_remote_url, run_git, run_git_raw, GitResult, ResolvedRefs,
};
use crate::model::{BranchList, RemoteInfo, RepoInspection};
use std::collections::HashMap;
use std::path::Path;

/// True when `path` is inside a git work tree.
pub fn is_git_repo(path: &str) -> bool {
    run_git(Path::new(path), &["rev-parse", "--is-inside-work-tree"])
        .map(|s| s.trim() == "true")
        .unwrap_or(false)
}

/// The parsed `origin` remote, if any.
pub fn origin_remote(path: &str) -> Option<RemoteInfo> {
    let url = run_git(Path::new(path), &["remote", "get-url", "origin"]).ok()?;
    parse_remote_url(url.trim())
}

/// Display labels by file extension. Only a label for the repo list — no
/// behaviour depends on it.
const LANGUAGE_LABELS: &[(&str, &str)] = &[
    ("py", "Python"),
    ("ts", "TypeScript"),
    ("tsx", "TypeScript"),
    ("mts", "TypeScript"),
    ("cts", "TypeScript"),
    ("js", "JavaScript"),
    ("jsx", "JavaScript"),
    ("mjs", "JavaScript"),
    ("cjs", "JavaScript"),
    ("rs", "Rust"),
    ("go", "Go"),
    ("java", "Java"),
    ("kt", "Kotlin"),
    ("kts", "Kotlin"),
    ("rb", "Ruby"),
    ("php", "PHP"),
    ("cs", "C#"),
    ("fs", "F#"),
    ("swift", "Swift"),
    ("m", "Objective-C"),
    ("mm", "Objective-C"),
    ("c", "C"),
    ("h", "C"),
    ("cc", "C++"),
    ("cpp", "C++"),
    ("cxx", "C++"),
    ("hpp", "C++"),
    ("scala", "Scala"),
    ("ex", "Elixir"),
    ("exs", "Elixir"),
    ("erl", "Erlang"),
    ("hs", "Haskell"),
    ("ml", "OCaml"),
    ("clj", "Clojure"),
    ("dart", "Dart"),
    ("lua", "Lua"),
    ("pl", "Perl"),
    ("r", "R"),
    ("jl", "Julia"),
    ("zig", "Zig"),
    ("sh", "Shell"),
    ("bash", "Shell"),
    ("sql", "SQL"),
    ("vue", "Vue"),
    ("svelte", "Svelte"),
    ("tf", "Terraform"),
    ("sol", "Solidity"),
];

/// Pure half of `dominant_language`: pick a label from a list of paths.
pub fn language_from_paths<'a>(paths: impl Iterator<Item = &'a str>) -> Option<String> {
    let mut counts: HashMap<&'static str, usize> = HashMap::new();
    for p in paths {
        if super::is_excluded_path(p, &[]) {
            continue;
        }
        let base = p.rsplit('/').next().unwrap_or(p);
        let Some((_, ext)) = base.rsplit_once('.') else {
            continue;
        };
        let ext = ext.to_ascii_lowercase();
        if let Some((_, label)) = LANGUAGE_LABELS.iter().find(|(e, _)| *e == ext) {
            *counts.entry(label).or_insert(0) += 1;
        }
    }
    counts
        .into_iter()
        // Highest count wins; ties break alphabetically so the label is stable.
        .max_by(|a, b| a.1.cmp(&b.1).then_with(|| b.0.cmp(a.0)))
        .map(|(label, _)| label.to_string())
}

/// Display-only dominant language guess from `git ls-files` extension counts.
pub fn dominant_language(path: &str) -> Option<String> {
    let out = run_git(Path::new(path), &["-c", "core.quotepath=false", "ls-files"]).ok()?;
    language_from_paths(out.lines())
}

/// Inspect a folder before adding it as a repo (SPEC §5.8). Never fails:
/// non-repos come back with `is_git_repo: false` and `error` set.
/// `remote` is only set for GitHub remotes.
pub fn inspect_repo(path: &str) -> RepoInspection {
    let dir = Path::new(path);
    let fallback_name = dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    if !dir.is_dir() {
        return RepoInspection {
            name: fallback_name,
            error: Some("That folder doesn't exist.".to_string()),
            ..Default::default()
        };
    }
    if !is_git_repo(path) {
        return RepoInspection {
            name: fallback_name,
            error: Some("This folder isn't a git repository.".to_string()),
            ..Default::default()
        };
    }
    let name = run_git(dir, &["rev-parse", "--show-toplevel"])
        .ok()
        .and_then(|top| {
            Path::new(top.trim())
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
        })
        .filter(|n| !n.is_empty())
        .unwrap_or(fallback_name);
    RepoInspection {
        is_git_repo: true,
        name,
        default_branch: detect_default_branch(path),
        remote: origin_remote(path).filter(RemoteInfo::is_github),
        language: dominant_language(path),
        error: None,
    }
}

/// Local and remote branches (`origin/x` form for remotes, no `HEAD` alias),
/// most recently committed first.
pub fn list_branches(path: &str) -> GitResult<BranchList> {
    let dir = Path::new(path);
    let refs = |prefix: &str| -> GitResult<Vec<String>> {
        let out = run_git(
            dir,
            &[
                "for-each-ref",
                "--sort=-committerdate",
                "--format=%(refname)",
                prefix,
            ],
        )?;
        Ok(out
            .lines()
            .filter_map(|l| l.trim().strip_prefix(prefix))
            .map(|l| l.trim_start_matches('/').to_string())
            .filter(|l| !l.is_empty() && !l.ends_with("/HEAD") && l != "HEAD")
            .collect())
    };
    Ok(BranchList {
        local: refs("refs/heads")?,
        remote: refs("refs/remotes")?,
        default_branch: detect_default_branch(path),
    })
}

/// Resolve any revision to a full commit SHA.
pub fn rev_parse(repo_path: &str, rev: &str) -> GitResult<String> {
    if rev.trim().is_empty() || rev.starts_with('-') {
        return Err(format!("Not a valid revision: {rev:?}"));
    }
    let spec = format!("{rev}^{{commit}}");
    let out = run_git_raw(
        Path::new(repo_path),
        &["rev-parse", "--verify", "--quiet", &spec],
    )?;
    let sha = out.stdout.trim();
    if out.ok && !sha.is_empty() {
        Ok(sha.to_string())
    } else {
        Err(format!("Couldn't find {rev} in this repository."))
    }
}

/// `git merge-base a b`.
pub fn merge_base(repo_path: &str, a: &str, b: &str) -> GitResult<String> {
    let out = run_git_raw(Path::new(repo_path), &["merge-base", a, b])?;
    let sha = out.stdout.trim();
    if out.ok && !sha.is_empty() {
        Ok(sha.to_string())
    } else {
        Err("These two revisions have no common history.".to_string())
    }
}

fn resolved(repo_path: &str, base_sha: String, head_sha: String) -> GitResult<ResolvedRefs> {
    let merge_base_sha = merge_base(repo_path, &base_sha, &head_sha)?;
    Ok(ResolvedRefs {
        base_sha,
        head_sha,
        merge_base_sha,
    })
}

/// The local ref a fetched PR head is kept under.
pub fn pr_ref(number: u64) -> String {
    format!("refs/grsp/pr/{number}")
}

/// Fetch a PR head (`git fetch origin pull/{n}/head`, kept under
/// `refs/grsp/pr/{n}` so the commit stays reachable) and its base branch,
/// then resolve base, head and merge-base SHAs.
pub fn fetch_pr(repo_path: &str, number: u64, base_ref: &str) -> GitResult<ResolvedRefs> {
    let dir = Path::new(repo_path);
    let local = pr_ref(number);
    let head_spec = format!("+refs/pull/{number}/head:{local}");
    run_git(
        dir,
        &["fetch", "--no-tags", "--quiet", "origin", &head_spec],
    )
    .map_err(|e| format!("Couldn't fetch pull/{number}/head from origin: {e}"))?;
    let head_sha = rev_parse(repo_path, &local)?;

    let base_ref = base_ref.trim();
    let base_ref = base_ref.strip_prefix("origin/").unwrap_or(base_ref);
    if base_ref.is_empty() || base_ref.starts_with('-') {
        return Err("The pull request has no base branch.".to_string());
    }
    let base_spec = format!("+refs/heads/{base_ref}:refs/remotes/origin/{base_ref}");
    // Best effort: an offline or renamed base still resolves from what we have.
    let fetched = run_git(
        dir,
        &["fetch", "--no-tags", "--quiet", "origin", &base_spec],
    );
    let base_sha = rev_parse(repo_path, &format!("refs/remotes/origin/{base_ref}"))
        .or_else(|_| rev_parse(repo_path, &format!("refs/heads/{base_ref}")))
        .map_err(|_| match fetched {
            Err(e) => format!("Couldn't fetch base branch {base_ref} from origin: {e}"),
            Ok(_) => format!("Couldn't find base branch {base_ref}."),
        })?;
    resolved(repo_path, base_sha, head_sha)
}

/// Pure half of `remote_pr_head_sha`: the SHA from `git ls-remote` output.
pub fn parse_ls_remote_sha(output: &str) -> Option<String> {
    let sha = output.lines().next()?.split_whitespace().next()?;
    (sha.len() >= 40 && sha.chars().all(|c| c.is_ascii_hexdigit())).then(|| sha.to_string())
}

/// Head SHA of a PR on the remote without fetching (`git ls-remote`).
pub fn remote_pr_head_sha(repo_path: &str, number: u64) -> GitResult<String> {
    let refname = format!("refs/pull/{number}/head");
    let out = run_git(Path::new(repo_path), &["ls-remote", "origin", &refname])
        .map_err(|e| format!("Couldn't reach origin: {e}"))?;
    parse_ls_remote_sha(&out)
        .ok_or_else(|| format!("Pull request #{number} wasn't found on origin."))
}

fn resolve_branch(repo_path: &str, name: &str) -> GitResult<String> {
    let name = name.trim();
    if name.is_empty() || name.starts_with('-') {
        return Err("Choose a branch.".to_string());
    }
    if let Ok(sha) = rev_parse(repo_path, &format!("refs/heads/{name}")) {
        return Ok(sha);
    }
    let dir = Path::new(repo_path);
    if let Some((remote, branch)) = name.split_once('/') {
        let remotes = run_git(dir, &["remote"]).unwrap_or_default();
        if remotes.lines().any(|r| r.trim() == remote) {
            let spec = format!("+refs/heads/{branch}:refs/remotes/{remote}/{branch}");
            // Best effort so a remote branch is current; offline still works.
            let _ = run_git(dir, &["fetch", "--no-tags", "--quiet", remote, &spec]);
            if let Ok(sha) = rev_parse(repo_path, &format!("refs/remotes/{name}")) {
                return Ok(sha);
            }
        }
    }
    rev_parse(repo_path, name).map_err(|_| format!("Couldn't find branch {name}."))
}

/// Branch-pair mode: resolve two local or remote (`origin/x`) branches.
/// Remote branches are fetched first, best-effort (works offline).
pub fn resolve_branch_pair(repo_path: &str, base: &str, head: &str) -> GitResult<ResolvedRefs> {
    let base_sha = resolve_branch(repo_path, base)?;
    let head_sha = resolve_branch(repo_path, head)?;
    resolved(repo_path, base_sha, head_sha)
}

/// Number of commits in `from..to`.
pub fn count_commits(repo_path: &str, from: &str, to: &str) -> GitResult<u32> {
    if from.starts_with('-') || to.starts_with('-') {
        return Err("Not a valid revision.".to_string());
    }
    let range = format!("{from}..{to}");
    let out = run_git(Path::new(repo_path), &["rev-list", "--count", &range])?;
    out.trim()
        .parse::<u32>()
        .map_err(|_| "Couldn't count commits.".to_string())
}

/// File content at a commit (`git show sha:path`). `Ok(None)` when the
/// path doesn't exist at that commit.
pub fn show_file_at(repo_path: &str, sha: &str, path: &str) -> GitResult<Option<String>> {
    if sha.is_empty() || sha.starts_with('-') {
        return Err("Not a valid revision.".to_string());
    }
    let spec = format!("{sha}:{path}");
    let out = run_git_raw(Path::new(repo_path), &["show", "--no-textconv", &spec])?;
    if out.ok {
        return Ok(Some(out.stdout));
    }
    let e = out.stderr.to_ascii_lowercase();
    if e.contains("does not exist") || e.contains("exists on disk, but not in") {
        Ok(None)
    } else {
        Err(out.stderr)
    }
}

#[cfg(test)]
mod tests {
    use super::super::testutil::*;
    use super::*;

    #[test]
    fn language_guess_counts_extensions() {
        let paths = [
            "a.py",
            "b/c.py",
            "d.ts",
            "README.md",
            "node_modules/x/y.js",
            "x.min.js",
        ];
        assert_eq!(
            language_from_paths(paths.into_iter()),
            Some("Python".into())
        );
        assert_eq!(
            language_from_paths(["README.md", "LICENSE"].into_iter()),
            None
        );
        assert_eq!(
            language_from_paths(["a.tsx", "b.ts", "c.py"].into_iter()),
            Some("TypeScript".into())
        );
    }

    #[test]
    fn ls_remote_parsing() {
        let sha = "0123456789abcdef0123456789abcdef01234567";
        assert_eq!(
            parse_ls_remote_sha(&format!("{sha}\trefs/pull/3/head\n")),
            Some(sha.to_string())
        );
        assert_eq!(parse_ls_remote_sha(""), None);
        assert_eq!(parse_ls_remote_sha("warning: something\n"), None);
    }

    #[test]
    fn inspect_non_repo_and_missing_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let r = inspect_repo(tmp.path().to_str().unwrap());
        assert!(!r.is_git_repo);
        assert!(r.error.is_some());
        let r = inspect_repo(tmp.path().join("nope").to_str().unwrap());
        assert!(!r.is_git_repo);
        assert!(r.error.is_some());
    }

    #[test]
    fn inspect_repo_reads_name_branch_remote_language() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("shop");
        std::fs::create_dir_all(&dir).unwrap();
        init_repo(&dir);
        write(&dir, "app/main.go", "package main\n");
        write(&dir, "app/util.go", "package main\n");
        write(&dir, "tool.py", "x = 1\n");
        commit_all(&dir, "init");
        git(
            &dir,
            &["remote", "add", "origin", "git@github.com:acme/shop.git"],
        );
        let r = inspect_repo(dir.to_str().unwrap());
        assert!(r.is_git_repo);
        assert_eq!(r.name, "shop");
        assert_eq!(r.default_branch, "main");
        assert_eq!(r.language.as_deref(), Some("Go"));
        let remote = r.remote.unwrap();
        assert_eq!(
            (
                remote.host.as_str(),
                remote.owner.as_str(),
                remote.name.as_str()
            ),
            ("github", "acme", "shop")
        );
    }

    #[test]
    fn non_github_remote_is_not_reported() {
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());
        git(
            tmp.path(),
            &["remote", "add", "origin", "git@gitlab.com:acme/shop.git"],
        );
        let p = tmp.path().to_str().unwrap();
        assert!(inspect_repo(p).remote.is_none());
        assert_eq!(origin_remote(p).unwrap().host, "gitlab.com");
    }

    #[test]
    fn branches_refs_and_commit_counts() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        let p = dir.to_str().unwrap();
        init_repo(dir);
        write(dir, "a.txt", "one\n");
        let c1 = commit_all(dir, "one");
        git(dir, &["checkout", "-q", "-b", "feature/x"]);
        write(dir, "a.txt", "one\ntwo\n");
        commit_all(dir, "two");
        write(dir, "a.txt", "one\ntwo\nthree\n");
        let c3 = commit_all(dir, "three");
        git(dir, &["checkout", "-q", "main"]);
        write(dir, "b.txt", "main moved\n");
        let m2 = commit_all(dir, "main moved");

        let branches = list_branches(p).unwrap();
        assert!(branches.local.contains(&"main".to_string()));
        assert!(branches.local.contains(&"feature/x".to_string()));
        assert_eq!(branches.default_branch, "main");

        let refs = resolve_branch_pair(p, "main", "feature/x").unwrap();
        assert_eq!(refs.base_sha, m2);
        assert_eq!(refs.head_sha, c3);
        assert_eq!(refs.merge_base_sha, c1);
        assert_eq!(count_commits(p, &c1, &c3).unwrap(), 2);
        assert_eq!(count_commits(p, &c3, &c3).unwrap(), 0);
        assert!(resolve_branch_pair(p, "main", "nope").is_err());
        assert!(rev_parse(p, "--version").is_err());

        assert_eq!(
            show_file_at(p, &c1, "a.txt").unwrap().as_deref(),
            Some("one\n")
        );
        assert_eq!(show_file_at(p, &c1, "b.txt").unwrap(), None);
    }

    #[test]
    fn fetch_pr_and_remote_branches_from_a_local_origin() {
        let tmp = tempfile::tempdir().unwrap();
        let origin = tmp.path().join("origin");
        std::fs::create_dir_all(&origin).unwrap();
        init_repo(&origin);
        write(&origin, "a.txt", "one\n");
        let base = commit_all(&origin, "one");
        git(&origin, &["checkout", "-q", "-b", "pr-branch"]);
        write(&origin, "a.txt", "one\ntwo\n");
        let head = commit_all(&origin, "two");
        git(&origin, &["update-ref", "refs/pull/7/head", &head]);
        git(&origin, &["checkout", "-q", "main"]);

        let clone = tmp.path().join("clone");
        git(
            tmp.path(),
            &["clone", "-q", origin.to_str().unwrap(), "clone"],
        );
        let p = clone.to_str().unwrap();

        assert_eq!(remote_pr_head_sha(p, 7).unwrap(), head);
        assert!(remote_pr_head_sha(p, 8).is_err());

        let refs = fetch_pr(p, 7, "main").unwrap();
        assert_eq!(refs.head_sha, head);
        assert_eq!(refs.base_sha, base);
        assert_eq!(refs.merge_base_sha, base);
        assert!(fetch_pr(p, 99, "main").is_err());

        let branches = list_branches(p).unwrap();
        assert!(branches.remote.contains(&"origin/main".to_string()));
        assert!(!branches.remote.iter().any(|b| b.ends_with("HEAD")));
        let pair = resolve_branch_pair(p, "origin/main", "origin/pr-branch").unwrap();
        assert_eq!(pair.head_sha, head);
    }
}
