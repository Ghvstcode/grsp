//! GitHub via the `gh` CLI, the way sustn does it: `gh` carries the user's
//! auth, so grsp stores no tokens.
//!
//! Every network function has a matching `parse_*` function that takes JSON
//! text, so the parsing is unit-testable without `gh`.

use std::collections::BTreeMap;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

use crate::agent::detect;
use crate::model::{
    CiState, CiStatus, DiscussionComment, DiscussionThread, GithubStatus, OpenPr, PostedReview,
    PrState, ReviewEvent,
};

const GH_TIMEOUT: Duration = Duration::from_secs(60);

// ── Running gh ─────────────────────────────────────────────

pub fn gh_binary() -> Option<PathBuf> {
    detect::resolve_binary("gh")
}

fn clean_gh_error(stderr: &str, stdout: &str) -> String {
    // `gh api` prints the API's JSON error body on stdout and a one-line
    // summary on stderr ("gh: Not Found (HTTP 404)").
    let from_body = serde_json::from_str::<Value>(stdout).ok().and_then(|v| {
        let msg = v.get("message").and_then(Value::as_str)?.to_string();
        let extra: Vec<String> = v
            .get("errors")
            .and_then(Value::as_array)
            .map(|errs| {
                errs.iter()
                    .filter_map(|e| {
                        e.as_str()
                            .map(String::from)
                            .or_else(|| e.get("message").and_then(Value::as_str).map(String::from))
                    })
                    .collect()
            })
            .unwrap_or_default();
        Some(if extra.is_empty() {
            msg
        } else {
            format!("{msg}: {}", extra.join("; "))
        })
    });
    let line = stderr
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("")
        .trim_start_matches("gh: ")
        .to_string();
    match from_body {
        Some(b) if !b.is_empty() => b,
        _ if !line.is_empty() => line,
        _ => "GitHub request failed".to_string(),
    }
}

/// Run `gh` with the given args, optionally piping `stdin`. Returns stdout.
pub fn run_gh(args: &[&str], stdin: Option<&str>) -> Result<String, String> {
    let gh = gh_binary().ok_or_else(|| {
        "The GitHub CLI (gh) isn't installed. Install it from https://cli.github.com and run `gh auth login`.".to_string()
    })?;
    let mut cmd = Command::new(&gh);
    cmd.args(args)
        .stdin(if stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_NO_UPDATE_NOTIFIER", "1")
        .env("NO_COLOR", "1");
    cmd.env("PATH", detect::child_path());
    let mut child = cmd.spawn().map_err(|e| format!("Couldn't run gh: {e}"))?;
    if let (Some(input), Some(mut pipe)) = (stdin, child.stdin.take()) {
        pipe.write_all(input.as_bytes())
            .map_err(|e| format!("Couldn't send the request to gh: {e}"))?;
    }
    // Drain the pipes on threads so a large response can't deadlock the wait.
    let mut out_pipe = child.stdout.take();
    let mut err_pipe = child.stderr.take();
    let out_thread = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(p) = out_pipe.as_mut() {
            let _ = std::io::Read::read_to_end(p, &mut buf);
        }
        buf
    });
    let err_thread = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(p) = err_pipe.as_mut() {
            let _ = std::io::Read::read_to_end(p, &mut buf);
        }
        buf
    });
    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) => {
                if start.elapsed() > GH_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(
                        "GitHub didn't respond in time. Check your connection and retry."
                            .to_string(),
                    );
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(e) => return Err(format!("Couldn't run gh: {e}")),
        }
    };
    let stdout = String::from_utf8_lossy(&out_thread.join().unwrap_or_default()).to_string();
    let stderr = String::from_utf8_lossy(&err_thread.join().unwrap_or_default()).to_string();
    if status.success() {
        Ok(stdout)
    } else {
        Err(clean_gh_error(&stderr, &stdout))
    }
}

fn api_get(endpoint: &str) -> Result<String, String> {
    run_gh(&["api", endpoint], None)
}

/// GET a list endpoint across all pages. `--slurp` wraps the pages in an
/// outer array; the parsers flatten it.
fn api_get_all(endpoint: &str) -> Result<String, String> {
    run_gh(&["api", "--paginate", "--slurp", endpoint], None)
}

// ── JSON helpers ───────────────────────────────────────────

