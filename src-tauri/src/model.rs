//! Shared types. Serialised camelCase; must match src/core/types/grsp.ts.
//!
//! Three groups live here:
//!
//! 1. **Contract types** — the UI-ready shapes returned from Tauri commands.
//!    Everything in them has been through `crate::verify`.
//! 2. **Git facts** — `DiffMap` and friends, produced by `crate::git`.
//! 3. **Raw agent schemas** (`Raw*`) — what the agent returns (SPEC §5).
//!    These deserialise leniently: missing fields default, `null` is treated
//!    as missing, unknown fields are ignored, malformed list items are
//!    skipped, and any agent-supplied change status is never read.

use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

// ── Lenient deserialisation helpers ────────────────────────

/// Strings, tolerating numbers / booleans (agents sometimes emit `"id": 1`).
fn lenient_string<'de, D: Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    Ok(value_to_string(&Value::deserialize(d)?).unwrap_or_default())
}

fn lenient_opt_string<'de, D: Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    Ok(value_to_string(&Value::deserialize(d)?).filter(|s| !s.trim().is_empty()))
}

fn value_to_string(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn value_to_u32(v: &Value) -> Option<u32> {
    match v {
        Value::Number(n) => {
            if let Some(u) = n.as_u64() {
                u32::try_from(u).ok()
            } else {
                n.as_f64()
                    .filter(|f| *f >= 0.0 && *f <= f64::from(u32::MAX))
                    .map(|f| f as u32)
            }
        }
        Value::String(s) => s.trim().parse::<u32>().ok(),
        _ => None,
    }
}

/// Line numbers: number, numeric string, or anything else → 0 (never valid).
fn lenient_u32<'de, D: Deserializer<'de>>(d: D) -> Result<u32, D::Error> {
    Ok(value_to_u32(&Value::deserialize(d)?).unwrap_or(0))
}

fn lenient_opt_u32<'de, D: Deserializer<'de>>(d: D) -> Result<Option<u32>, D::Error> {
    Ok(value_to_u32(&Value::deserialize(d)?))
}

fn lenient_bool<'de, D: Deserializer<'de>>(d: D) -> Result<bool, D::Error> {
    Ok(match Value::deserialize(d)? {
        Value::Bool(b) => b,
        Value::String(s) => s.eq_ignore_ascii_case("true"),
        _ => false,
    })
}

fn lenient_bool_true<'de, D: Deserializer<'de>>(d: D) -> Result<bool, D::Error> {
    Ok(match Value::deserialize(d)? {
        Value::Bool(b) => b,
        Value::String(s) => !s.eq_ignore_ascii_case("false"),
        _ => true,
    })
}

fn default_true() -> bool {
    true
}

/// A list whose malformed items are skipped instead of failing the parse.
fn lenient_vec<'de, D, T>(d: D) -> Result<Vec<T>, D::Error>
where
    D: Deserializer<'de>,
    T: DeserializeOwned,
{
    Ok(match Value::deserialize(d)? {
        Value::Array(items) => items
            .into_iter()
            .filter_map(|v| serde_json::from_value(v).ok())
            .collect(),
        _ => Vec::new(),
    })
}

/// A list of strings; non-string items are stringified or skipped.
fn lenient_string_vec<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<String>, D::Error> {
    Ok(match Value::deserialize(d)? {
        Value::Array(items) => items.iter().filter_map(value_to_string).collect(),
        Value::String(s) => vec![s],
        _ => Vec::new(),
    })
}

/// An optional object; a malformed one becomes `None`.
fn lenient_opt<'de, D, T>(d: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: DeserializeOwned,
{
    Ok(match Value::deserialize(d)? {
        Value::Null => None,
        v => serde_json::from_value(v).ok(),
    })
}

/// `{ key: string }` maps; non-string values are stringified or skipped.
fn lenient_string_map<'de, D: Deserializer<'de>>(
    d: D,
) -> Result<BTreeMap<String, String>, D::Error> {
    Ok(match Value::deserialize(d)? {
        Value::Object(o) => o
            .into_iter()
            .filter_map(|(k, v)| value_to_string(&v).map(|s| (k, s)))
            .collect(),
        _ => BTreeMap::new(),
    })
}

fn norm(s: &str) -> String {
    s.trim().to_ascii_lowercase().replace(['-', ' '], "_")
}

// ── Primitives ─────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum AgentKind {
    #[default]
    Claude,
    Codex,
}

impl AgentKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            AgentKind::Claude => "claude",
            AgentKind::Codex => "codex",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangeStatus {
    New,
    Changed,
    Unchanged,
    Removed,
    NotCovered,
}

/// A location the agent claimed, after verification (SPEC §3.1).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodeRef {
    pub file: String,
    pub start_line: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_line: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<String>,
    /// False only for claims kept visible without a ref ("unverified").
    #[serde(default)]
    pub verified: bool,
    /// The line was moved to where the anchor was actually found.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snapped: Option<bool>,
    /// Resolved at mergeBaseSha (removed code) rather than the worktree.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub at_base: Option<bool>,
}

impl CodeRef {
    /// Last line of the range (== `start_line` for point refs).
    pub fn last_line(&self) -> u32 {
        self.end_line
            .unwrap_or(self.start_line)
            .max(self.start_line)
    }