fn parse(json: &str) -> Result<Value, String> {
    serde_json::from_str(json).map_err(|e| format!("Unexpected response from GitHub: {e}"))
}

fn s(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

/// The account's login. App accounts always end in "[bot]": REST already
/// returns them that way, GraphQL returns the bare login with a `Bot` type.
fn login_of(v: &Value, key: &str) -> String {
    let Some(user) = v.get(key) else {
        return "ghost".to_string();
    };
    let login = user.get("login").and_then(Value::as_str).unwrap_or("ghost");
    let is_bot = ["__typename", "type"]
        .iter()
        .any(|k| user.get(k).and_then(Value::as_str) == Some("Bot"));
    if is_bot && !login.ends_with("[bot]") {
        format!("{login}[bot]")
    } else {
        login.to_string()
    }
}

/// A list response: a flat array, or `--slurp`'s array of page arrays.
fn items(v: &Value) -> Vec<&Value> {
    match v.as_array() {
        Some(arr) if arr.iter().all(Value::is_array) && !arr.is_empty() => {
            arr.iter().filter_map(Value::as_array).flatten().collect()
        }
        Some(arr) => arr.iter().collect(),
        None => Vec::new(),
    }
}

// ── Status ─────────────────────────────────────────────────

/// gh installed, authenticated, and as whom.
pub fn status() -> GithubStatus {
    if gh_binary().is_none() {
        return GithubStatus {
            gh_installed: false,
            authenticated: false,
            login: None,
        };
    }
    match api_get("user") {
        Ok(json) => {
            let login = parse_login(&json);
            GithubStatus {
                gh_installed: true,
                authenticated: login.is_some(),
                login,
            }
        }
        Err(_) => GithubStatus {
            gh_installed: true,
            authenticated: false,
            login: None,
        },
    }
}

pub fn parse_login(user_json: &str) -> Option<String> {
    let v = parse(user_json).ok()?;
    v.get("login")
        .and_then(Value::as_str)
        .filter(|l| !l.is_empty())
        .map(String::from)
}

// ── Open PRs ───────────────────────────────────────────────

pub fn list_open_prs(owner: &str, name: &str) -> Result<Vec<OpenPr>, String> {
    let json = api_get(&format!(
        "repos/{owner}/{name}/pulls?state=open&sort=updated&direction=desc&per_page=50"
    ))?;
    parse_open_prs(&json)
}

pub fn parse_open_prs(json: &str) -> Result<Vec<OpenPr>, String> {
    let v = parse(json)?;
    Ok(items(&v)
        .into_iter()
        .filter_map(|pr| {
            Some(OpenPr {
                number: pr.get("number")?.as_u64()?,
                title: s(pr, "title"),
                author: login_of(pr, "user"),
                updated_at: s(pr, "updated_at"),
                url: s(pr, "html_url"),
                head_ref: pr.get("head").map(|h| s(h, "ref")).unwrap_or_default(),
                base_ref: pr.get("base").map(|b| s(b, "ref")).unwrap_or_default(),
                is_draft: pr.get("draft").and_then(Value::as_bool).unwrap_or(false),
            })
        })
        .collect())
}

// ── PR metadata ────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PrMeta {
    pub number: u64,
    pub title: String,
    pub body: String,
    pub author: String,
    pub base_ref: String,
    pub head_ref: String,
    pub base_sha: String,
    pub head_sha: String,
    pub state: PrState,
    pub merged: bool,
    pub draft: bool,
    pub url: String,
}

pub fn pr_meta(owner: &str, name: &str, number: u64) -> Result<PrMeta, String> {
    let json = api_get(&format!("repos/{owner}/{name}/pulls/{number}"))?;
    parse_pr_meta(&json)
}

pub fn parse_pr_meta(json: &str) -> Result<PrMeta, String> {
    let v = parse(json)?;
    let number = v
        .get("number")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Unexpected response from GitHub: no pull request number".to_string())?;
    let merged = v.get("merged").and_then(Value::as_bool).unwrap_or(false)
        || v.get("merged_at").is_some_and(|m| !m.is_null());
    let state = if merged {
        PrState::Merged
    } else if s(&v, "state") == "closed" {
        PrState::Closed
    } else {
        PrState::Open
    };
    let side = |k: &str, f: &str| v.get(k).map(|x| s(x, f)).unwrap_or_default();
    Ok(PrMeta {
        number,
        title: s(&v, "title"),
        body: s(&v, "body"),
        author: login_of(&v, "user"),
        base_ref: side("base", "ref"),
        head_ref: side("head", "ref"),
        base_sha: side("base", "sha"),
        head_sha: side("head", "sha"),
        state,
        merged,
        draft: v.get("draft").and_then(Value::as_bool).unwrap_or(false),
        url: s(&v, "html_url"),
    })
}

/// The PR's current head SHA (stale detection, SPEC §2.3).
pub fn head_sha(owner: &str, name: &str, number: u64) -> Result<String, String> {
    pr_meta(owner, name, number).map(|m| m.head_sha)
}

/// Commits on `head` that aren't on `base` (the "3 new commits" bar).
pub fn commits_between(owner: &str, name: &str, base: &str, head: &str) -> Result<u32, String> {
    let json = api_get(&format!("repos/{owner}/{name}/compare/{base}...{head}"))?;
    parse_ahead_by(&json)
}

pub fn parse_ahead_by(json: &str) -> Result<u32, String> {
    let v = parse(json)?;
    Ok(v.get("ahead_by").and_then(Value::as_u64).unwrap_or(0) as u32)
}

// ── CI ─────────────────────────────────────────────────────

pub fn ci_status(owner: &str, name: &str, sha: &str) -> CiStatus {
    let runs = api_get(&format!(
        "repos/{owner}/{name}/commits/{sha}/check-runs?per_page=100"
    ))
    .ok();
    let combined = api_get(&format!("repos/{owner}/{name}/commits/{sha}/status")).ok();
    parse_ci(runs.as_deref(), combined.as_deref())
}

/// Combine check runs and the legacy combined status into passed/total/state.
pub fn parse_ci(check_runs_json: Option<&str>, combined_status_json: Option<&str>) -> CiStatus {
    let mut passed = 0u32;
    let mut total = 0u32;
    let mut failed = 0u32;
    let mut pending = 0u32;

    if let Some(v) = check_runs_json.and_then(|j| parse(j).ok()) {
        for run in v
            .get("check_runs")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            total += 1;
            if s(run, "status") != "completed" {
                pending += 1;
                continue;
            }
            match s(run, "conclusion").as_str() {
                "success" | "neutral" | "skipped" => passed += 1,
                _ => failed += 1,
            }
        }
    }
    if let Some(v) = combined_status_json.and_then(|j| parse(j).ok()) {
        for st in v
            .get("statuses")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            total += 1;
            match s(st, "state").as_str() {
                "success" => passed += 1,
                "pending" => pending += 1,
                _ => failed += 1,
            }
        }
    }

    let state = if total == 0 {
        CiState::None
    } else if failed > 0 {
        CiState::Failing
    } else if pending > 0 {
        CiState::Pending
    } else {
        CiState::Passing
    };
    CiStatus {
        state,
        passed,
        total,
    }
}

// ── Discussion ─────────────────────────────────────────────

const REVIEW_THREADS_QUERY: &str = "query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { reviewThreads(first: 100) { nodes { id isResolved isOutdated path line originalLine comments(first: 100) { nodes { databaseId author { __typename login } body createdAt } } } } } } }";

/// Raw JSON for everything the Discussion section shows.
#[derive(Debug, Clone, Default)]
pub struct DiscussionJson {
    /// GraphQL `reviewThreads` (resolved state). `None` if the query failed.
    pub review_threads: Option<String>,
    /// REST review comments; the fallback when GraphQL is unavailable.
    pub review_comments: Option<String>,
    pub issue_comments: Option<String>,
    pub reviews: Option<String>,
}

pub fn fetch_discussion(owner: &str, name: &str, number: u64) -> Result<DiscussionJson, String> {
    let review_threads = run_gh(
        &[
            "api",
            "graphql",
            "-f",
            &format!("query={REVIEW_THREADS_QUERY}"),
            "-F",
            &format!("owner={owner}"),
            "-F",
            &format!("name={name}"),
            "-F",
            &format!("number={number}"),
        ],
        None,
    )
    .ok();
    let review_comments = if review_threads.is_none() {
        Some(api_get_all(&format!(
            "repos/{owner}/{name}/pulls/{number}/comments?per_page=100"
        ))?)
    } else {
        None
    };
    let issue_comments = api_get_all(&format!(
        "repos/{owner}/{name}/issues/{number}/comments?per_page=100"
    ))?;
    let reviews = api_get_all(&format!(
        "repos/{owner}/{name}/pulls/{number}/reviews?per_page=100"
    ))?;
    Ok(DiscussionJson {
        review_threads,
        review_comments,
        issue_comments: Some(issue_comments),
        reviews: Some(reviews),
    })
}