    pub fn is_at_base(&self) -> bool {
        self.at_base == Some(true)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcerptLine {
    /// 1-based line number in the head version (base version when atBase).
    pub n: u32,
    pub text: String,
    /// "+", "-" or " ".
    pub sign: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub highlight: Option<bool>,
}

/// Code read by Rust from the worktree (SPEC §3.4).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Excerpt {
    pub file: String,
    pub start_line: u32,
    pub end_line: u32,
    pub lines: Vec<ExcerptLine>,
    /// Added / removed line counts for the file, from the DiffMap.
    pub added: u32,
    pub removed: u32,
    /// True when a block range was capped at 40 lines ("Show all").
    pub truncated: bool,
    /// Full length of the range before capping.
    pub total_lines: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VerificationReport {
    #[serde(default)]
    pub verified: u32,
    #[serde(default)]
    pub dropped: u32,
    #[serde(default)]
    pub unverified: u32,
    #[serde(default)]
    pub notes: Vec<String>,
    /// Distinct files the agent read or searched, from tool activity.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub files_explored: Option<u32>,
}

// ── Agents & hosts ─────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatus {
    pub kind: AgentKind,
    pub installed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// None = not checked yet (needs Re-check ping).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signed_in: Option<bool>,
    /// The command line grsp runs, for display in Settings.
    pub command: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GithubStatus {
    pub gh_installed: bool,
    pub authenticated: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub login: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OpenPr {
    pub number: u64,
    pub title: String,
    pub author: String,
    pub updated_at: String,
    pub url: String,
    pub head_ref: String,
    pub base_ref: String,
    pub is_draft: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BranchList {
    pub local: Vec<String>,
    pub remote: Vec<String>,
    pub default_branch: String,
}

// ── Repos & sessions ───────────────────────────────────────

/// `{ host, owner, name }` parsed from the `origin` remote or a PR URL.
/// `host` is `"github"` for github.com; other hosts keep their hostname and
/// are never sent to the frontend as a `remote` (PR mode is GitHub only).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub host: String,
    pub owner: String,
    pub name: String,
}

impl RemoteInfo {
    pub fn is_github(&self) -> bool {
        self.host == "github"
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Repo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub default_branch: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote: Option<RemoteInfo>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    pub sidebar_open: bool,
}

/// Result of inspecting a folder before adding it (SPEC §5.8).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RepoInspection {
    pub is_git_repo: bool,
    pub name: String,
    pub default_branch: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote: Option<RemoteInfo>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SessionSource {
    Pr {
        number: u64,
        url: String,
    },
    Branches {
        base: String,
        head: String,
    },
    /// One commit or a run of commits, with no PR. `base` is the parent of
    /// the oldest commit reviewed (git's empty tree for a root commit),
    /// `head` the newest; both are full SHAs.
    Commits {
        /// The branch they were picked from, for display.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        branch: Option<String>,
        base: String,
        head: String,
        /// Number of commits in base..head.
        count: u32,
    },
}

impl SessionSource {
    pub fn is_pr(&self) -> bool {
        matches!(self, SessionSource::Pr { .. })
    }

    pub fn pr_number(&self) -> Option<u64> {
        match self {
            SessionSource::Pr { number, .. } => Some(*number),
            SessionSource::Branches { .. } | SessionSource::Commits { .. } => None,
        }
    }

    pub fn is_commits(&self) -> bool {
        matches!(self, SessionSource::Commits { .. })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    #[default]
    Preparing,
    Ready,
    Stale,
    Error,
    Closed,
}

impl SessionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            SessionStatus::Preparing => "preparing",
            SessionStatus::Ready => "ready",
            SessionStatus::Stale => "stale",
            SessionStatus::Error => "error",
            SessionStatus::Closed => "closed",
        }
    }

    pub fn parse(s: &str) -> Self {
        match norm(s).as_str() {
            "ready" => SessionStatus::Ready,
            "stale" => SessionStatus::Stale,
            "error" => SessionStatus::Error,
            "closed" => SessionStatus::Closed,
            _ => SessionStatus::Preparing,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReviewEvent {
    Comment,
    Approve,
    RequestChanges,
}

impl ReviewEvent {
    pub fn as_str(&self) -> &'static str {
        match self {
            ReviewEvent::Comment => "COMMENT",
            ReviewEvent::Approve => "APPROVE",
            ReviewEvent::RequestChanges => "REQUEST_CHANGES",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostedReview {
    pub id: String,
    pub url: String,
    pub event: ReviewEvent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum CiState {
    Passing,
    Failing,
    Pending,
    #[default]
    None,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CiStatus {
    pub state: CiState,
    pub passed: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum PrState {
    #[default]
    Open,
    Merged,
    Closed,
}

impl PrState {
    pub fn as_str(&self) -> &'static str {
        match self {
            PrState::Open => "open",
            PrState::Merged => "merged",
            PrState::Closed => "closed",
        }
    }

    pub fn parse(s: &str) -> Self {
        match norm(s).as_str() {
            "merged" => PrState::Merged,
            "closed" => PrState::Closed,
            _ => PrState::Open,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSession {
    pub id: String,
    pub repo_id: String,
    pub source: SessionSource,
    pub title: String,
    pub description: String,
    pub author: String,
    pub base_ref: String,
    pub head_ref: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_sha: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub head_sha: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub merge_base_sha: Option<String>,
    pub status: SessionStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// From GitHub on refresh; branch sessions stay "open".
    pub pr_state: PrState,
    pub is_own_pr: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ci: Option<CiStatus>,
    pub files_changed: u32,
    pub lines_added: u32,
    pub lines_removed: u32,
    /// Commits on the PR head since the analysed headSha (stale bar).
    pub new_commits: u32,
    /// Agent passes run for this session (SPEC §4.5).
    pub agent_passes: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub posted_review: Option<PostedReview>,
    pub created_at: String,
    pub last_opened_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum NewSessionInput {
    Url {
        url: String,
    },
    Pr {
        repo_id: String,
        number: u64,
    },
    Branches {
        repo_id: String,
        base: String,
        head: String,
    },
    /// Review commits. `from` is the oldest commit to include; without it
    /// `head` is reviewed on its own. The base is `from`'s parent.
    Commits {
        repo_id: String,
        #[serde(default)]
        branch: Option<String>,
        head: String,
        #[serde(default)]
        from: Option<String>,
    },
}

/// Returned (JSON-encoded) by session_create when the URL's repo hasn't been added.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoNotAddedError {
    /// Always `"repo_not_added"`.
    pub code: String,
    pub owner: String,
    pub name: String,
}

impl RepoNotAddedError {
    pub fn new(owner: &str, name: &str) -> Self {
        Self {
            code: "repo_not_added".to_string(),
            owner: owner.to_string(),
            name: name.to_string(),
        }
    }
}

// ── Commits (commit reviews) ───────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub sha: String,
    pub short_sha: String,
    /// First line of the message.
    pub subject: String,
    /// The rest of the message; may be empty.
    pub body: String,
    pub author: String,
    /// ISO 8601, with the author's UTC offset.
    pub authored_at: String,
    pub files_changed: u32,
    pub added: u32,
    pub removed: u32,
    pub is_merge: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CommitList {
    pub branch: String,
    /// Newest first.
    pub commits: Vec<CommitInfo>,
    /// Head of the most recent commit review on this branch, when it is
    /// still in `commits`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_reviewed_sha: Option<String>,
    /// True when the fetch from the remote failed and the list is local.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offline: Option<bool>,
}

// ── Full diff (Code tab) ───────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiffFilePatch {
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
    pub status: FileStatus,
    pub added: u32,
    pub removed: u32,
    pub binary: bool,
    /// This file's unified diff, starting at its `diff --git` line. Empty
    /// for binary files.
    pub patch: String,
    /// The patch was cut off because the file's diff is very large.
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionDiff {
    pub files: Vec<DiffFilePatch>,
    /// Vendored, generated and lock files left out (SPEC §2.2).
    pub excluded_files: u32,
}

// ── Notes ──────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiffSide {
    Old,
    New,
}

/// Where a note is pinned. No anchor = a note on the whole review.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum NoteAnchor {
    Line {
        file: String,
        line: u32,
        side: DiffSide,
    },
    Block {
        entry_point_id: String,
        block_id: String,
        label: String,
    },
}

/// A private note. Notes never leave the machine unless exported.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub session_id: String,
    pub body: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<NoteAnchor>,
    /// The head the note was written against.
    pub head_sha: String,
    pub created_at: String,
    pub updated_at: String,
}

// ── Git facts ──────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Added,
    #[default]
    Modified,
    Deleted,
    Renamed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiffFile {
    /// Head-side path (base-side path for deleted files).
    pub path: String,
    pub status: FileStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
    #[serde(default)]
    pub hunks: Vec<Hunk>,
    /// Head-side line numbers of added lines, ascending.
    #[serde(default)]
    pub added_lines: Vec<u32>,
    /// Base-side line numbers of removed lines, ascending.
    #[serde(default)]
    pub removed_lines: Vec<u32>,
    /// Head-side positions where lines were removed: the head line number
    /// that now follows each removed run. Lets change status see pure
    /// deletions without treating hunk context lines as changes.
    #[serde(default)]
    pub removed_at: Vec<u32>,
    #[serde(default)]
    pub binary: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiffMap {
    #[serde(default)]
    pub files: Vec<DiffFile>,
}

impl DiffMap {
    /// Look a file up by its head-side path, falling back to the base-side
    /// path of renamed / deleted files.
    pub fn file(&self, path: &str) -> Option<&DiffFile> {
        self.files.iter().find(|f| f.path == path).or_else(|| {
            self.files
                .iter()
                .find(|f| f.old_path.as_deref() == Some(path))
        })
    }
}

/// Totals for the header and large-PR detection. Stored in
/// `review_sessions.diff_stats_json`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiffStats {
    #[serde(default)]
    pub files: u32,
    #[serde(default)]
    pub added: u32,
    #[serde(default)]
    pub removed: u32,
}

// ── Analyses ───────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum AnalysisStatus {
    #[default]
    Pending,
    Running,
    Done,
    Error,
}

impl AnalysisStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            AnalysisStatus::Pending => "pending",
            AnalysisStatus::Running => "running",
            AnalysisStatus::Done => "done",
            AnalysisStatus::Error => "error",
        }
    }

    pub fn parse(s: &str) -> Self {
        match norm(s).as_str() {
            "running" => AnalysisStatus::Running,
            "done" => AnalysisStatus::Done,
            "error" => AnalysisStatus::Error,
            _ => AnalysisStatus::Pending,
        }
    }
}

/// Analysis kinds: `discovery`, `questions`, `discussion`, `review`,
/// `walkthrough:<entryPointId>`.
pub mod analysis_kind {
    pub const DISCOVERY: &str = "discovery";
    pub const QUESTIONS: &str = "questions";
    pub const DISCUSSION: &str = "discussion";
    pub const REVIEW: &str = "review";
    pub const WALKTHROUGH_PREFIX: &str = "walkthrough:";

    pub fn walkthrough(entry_point_id: &str) -> String {
        format!("{WALKTHROUGH_PREFIX}{entry_point_id}")
    }

    /// The entry point id of a `walkthrough:<id>` kind.
    pub fn walkthrough_entry(kind: &str) -> Option<&str> {
        kind.strip_prefix(WALKTHROUGH_PREFIX)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    pub session_id: String,
    pub kind: String,
    pub head_sha: String,
    pub status: AnalysisStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verification: Option<VerificationReport>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Raw-output excerpt shown behind "Details".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_details: Option<String>,
    /// Latest one-line agent activity while running (SPEC §4.4). Not persisted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<String>,
}

// Discovery (SPEC §5.1)

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum EntryPointKind {
    Http,
    Ui,
    Job,
    Consumer,
    Schedule,
    Cli,
    Api,
    #[default]
    Other,
}

impl EntryPointKind {
    pub fn parse(s: &str) -> Self {
        match norm(s).as_str() {
            "http" | "route" | "endpoint" => EntryPointKind::Http,
            "ui" => EntryPointKind::Ui,
            "job" => EntryPointKind::Job,
            "consumer" => EntryPointKind::Consumer,
            "schedule" | "scheduled" | "cron" => EntryPointKind::Schedule,
            "cli" => EntryPointKind::Cli,
            "api" => EntryPointKind::Api,
            _ => EntryPointKind::Other,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AffectedTag {
    New,
    Changed,
    Timing,
    NotCovered,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    High,
    #[default]
    Medium,
    Low,
}

impl Level {
    pub fn parse(s: &str) -> Self {
        match norm(s).as_str() {
            "high" => Level::High,
            "low" => Level::Low,
            _ => Level::Medium,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryPoint {
    pub id: String,
    pub label: String,
    pub kind: EntryPointKind,
    #[serde(rename = "ref")]
    pub code_ref: CodeRef,
    pub effect: String,
    pub risk: Level,
    /// Derived by Rust (never by the agent).
    pub tag: AffectedTag,
    pub has_gap: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mismatch {
    pub id: String,
    pub claim: String,
    pub reality: String,
    pub refs: Vec<CodeRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_point_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Gap {
    #[serde(rename = "ref")]
    pub code_ref: CodeRef,
    pub write_target: String,
    pub explanation: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_point_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovedItem {
    #[serde(rename = "ref")]
    pub code_ref: CodeRef,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryResult {
    pub behaviour_summary: String,
    /// True when the PR has no description to compare against.
    pub description_empty: bool,
    pub mismatches: Vec<Mismatch>,
    /// Already ordered: gaps first, then by risk. Max 12.
    pub entry_points: Vec<EntryPoint>,
    pub gaps: Vec<Gap>,
    pub removed: Vec<RemovedItem>,
    pub ask_suggestions: Vec<String>,
    /// Number of shards when the PR was analysed in parts (SPEC §4.3).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shards: Option<u32>,
}

// Questions (SPEC §5.2)

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComprehensionQuestion {
    pub id: String,
    pub question: String,
    pub answer: String,
    pub refs: Vec<CodeRef>,
    #[serde(default)]
    pub opened: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuestionsResult {
    pub questions: Vec<ComprehensionQuestion>,
}

// Discussion (SPEC §5.3)

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiscussionComment {
    pub id: String,
    pub author: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiscussionThread {
    pub id: String,
    /// Review threads have a location; issue comments don't.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    pub resolved: bool,
    /// ≤12-word gist from the agent; absent until the digest has run.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gist: Option<String>,
    pub comments: Vec<DiscussionComment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiscussionResult {
    pub digest: String,
    pub threads: Vec<DiscussionThread>,
    pub comment_count: u32,
}

// Walkthrough (SPEC §5.5)

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum BlockKind {
    Route,
    Validation,
    Service,
    Policy,
    Auth,
    DataAccess,
    DbWrite,
    Event,
    External,
    Job,
    Ui,
    #[default]
    Other,
}

impl BlockKind {
    pub fn parse(s: &str) -> Self {
        match norm(s).as_str() {
            "route" | "http" => BlockKind::Route,
            "validation" => BlockKind::Validation,
            "service" => BlockKind::Service,
            "policy" => BlockKind::Policy,
            "auth" => BlockKind::Auth,
            "data_access" | "dataaccess" => BlockKind::DataAccess,
            "db_write" | "dbwrite" => BlockKind::DbWrite,
            "event" | "queue" | "publish" => BlockKind::Event,
            "external" => BlockKind::External,
            "job" | "consumer" => BlockKind::Job,
            "ui" => BlockKind::Ui,
            _ => BlockKind::Other,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WalkDecision {
    pub condition: String,
    pub yes: String,
    pub no: String,
    #[serde(rename = "ref", default, skip_serializing_if = "Option::is_none")]
    pub code_ref: Option<CodeRef>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WalkBlock {
    pub id: String,
    pub label: String,
    pub kind: BlockKind,
    #[serde(rename = "ref")]
    pub code_ref: CodeRef,
    pub note: String,
    pub next: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub decision: Option<WalkDecision>,
    /// Computed from the DiffMap (SPEC §3.2).
    pub status: ChangeStatus,
    pub excerpt: Excerpt,
    /// Ids in `next` whose edge failed the spot-check (dotted connector).
    pub unconfirmed_edges: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WhatIfOption {
    pub label: String,
    /// Block ids in order. Every id exists in `blocks`.
    pub path: Vec<String>,
    /// blockId → "yes" | "no": which branch this input takes at that block's decision.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub taken: Option<BTreeMap<String, String>>,
    /// blockId → note override for this input.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<BTreeMap<String, String>>,
    /// Boundary explanation, e.g. for "€10,000".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WhatIf {
    pub variable: String,
    pub options: Vec<WhatIfOption>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WalkthroughResult {
    pub entry_point_id: String,
    pub blocks: Vec<WalkBlock>,
    /// Default path when there is no what-if.
    pub path: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub what_if: Option<WhatIf>,
}

// Ask (SPEC §5.4)

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AskAnswer {
    pub paragraphs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub excerpt: Option<Excerpt>,
    pub refs: Vec<CodeRef>,
    pub confidence: Level,
    pub grounded: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum AskStatus {
    #[default]
    Running,
    Done,
    Error,
}

impl AskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            AskStatus::Running => "running",
            AskStatus::Done => "done",
            AskStatus::Error => "error",
        }
    }

    pub fn parse(s: &str) -> Self {
        match norm(s).as_str() {
            "done" => AskStatus::Done,
            "error" => AskStatus::Error,
            _ => AskStatus::Running,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AskMessage {
    pub id: String,
    pub session_id: String,
    pub question: String,
    pub status: AskStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub answer: Option<AskAnswer>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verification: Option<VerificationReport>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Not persisted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<String>,
    pub head_sha: String,
    pub created_at: String,
}

// Review (SPEC §5.6)

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Blocking,
    #[default]
    ShouldFix,
    Nit,
}

impl Severity {
    pub fn parse(s: &str) -> Self {
        match norm(s).as_str() {
            "blocking" | "blocker" | "critical" | "high" => Severity::Blocking,
            "nit" | "nitpick" | "low" | "minor" => Severity::Nit,
            _ => Severity::ShouldFix,
        }
    }
}

/// Where a finding's comment can be posted (SPEC §5.6).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Anchoring {
    /// The line is an added or context line in a head-side hunk.
    Inline,
    /// Not in the PR diff; goes in the review body under "Not in this diff".
    Summary,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub id: String,
    pub severity: Severity,
    pub title: String,
    pub why: String,
    #[serde(rename = "ref")]
    pub code_ref: CodeRef,
    pub excerpt: Excerpt,
    /// Editable; starts as the agent's suggestedComment.
    pub comment: String,
    pub included: bool,
    pub anchoring: Anchoring,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReviewResult {
    pub findings: Vec<Finding>,
    pub summary: String,
    pub repo_prompt_active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostReviewInput {
    pub event: ReviewEvent,
    pub body: String,
}

// ── Settings ───────────────────────────────────────────────

pub const DEFAULT_REVIEW_PROMPT: &str = "You are reviewing a pull request. Prioritise correctness and data integrity over style. Flag any path where state changes without the checks the PR description promises. Group findings as Blocking, Should fix or Nit. Keep each comment under 80 words and say what to change, not just what is wrong.";

/// Keys in the `settings` table (values are JSON-encoded).
pub mod settings_keys {
    pub const REVIEW_PROMPT: &str = "review_prompt";
    pub const AGENT: &str = "agent";
    pub const COMPREHENSION_QUESTIONS: &str = "comprehension_questions";
    pub const SHOW_UNCHANGED_BLOCKS: &str = "show_unchanged_blocks";
    pub const AUTO_RUN_REVIEW: &str = "auto_run_review";
    pub const TRACE_DEPTH: &str = "trace_depth";
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrspSettings {
    pub review_prompt: String,
    pub agent: AgentKind,
    pub comprehension_questions: bool,
    pub show_unchanged_blocks: bool,
    pub auto_run_review: bool,
    /// 1, 2 or 3.
    pub trace_depth: u8,
}

impl Default for GrspSettings {
    fn default() -> Self {
        Self {
            review_prompt: DEFAULT_REVIEW_PROMPT.to_string(),
            agent: AgentKind::Claude,
            comprehension_questions: true,
            show_unchanged_blocks: true,
            auto_run_review: false,
            trace_depth: 2,
        }
    }
}

// ── Events (Rust → frontend) ───────────────────────────────

pub mod events {
    pub const SESSION: &str = "grsp://session";
    pub const ANALYSIS: &str = "grsp://analysis";
    pub const ASK: &str = "grsp://ask";
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionEvent {
    pub session_id: String,
    /// Plain-language preparing step, e.g. "Fetching pull/482/head".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisEvent {
    pub session_id: String,
    pub kind: String,
    pub status: AnalysisStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AskEvent {
    pub session_id: String,
    pub message_id: String,
    pub status: AskStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<String>,
}

// ── Raw agent output (SPEC §5) ─────────────────────────────

/// A location as the agent claims it. Nothing here is trusted until
/// `verify::verify_ref` has turned it into a `CodeRef`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawCodeRef {
    #[serde(default, alias = "path", deserialize_with = "lenient_string")]
    pub file: String,
    #[serde(
        default,
        alias = "line",
        alias = "start_line",
        deserialize_with = "lenient_u32"
    )]
    pub start_line: u32,
    #[serde(
        default,
        alias = "end_line",
        deserialize_with = "lenient_opt_u32",
        skip_serializing_if = "Option::is_none"
    )]
    pub end_line: Option<u32>,
    #[serde(
        default,
        deserialize_with = "lenient_opt_string",
        skip_serializing_if = "Option::is_none"
    )]
    pub anchor: Option<String>,
}

impl RawCodeRef {
    pub fn new(file: &str, start_line: u32, end_line: Option<u32>, anchor: Option<&str>) -> Self {
        Self {
            file: file.to_string(),
            start_line,
            end_line,
            anchor: anchor.map(str::to_string),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawMismatch {
    #[serde(default, deserialize_with = "lenient_string")]
    pub claim: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub reality: String,
    #[serde(default, deserialize_with = "lenient_vec")]
    pub refs: Vec<RawCodeRef>,
    #[serde(default, deserialize_with = "lenient_opt_string")]
    pub entry_point_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawEntryPoint {
    #[serde(default, deserialize_with = "lenient_string")]
    pub id: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub label: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub kind: String,
    #[serde(default, rename = "ref", deserialize_with = "lenient_opt")]
    pub code_ref: Option<RawCodeRef>,
    #[serde(default, deserialize_with = "lenient_string")]
    pub effect: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub risk: String,
    #[serde(default, deserialize_with = "lenient_bool")]
    pub timing_only: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawGap {
    #[serde(default, rename = "ref", deserialize_with = "lenient_opt")]
    pub code_ref: Option<RawCodeRef>,
    #[serde(default, deserialize_with = "lenient_string")]
    pub write_target: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub explanation: String,
    #[serde(default, deserialize_with = "lenient_opt_string")]
    pub entry_point_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawRemoved {
    #[serde(default, rename = "ref", deserialize_with = "lenient_opt")]
    pub code_ref: Option<RawCodeRef>,
    #[serde(default, deserialize_with = "lenient_string")]
    pub name: String,
}

/// Discovery pass output (SPEC §5.1).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawDiscovery {
    #[serde(
        default,
        alias = "behaviorSummary",
        alias = "summary",
        deserialize_with = "lenient_string"
    )]
    pub behaviour_summary: String,
    #[serde(default, deserialize_with = "lenient_vec")]
    pub mismatches: Vec<RawMismatch>,
    #[serde(default, deserialize_with = "lenient_vec")]
    pub entry_points: Vec<RawEntryPoint>,
    #[serde(default, deserialize_with = "lenient_vec")]
    pub gaps: Vec<RawGap>,
    #[serde(default, deserialize_with = "lenient_vec")]
    pub removed: Vec<RawRemoved>,
    #[serde(default, deserialize_with = "lenient_string_vec")]
    pub ask_suggestions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawQuestion {
    #[serde(default, deserialize_with = "lenient_string")]
    pub id: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub question: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub answer: String,
    #[serde(default, deserialize_with = "lenient_vec")]
    pub refs: Vec<RawCodeRef>,
}

/// Questions pass output (SPEC §5.2). Accepts the SPEC's bare array or an
/// object `{ "questions": [...] }`.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RawQuestions {
    pub questions: Vec<RawQuestion>,
}

impl<'de> Deserialize<'de> for RawQuestions {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let items = match Value::deserialize(d)? {
            Value::Array(a) => a,
            Value::Object(mut o) => match o.remove("questions") {
                Some(Value::Array(a)) => a,
                _ => {
                    return Err(serde::de::Error::custom(
                        "expected an array of questions or { \"questions\": [...] }",
                    ))
                }
            },
            _ => return Err(serde::de::Error::custom("expected an array of questions")),
        };
        Ok(RawQuestions {
            questions: items
                .into_iter()
                .filter_map(|v| serde_json::from_value(v).ok())
                .collect(),
        })
    }
}

/// Discussion pass output (SPEC §5.3).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawDiscussion {
    #[serde(default, deserialize_with = "lenient_string")]
    pub digest: String,
    #[serde(default, deserialize_with = "lenient_string_map")]
    pub thread_gists: BTreeMap<String, String>,
}

/// Ask pass output (SPEC §5.4).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawAsk {
    #[serde(default, deserialize_with = "lenient_string_vec")]
    pub paragraphs: Vec<String>,
    #[serde(default, deserialize_with = "lenient_opt")]
    pub excerpt: Option<RawCodeRef>,
    #[serde(default, deserialize_with = "lenient_opt")]
    pub highlight: Option<RawCodeRef>,
    #[serde(default, deserialize_with = "lenient_vec")]
    pub refs: Vec<RawCodeRef>,
    #[serde(default, deserialize_with = "lenient_string")]
    pub confidence: String,
    #[serde(default = "default_true", deserialize_with = "lenient_bool_true")]
    pub grounded: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawDecision {
    #[serde(default, deserialize_with = "lenient_string")]
    pub condition: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub yes: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub no: String,
    #[serde(default, rename = "ref", deserialize_with = "lenient_opt")]
    pub code_ref: Option<RawCodeRef>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawWalkBlock {
    #[serde(default, deserialize_with = "lenient_string")]
    pub id: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub label: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub kind: String,
    #[serde(default, rename = "ref", deserialize_with = "lenient_opt")]
    pub code_ref: Option<RawCodeRef>,
    /// Block-level anchor; used when `ref.anchor` is absent, and as a name
    /// for the edge spot-check.
    #[serde(default, deserialize_with = "lenient_opt_string")]
    pub anchor: Option<String>,
    #[serde(default, deserialize_with = "lenient_string")]
    pub note: String,
    #[serde(default, deserialize_with = "lenient_string_vec")]
    pub next: Vec<String>,
    #[serde(default, deserialize_with = "lenient_opt")]
    pub decision: Option<RawDecision>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawWhatIfOption {
    #[serde(default, deserialize_with = "lenient_string")]
    pub label: String,
    #[serde(default, deserialize_with = "lenient_string_vec")]
    pub path: Vec<String>,
    /// Extension: blockId → "yes" | "no".
    #[serde(default, deserialize_with = "lenient_string_map")]
    pub taken: BTreeMap<String, String>,
    /// Extension: blockId → note override for this input.
    #[serde(default, deserialize_with = "lenient_string_map")]
    pub notes: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawWhatIf {
    #[serde(default, deserialize_with = "lenient_string")]
    pub variable: String,
    #[serde(default, deserialize_with = "lenient_vec")]
    pub options: Vec<RawWhatIfOption>,
    /// option label → boundary explanation.
    #[serde(default, deserialize_with = "lenient_string_map")]
    pub notes: BTreeMap<String, String>,
}

/// Walkthrough pass output (SPEC §5.5).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawWalkthrough {
    #[serde(default, deserialize_with = "lenient_vec")]
    pub blocks: Vec<RawWalkBlock>,
    #[serde(default, deserialize_with = "lenient_opt")]
    pub what_if: Option<RawWhatIf>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawFinding {
    #[serde(default, deserialize_with = "lenient_string")]
    pub id: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub severity: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub title: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub why: String,
    #[serde(default, rename = "ref", deserialize_with = "lenient_opt")]
    pub code_ref: Option<RawCodeRef>,
    #[serde(default, alias = "comment", deserialize_with = "lenient_string")]
    pub suggested_comment: String,
}

/// Review pass output (SPEC §5.6).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawReview {
    #[serde(default, deserialize_with = "lenient_vec")]
    pub findings: Vec<RawFinding>,
    #[serde(default, deserialize_with = "lenient_string")]
    pub summary: String,
}

/// A top-level agent response schema.
pub trait AgentOutput: DeserializeOwned {
    /// Whether the top level may be a bare array (only the questions pass).
    const ALLOW_ARRAY: bool = false;
}

impl AgentOutput for RawDiscovery {}
impl AgentOutput for RawDiscussion {}
impl AgentOutput for RawAsk {}
impl AgentOutput for RawWalkthrough {}
impl AgentOutput for RawReview {}
impl AgentOutput for RawQuestions {
    const ALLOW_ARRAY: bool = true;
}

/// Parse a top-level agent response. Use this rather than
/// `serde_json::from_value` directly: the raw schemas are lenient about
/// their fields, so the only schema failure left is the wrong top-level
/// shape — which this rejects (triggering the repair retry, SPEC §4.2)
/// instead of reading it as an empty result.
pub fn parse_agent_output<T: AgentOutput>(value: Value) -> Result<T, String> {
    match &value {
        Value::Object(_) => {}
        Value::Array(_) if T::ALLOW_ARRAY => {}
        other => {
            let got = match other {
                Value::Array(_) => "an array",
                Value::String(_) => "a string",
                Value::Null => "null",
                Value::Bool(_) => "a boolean",
                Value::Number(_) => "a number",
                Value::Object(_) => "an object",
            };
            return Err(format!("expected a single JSON object, got {got}"));
        }
    }
    serde_json::from_value(value).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn code_ref_serialises_camel_case_and_skips_none() {
        let r = CodeRef {
            file: "a.py".into(),
            start_line: 3,
            end_line: None,
            anchor: None,
            verified: true,
            snapped: None,
            at_base: None,
        };
        assert_eq!(
            serde_json::to_value(&r).unwrap(),
            json!({"file": "a.py", "startLine": 3, "verified": true})
        );
    }

    #[test]
    fn enums_match_the_ts_contract() {
        assert_eq!(json!(ChangeStatus::NotCovered), json!("not_covered"));
        assert_eq!(json!(AffectedTag::NotCovered), json!("not_covered"));
        assert_eq!(json!(BlockKind::DbWrite), json!("db_write"));
        assert_eq!(json!(Severity::ShouldFix), json!("should_fix"));
        assert_eq!(json!(ReviewEvent::RequestChanges), json!("REQUEST_CHANGES"));
        assert_eq!(json!(Anchoring::Summary), json!("summary"));
        assert_eq!(json!(CiState::None), json!("none"));
        assert_eq!(
            json!(SessionSource::Pr {
                number: 4,
                url: "u".into()
            }),
            json!({"kind": "pr", "number": 4, "url": "u"})
        );
    }

    #[test]
    fn commit_review_types_match_the_ts_contract() {
        assert_eq!(
            json!(SessionSource::Commits {
                branch: Some("main".into()),
                base: "b".into(),
                head: "h".into(),
                count: 3
            }),
            json!({"kind": "commits", "branch": "main", "base": "b", "head": "h", "count": 3})
        );
        assert_eq!(
            json!(SessionSource::Commits {
                branch: None,
                base: "b".into(),
                head: "h".into(),
                count: 1
            }),
            json!({"kind": "commits", "base": "b", "head": "h", "count": 1})
        );
        let i: NewSessionInput =
            serde_json::from_value(json!({"kind": "commits", "repoId": "r1", "head": "abc"}))
                .unwrap();
        assert_eq!(
            i,
            NewSessionInput::Commits {
                repo_id: "r1".into(),
                branch: None,
                head: "abc".into(),
                from: None
            }
        );
        let i: NewSessionInput = serde_json::from_value(
            json!({"kind": "commits", "repoId": "r1", "branch": "main", "head": "abc", "from": "def"}),
        )
        .unwrap();
        assert!(matches!(i, NewSessionInput::Commits { from: Some(f), .. } if f == "def"));

        let line: NoteAnchor = serde_json::from_value(
            json!({"kind": "line", "file": "a.txt", "line": 4, "side": "old"}),
        )
        .unwrap();
        assert_eq!(
            line,
            NoteAnchor::Line {
                file: "a.txt".into(),
                line: 4,
                side: DiffSide::Old
            }
        );
        assert_eq!(
            json!(NoteAnchor::Block {
                entry_point_id: "ep1".into(),
                block_id: "b2".into(),
                label: "save".into()
            }),
            json!({"kind": "block", "entryPointId": "ep1", "blockId": "b2", "label": "save"})
        );
        let patch = serde_json::to_value(DiffFilePatch {
            path: "b.txt".into(),
            old_path: Some("a.txt".into()),
            status: FileStatus::Renamed,
            ..Default::default()
        })
        .unwrap();
        assert_eq!(patch["oldPath"], "a.txt");
        assert_eq!(patch["status"], "renamed");
        assert_eq!(
            serde_json::to_value(CommitList::default()).unwrap(),
            json!({"branch": "", "commits": []})
        );
        let c = serde_json::to_value(CommitInfo::default()).unwrap();
        for key in ["shortSha", "authoredAt", "filesChanged", "isMerge"] {
            assert!(c.get(key).is_some(), "{key}");
        }
    }

    #[test]
    fn new_session_input_reads_camel_case_fields() {
        let i: NewSessionInput =
            serde_json::from_value(json!({"kind": "pr", "repoId": "r1", "number": 7})).unwrap();
        assert_eq!(
            i,
            NewSessionInput::Pr {
                repo_id: "r1".into(),
                number: 7
            }
        );
    }

    #[test]
    fn entry_point_uses_ref_key() {
        let ep = EntryPoint {
            id: "ep1".into(),
            label: "POST /orders".into(),
            kind: EntryPointKind::Http,
            code_ref: CodeRef::default(),
            effect: String::new(),
            risk: Level::High,
            tag: AffectedTag::Changed,
            has_gap: true,
        };
        let v = serde_json::to_value(&ep).unwrap();
        assert!(v.get("ref").is_some());
        assert_eq!(v["hasGap"], json!(true));
        assert_eq!(v["risk"], json!("high"));
    }

    #[test]
    fn raw_discovery_is_lenient() {
        let raw: RawDiscovery = serde_json::from_value(json!({
            "behaviourSummary": null,
            "unknownField": 12,
            "entryPoints": [
                {"id": 1, "label": "POST /orders", "kind": "http",
                 "ref": {"file": "a.py", "startLine": "12", "anchor": "def create"},
                 "status": "changed", "timingOnly": null},
                "not an object",
                {"id": "ep2", "ref": "a.py:3"}
            ],
            "gaps": null,
            "askSuggestions": ["a", 2, null]
        }))
        .unwrap();
        assert_eq!(raw.behaviour_summary, "");
        assert_eq!(raw.entry_points.len(), 2);
        assert_eq!(raw.entry_points[0].id, "1");
        assert_eq!(
            raw.entry_points[0].code_ref.as_ref().unwrap().start_line,
            12
        );
        assert!(!raw.entry_points[0].timing_only);
        assert!(raw.entry_points[1].code_ref.is_none());
        assert!(raw.gaps.is_empty());
        assert_eq!(raw.ask_suggestions, vec!["a", "2"]);
    }

    #[test]
    fn top_level_shape_is_enforced() {
        assert!(parse_agent_output::<RawDiscovery>(json!([1, 2])).is_err());
        assert!(parse_agent_output::<RawReview>(json!("text")).is_err());
        assert!(parse_agent_output::<RawAsk>(json!(null)).is_err());
        assert!(parse_agent_output::<RawWalkthrough>(json!({})).is_ok());
        assert!(parse_agent_output::<RawDiscovery>(json!({"entryPoints": []})).is_ok());
        assert!(parse_agent_output::<RawQuestions>(json!([])).is_ok());
        assert!(parse_agent_output::<RawQuestions>(json!({"questions": []})).is_ok());
        assert!(parse_agent_output::<RawQuestions>(json!({"other": []})).is_err());
        assert!(serde_json::from_str::<RawDiscovery>("not json").is_err());
    }

    #[test]
    fn raw_questions_accepts_array_or_object() {
        let a: RawQuestions =
            serde_json::from_value(json!([{"id": "q1", "question": "Q", "answer": "A"}])).unwrap();
        let b: RawQuestions = serde_json::from_value(
            json!({"questions": [{"id": "q1", "question": "Q", "answer": "A"}]}),
        )
        .unwrap();
        assert_eq!(a, b);
        assert!(serde_json::from_value::<RawQuestions>(json!({"nope": 1})).is_err());
    }

    #[test]
    fn raw_ask_defaults() {
        let raw: RawAsk = serde_json::from_value(json!({"paragraphs": ["x"]})).unwrap();
        assert!(raw.grounded);
        assert!(raw.excerpt.is_none());
        let raw: RawAsk = serde_json::from_value(
            json!({"paragraphs": "one", "grounded": false, "excerpt": null}),
        )
        .unwrap();
        assert!(!raw.grounded);
        assert_eq!(raw.paragraphs, vec!["one"]);
    }

    #[test]
    fn raw_walkthrough_extensions() {
        let raw: RawWalkthrough = serde_json::from_value(json!({
            "blocks": [{"id": "b1", "label": "x", "kind": "route",
                        "ref": {"file": "a", "startLine": 1}, "next": ["b2"], "decision": null}],
            "whatIf": {"variable": "total",
                       "options": [{"label": "1", "path": ["b1"], "taken": {"b1": "yes"}, "notes": {"b1": "n"}}],
                       "notes": {"1": "edge"}}
        }))
        .unwrap();
        let w = raw.what_if.unwrap();
        assert_eq!(w.options[0].taken.get("b1").unwrap(), "yes");
        assert_eq!(w.notes.get("1").unwrap(), "edge");
    }

    #[test]
    fn settings_defaults_match_ts() {
        let s = GrspSettings::default();
        assert_eq!(s.agent, AgentKind::Claude);
        assert!(s.comprehension_questions && s.show_unchanged_blocks && !s.auto_run_review);
        assert_eq!(s.trace_depth, 2);
    }
}