fn first_created(t: &DiscussionThread) -> String {
    t.comments
        .first()
        .map(|c| c.created_at.clone())
        .unwrap_or_default()
}

/// Threads from GraphQL `reviewThreads`, with resolved state.
pub fn parse_review_threads(graphql_json: &str) -> Result<Vec<DiscussionThread>, String> {
    let v = parse(graphql_json)?;
    let nodes = v
        .pointer("/data/repository/pullRequest/reviewThreads/nodes")
        .and_then(Value::as_array)
        .ok_or_else(|| "Unexpected response from GitHub: no review threads".to_string())?;
    Ok(nodes
        .iter()
        .filter_map(|t| {
            let comments: Vec<DiscussionComment> = t
                .pointer("/comments/nodes")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .map(|c| DiscussionComment {
                    id: c
                        .get("databaseId")
                        .and_then(Value::as_u64)
                        .map(|n| n.to_string())
                        .unwrap_or_default(),
                    author: login_of(c, "author"),
                    body: s(c, "body"),
                    created_at: s(c, "createdAt"),
                })
                .collect();
            if comments.is_empty() {
                return None;
            }
            let line = t
                .get("line")
                .and_then(Value::as_u64)
                .or_else(|| t.get("originalLine").and_then(Value::as_u64))
                .map(|n| n as u32);
            Some(DiscussionThread {
                id: s(t, "id"),
                path: Some(s(t, "path")).filter(|p| !p.is_empty()),
                line,
                resolved: t
                    .get("isResolved")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                gist: None,
                comments,
            })
        })
        .collect())
}

/// Threads rebuilt from REST review comments (no resolved state available).
pub fn parse_review_comments(json: &str) -> Result<Vec<DiscussionThread>, String> {
    let v = parse(json)?;
    let mut order: Vec<u64> = Vec::new();
    let mut threads: BTreeMap<u64, DiscussionThread> = BTreeMap::new();
    // Replies point at the thread's first comment via in_reply_to_id.
    let mut list = items(&v);
    list.sort_by_key(|c| s(c, "created_at"));
    for c in list {
        let Some(id) = c.get("id").and_then(Value::as_u64) else {
            continue;
        };
        let root = c
            .get("in_reply_to_id")
            .and_then(Value::as_u64)
            .unwrap_or(id);
        let comment = DiscussionComment {
            id: id.to_string(),
            author: login_of(c, "user"),
            body: s(c, "body"),
            created_at: s(c, "created_at"),
        };
        let thread = threads.entry(root).or_insert_with(|| {
            order.push(root);
            DiscussionThread {
                id: format!("thread-{root}"),
                path: Some(s(c, "path")).filter(|p| !p.is_empty()),
                line: c
                    .get("line")
                    .and_then(Value::as_u64)
                    .or_else(|| c.get("original_line").and_then(Value::as_u64))
                    .map(|n| n as u32),
                resolved: false,
                gist: None,
                comments: Vec::new(),
            }
        });
        thread.comments.push(comment);
    }
    Ok(order
        .into_iter()
        .filter_map(|id| threads.remove(&id))
        .collect())
}

/// Each issue comment is its own location-less thread.
pub fn parse_issue_comments(json: &str) -> Result<Vec<DiscussionThread>, String> {
    let v = parse(json)?;
    Ok(items(&v)
        .into_iter()
        .filter_map(|c| {
            let id = c.get("id").and_then(Value::as_u64)?;
            Some(DiscussionThread {
                id: format!("issue-{id}"),
                path: None,
                line: None,
                resolved: false,
                gist: None,
                comments: vec![DiscussionComment {
                    id: id.to_string(),
                    author: login_of(c, "user"),
                    body: s(c, "body"),
                    created_at: s(c, "created_at"),
                }],
            })
        })
        .collect())
}

/// Reviews that carry a body become location-less threads. Reviews with no
/// body only exist to group inline comments, which the threads already show.
pub fn parse_review_bodies(json: &str) -> Result<Vec<DiscussionThread>, String> {
    let v = parse(json)?;
    Ok(items(&v)
        .into_iter()
        .filter_map(|r| {
            let id = r.get("id").and_then(Value::as_u64)?;
            let body = s(r, "body");
            if body.trim().is_empty() || s(r, "state") == "PENDING" {
                return None;
            }
            Some(DiscussionThread {
                id: format!("review-{id}"),
                path: None,
                line: None,
                resolved: false,
                gist: None,
                comments: vec![DiscussionComment {
                    id: id.to_string(),
                    author: login_of(r, "user"),
                    body,
                    created_at: s(r, "submitted_at"),
                }],
            })
        })
        .collect())
}

/// All threads, oldest first: review threads (GraphQL, else REST), issue
/// comments and review bodies. These are API facts; the agent only adds gists.
pub fn build_threads(d: &DiscussionJson) -> Vec<DiscussionThread> {
    let mut threads = d
        .review_threads
        .as_deref()
        .and_then(|j| parse_review_threads(j).ok())
        .or_else(|| {
            d.review_comments
                .as_deref()
                .and_then(|j| parse_review_comments(j).ok())
        })
        .unwrap_or_default();
    if let Some(j) = d.issue_comments.as_deref() {
        threads.extend(parse_issue_comments(j).unwrap_or_default());
    }
    if let Some(j) = d.reviews.as_deref() {
        threads.extend(parse_review_bodies(j).unwrap_or_default());
    }
    threads.sort_by_key(first_created);
    threads
}

pub fn comment_count(threads: &[DiscussionThread]) -> u32 {
    threads.iter().map(|t| t.comments.len() as u32).sum()
}

/// Fetch and assemble the discussion threads for a PR.
pub fn discussion_threads(
    owner: &str,
    name: &str,
    number: u64,
) -> Result<Vec<DiscussionThread>, String> {
    Ok(build_threads(&fetch_discussion(owner, name, number)?))
}

// ── Posting a review ───────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ReviewComment {
    pub path: String,
    pub line: u32,
    /// Always "RIGHT": grsp only anchors on the head side.
    pub side: String,
    pub body: String,
}

impl ReviewComment {
    pub fn new(path: &str, line: u32, body: &str) -> Self {
        Self {
            path: path.to_string(),
            line,
            side: "RIGHT".to_string(),
            body: body.to_string(),
        }
    }
}

/// Body of `POST /repos/{owner}/{repo}/pulls/{n}/reviews`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ReviewPayload {
    pub commit_id: String,
    pub event: ReviewEvent,
    pub body: String,
    pub comments: Vec<ReviewComment>,
}

fn event_from_state(state: &str) -> ReviewEvent {
    match state {
        "APPROVED" => ReviewEvent::Approve,
        "CHANGES_REQUESTED" => ReviewEvent::RequestChanges,
        _ => ReviewEvent::Comment,
    }
}

fn posted_from(v: &Value) -> Option<PostedReview> {
    let id = v.get("id").and_then(Value::as_u64)?;
    Some(PostedReview {
        id: id.to_string(),
        url: s(v, "html_url"),
        event: event_from_state(&s(v, "state")),
    })
}

pub fn parse_posted_review(json: &str) -> Result<PostedReview, String> {
    let v = parse(json)?;
    posted_from(&v).ok_or_else(|| "GitHub accepted the review but returned no id".to_string())
}

/// A submitted review by `login` on `commit_id`, if one exists. The newest
/// wins. Pending (unsubmitted) reviews don't count.
pub fn find_existing_review(
    reviews_json: &str,
    login: &str,
    commit_id: &str,
) -> Result<Option<PostedReview>, String> {
    let v = parse(reviews_json)?;
    Ok(items(&v)
        .into_iter()
        .filter(|r| {
            login_of(r, "user").eq_ignore_ascii_case(login)
                && s(r, "commit_id") == commit_id
                && s(r, "state") != "PENDING"
        })
        .filter_map(posted_from)
        .next_back())
}

/// Double-post guard (SPEC §5.6): has this user already reviewed this commit?
pub fn existing_review(
    owner: &str,
    name: &str,
    number: u64,
    login: &str,
    commit_id: &str,
) -> Result<Option<PostedReview>, String> {
    let json = api_get_all(&format!(
        "repos/{owner}/{name}/pulls/{number}/reviews?per_page=100"
    ))?;
    find_existing_review(&json, login, commit_id)
}

/// Raw JSON of every review on the PR (all pages).
pub fn reviews_json(owner: &str, name: &str, number: u64) -> Result<String, String> {
    api_get_all(&format!(
        "repos/{owner}/{name}/pulls/{number}/reviews?per_page=100"
    ))
}

/// One call to the "create a review" endpoint, JSON passed on stdin.
pub fn post_review(
    owner: &str,
    name: &str,
    number: u64,
    payload: &ReviewPayload,
) -> Result<PostedReview, String> {
    let body = serde_json::to_string(payload).map_err(|e| e.to_string())?;
    let out = run_gh(
        &[
            "api",
            &format!("repos/{owner}/{name}/pulls/{number}/reviews"),
            "--method",
            "POST",
            "--input",
            "-",
        ],
        Some(&body),
    )?;
    let mut posted = parse_posted_review(&out)?;
    // The response's state reflects the event; keep the one the user chose
    // in case GitHub reports COMMENTED for an empty approval.
    posted.event = payload.event;
    Ok(posted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn graphql_bot_authors_get_the_bot_suffix() {
        let v: Value = serde_json::from_str(
            r#"{"a": {"__typename": "Bot", "login": "coderabbitai"},
                "b": {"type": "Bot", "login": "github-actions[bot]"},
                "c": {"__typename": "User", "login": "maya"}}"#,
        )
        .unwrap();
        assert_eq!(login_of(&v, "a"), "coderabbitai[bot]");
        assert_eq!(login_of(&v, "b"), "github-actions[bot]");
        assert_eq!(login_of(&v, "c"), "maya");
        assert_eq!(login_of(&v, "missing"), "ghost");
    }

    #[test]
    fn open_prs_are_parsed() {
        let j = json!([
            {"number": 482, "title": "Require approval", "user": {"login": "maya"},
             "updated_at": "2026-05-01T10:00:00Z", "html_url": "https://github.com/o/r/pull/482",
             "head": {"ref": "feat/approval", "sha": "h"}, "base": {"ref": "main", "sha": "b"}, "draft": true},
            {"title": "no number"}
        ])
        .to_string();
        let prs = parse_open_prs(&j).unwrap();
        assert_eq!(prs.len(), 1);
        assert_eq!(prs[0].number, 482);
        assert_eq!(prs[0].author, "maya");
        assert_eq!(prs[0].head_ref, "feat/approval");
        assert_eq!(prs[0].base_ref, "main");
        assert!(prs[0].is_draft);
    }

    #[test]
    fn pr_meta_states() {
        let base = json!({
            "number": 7, "title": "T", "body": null, "user": {"login": "sam"},
            "base": {"ref": "main", "sha": "aaa"}, "head": {"ref": "topic", "sha": "bbb"},
            "state": "open", "merged": false, "draft": false, "html_url": "u"
        });
        let m = parse_pr_meta(&base.to_string()).unwrap();
        assert_eq!(
            (m.number, m.body.as_str(), m.author.as_str()),
            (7, "", "sam")
        );
        assert_eq!((m.base_sha.as_str(), m.head_sha.as_str()), ("aaa", "bbb"));
        assert_eq!(m.state, PrState::Open);

        let mut closed = base.clone();
        closed["state"] = json!("closed");
        assert_eq!(
            parse_pr_meta(&closed.to_string()).unwrap().state,
            PrState::Closed
        );

        let mut merged = closed.clone();
        merged["merged"] = json!(true);
        let m = parse_pr_meta(&merged.to_string()).unwrap();
        assert_eq!(m.state, PrState::Merged);
        assert!(m.merged);

        assert!(parse_pr_meta("{\"message\": \"Not Found\"}").is_err());
    }

    #[test]
    fn ci_combines_check_runs_and_statuses() {
        let runs = json!({"check_runs": [
            {"status": "completed", "conclusion": "success"},
            {"status": "completed", "conclusion": "skipped"},
            {"status": "in_progress", "conclusion": null}
        ]})
        .to_string();
        let st = json!({"state": "success", "statuses": [{"state": "success"}]}).to_string();
        let ci = parse_ci(Some(&runs), Some(&st));
        assert_eq!(
            ci,
            CiStatus {
                state: CiState::Pending,
                passed: 3,
                total: 4
            }
        );

        let failing = json!({"check_runs": [
            {"status": "completed", "conclusion": "failure"},
            {"status": "queued"}
        ]})
        .to_string();
        assert_eq!(parse_ci(Some(&failing), None).state, CiState::Failing);

        let green =
            json!({"check_runs": [{"status": "completed", "conclusion": "success"}]}).to_string();
        assert_eq!(
            parse_ci(Some(&green), Some("{\"statuses\": []}")),
            CiStatus {
                state: CiState::Passing,
                passed: 1,
                total: 1
            }
        );

        assert_eq!(
            parse_ci(None, None),
            CiStatus {
                state: CiState::None,
                passed: 0,
                total: 0
            }
        );
        assert_eq!(parse_ci(Some("not json"), None).state, CiState::None);
    }

    fn graphql_fixture() -> String {
        json!({"data": {"repository": {"pullRequest": {"reviewThreads": {"nodes": [
            {"id": "T_1", "isResolved": true, "path": "orders/services.py", "line": 42, "originalLine": 40,
             "comments": {"nodes": [
                {"databaseId": 11, "author": {"login": "ana"}, "body": "Why 10k?", "createdAt": "2026-05-01T10:00:00Z"},
                {"databaseId": 12, "author": {"login": "maya"}, "body": "```suggestion\nLIMIT = 10_000\n```", "createdAt": "2026-05-01T11:00:00Z"}
             ]}},
            {"id": "T_2", "isResolved": false, "path": "orders/imports.py", "line": null, "originalLine": 9,
             "comments": {"nodes": [
                {"databaseId": 13, "author": null, "body": "Bulk path?", "createdAt": "2026-05-02T10:00:00Z"}
             ]}},
            {"id": "T_empty", "isResolved": false, "path": "x", "line": 1, "comments": {"nodes": []}}
        ]}}}}})
        .to_string()
    }

    #[test]
    fn review_threads_carry_resolved_state_and_location() {
        let threads = parse_review_threads(&graphql_fixture()).unwrap();
        assert_eq!(threads.len(), 2);
        assert_eq!(threads[0].id, "T_1");
        assert!(threads[0].resolved);
        assert_eq!(threads[0].path.as_deref(), Some("orders/services.py"));
        assert_eq!(threads[0].line, Some(42));
        assert_eq!(threads[0].comments.len(), 2);
        // Suggestion blocks stay in the body; the UI renders them.
        assert!(threads[0].comments[1].body.contains("```suggestion"));
        assert!(!threads[1].resolved);
        assert_eq!(threads[1].line, Some(9));
        assert_eq!(threads[1].comments[0].author, "ghost");
    }

    #[test]
    fn rest_review_comments_are_grouped_by_reply_chain() {
        let j = json!([
            {"id": 2, "in_reply_to_id": 1, "user": {"login": "b"}, "body": "reply", "path": "a.rs", "line": 5, "created_at": "2026-01-02T00:00:00Z"},
            {"id": 1, "user": {"login": "a"}, "body": "root", "path": "a.rs", "line": 5, "created_at": "2026-01-01T00:00:00Z"},
            {"id": 3, "user": {"login": "c"}, "body": "other", "path": "b.rs", "line": null, "original_line": 8, "created_at": "2026-01-03T00:00:00Z"}
        ])
        .to_string();
        let threads = parse_review_comments(&j).unwrap();
        assert_eq!(threads.len(), 2);
        assert_eq!(threads[0].id, "thread-1");
        assert_eq!(
            threads[0]
                .comments
                .iter()
                .map(|c| c.body.as_str())
                .collect::<Vec<_>>(),
            vec!["root", "reply"]
        );
        assert_eq!(threads[1].line, Some(8));
    }

    #[test]
    fn build_threads_merges_sources_oldest_first_and_counts_comments() {
        let d = DiscussionJson {
            review_threads: Some(graphql_fixture()),
            review_comments: None,
            // --slurp shape: an array of pages.
            issue_comments: Some(
                json!([[{"id": 90, "user": {"login": "zed"}, "body": "LGTM overall", "created_at": "2026-04-30T09:00:00Z"}]]).to_string(),
            ),
            reviews: Some(
                json!([[
                    {"id": 70, "user": {"login": "ana"}, "body": "", "state": "COMMENTED", "submitted_at": "2026-05-01T10:00:00Z"},
                    {"id": 71, "user": {"login": "ana"}, "body": "Needs the bulk path covered.", "state": "CHANGES_REQUESTED", "submitted_at": "2026-05-03T10:00:00Z"},
                    {"id": 72, "user": {"login": "me"}, "body": "draft", "state": "PENDING", "submitted_at": null}
                ]])
                .to_string(),
            ),
        };
        let threads = build_threads(&d);
        let ids: Vec<&str> = threads.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, vec!["issue-90", "T_1", "T_2", "review-71"]);
        assert_eq!(comment_count(&threads), 5);
    }

    #[test]
    fn build_threads_falls_back_to_rest_when_graphql_is_missing() {
        let d = DiscussionJson {
            review_threads: None,
            review_comments: Some(json!([{"id": 1, "user": {"login": "a"}, "body": "x", "path": "f", "line": 1, "created_at": "t"}]).to_string()),
            issue_comments: Some("[]".to_string()),
            reviews: Some("[]".to_string()),
        };
        let threads = build_threads(&d);
        assert_eq!(threads.len(), 1);
        assert_eq!(threads[0].id, "thread-1");
        assert_eq!(comment_count(&build_threads(&DiscussionJson::default())), 0);
    }

    #[test]
    fn existing_review_guard_matches_user_and_commit() {
        let reviews = json!([
            {"id": 1, "user": {"login": "me"}, "commit_id": "old", "state": "COMMENTED", "html_url": "u1"},
            {"id": 2, "user": {"login": "other"}, "commit_id": "head", "state": "APPROVED", "html_url": "u2"},
            {"id": 3, "user": {"login": "me"}, "commit_id": "head", "state": "PENDING", "html_url": "u3"},
            {"id": 4, "user": {"login": "Me"}, "commit_id": "head", "state": "CHANGES_REQUESTED", "html_url": "u4"}
        ])
        .to_string();
        let found = find_existing_review(&reviews, "me", "head")
            .unwrap()
            .unwrap();
        assert_eq!(
            found,
            PostedReview {
                id: "4".into(),
                url: "u4".into(),
                event: ReviewEvent::RequestChanges
            }
        );
        assert_eq!(
            find_existing_review(&reviews, "me", "other-sha").unwrap(),
            None
        );
        assert_eq!(
            find_existing_review(&reviews, "nobody", "head").unwrap(),
            None
        );
    }

    #[test]
    fn review_payload_matches_the_github_api_shape() {
        let payload = ReviewPayload {
            commit_id: "abc".into(),
            event: ReviewEvent::RequestChanges,
            body: "Summary".into(),
            comments: vec![ReviewComment::new("a.py", 12, "Fix this")],
        };
        assert_eq!(
            serde_json::to_value(&payload).unwrap(),
            json!({"commit_id": "abc", "event": "REQUEST_CHANGES", "body": "Summary",
                   "comments": [{"path": "a.py", "line": 12, "side": "RIGHT", "body": "Fix this"}]})
        );
    }

    #[test]
    fn posted_review_response_is_parsed() {
        let r = parse_posted_review(&json!({"id": 99, "html_url": "https://github.com/o/r/pull/1#pullrequestreview-99", "state": "APPROVED"}).to_string()).unwrap();
        assert_eq!(r.id, "99");
        assert_eq!(r.event, ReviewEvent::Approve);
        assert!(parse_posted_review("{}").is_err());
    }

    #[test]
    fn gh_errors_are_made_readable() {
        assert_eq!(
            clean_gh_error("gh: Not Found (HTTP 404)\n", "{\"message\":\"Not Found\"}"),
            "Not Found"
        );
        assert_eq!(
            clean_gh_error("gh: Unprocessable Entity (HTTP 422)", "{\"message\":\"Unprocessable Entity\",\"errors\":[\"Can not approve your own pull request\"]}"),
            "Unprocessable Entity: Can not approve your own pull request"
        );
        assert_eq!(
            clean_gh_error("gh: connection refused", ""),
            "connection refused"
        );
    }

    #[test]
    fn login_and_ahead_by() {
        assert_eq!(
            parse_login("{\"login\": \"octo\"}").as_deref(),
            Some("octo")
        );
        assert_eq!(parse_login("{}"), None);
        assert_eq!(parse_ahead_by("{\"ahead_by\": 3}").unwrap(), 3);
    }
}
