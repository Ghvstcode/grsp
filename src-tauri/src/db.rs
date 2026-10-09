//! rusqlite access to grsp.db (same file tauri-plugin-sql migrates).
//!
//! Every function takes a `&Connection` so tests can run against an
//! in-memory database (`open_in_memory`). Errors are plain strings.
//! Timestamps written from Rust are RFC 3339 UTC (`now_iso`).

use crate::model::*;
use rusqlite::{params, Connection, OptionalExtension, Row};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub type DbResult<T> = Result<T, String>;

/// A session row plus the columns that aren't part of the UI contract.
#[derive(Debug, Clone, PartialEq)]
pub struct SessionRow {
    pub session: ReviewSession,
    pub worktree_path: Option<String>,
    pub archived: bool,
}

fn e<T>(r: rusqlite::Result<T>) -> DbResult<T> {
    r.map_err(|err| format!("Database error: {err}"))
}

fn to_json<T: serde::Serialize>(v: &T) -> DbResult<String> {
    serde_json::to_string(v).map_err(|err| format!("Couldn't encode JSON: {err}"))
}

/// Decode an optional JSON column; a corrupt value reads as absent.
fn from_json<T: serde::de::DeserializeOwned>(text: Option<String>) -> Option<T> {
    text.and_then(|t| serde_json::from_str(&t).ok())
}

fn count(n: i64) -> u32 {
    u32::try_from(n.max(0)).unwrap_or(u32::MAX)
}

/// `{app_data_dir}/grsp.db`.
pub fn db_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("grsp.db")
}

/// Tables the newest migration creates. When any is missing the migrations
/// are applied from here.
const SCHEMA_TABLES: [&str; 3] = ["review_sessions", "notes", "session_commits"];

/// Open grsp.db with a busy timeout and make sure the schema is current.
///
/// The schema is also migrated by tauri-plugin-sql, but only once the
/// webview loads the database; the engine can get here first (startup
/// cleanup, the eval runner, tests) and an updated app can find a database
/// that an older version created. Every migration is idempotent, so running
/// them from both sides is safe.
pub fn open(app_data_dir: &Path) -> DbResult<Connection> {
    std::fs::create_dir_all(app_data_dir)
        .map_err(|err| format!("Couldn't create {}: {err}", app_data_dir.display()))?;
    let conn = e(Connection::open(db_path(app_data_dir)))?;
    e(conn.busy_timeout(Duration::from_secs(5)))?;
    ensure_schema(&conn)?;
    Ok(conn)
}

/// Apply the migrations if a table the current schema needs is missing.
pub fn ensure_schema(conn: &Connection) -> DbResult<()> {
    let placeholders = vec!["?"; SCHEMA_TABLES.len()].join(", ");
    let present: i64 = e(conn.query_row(
        &format!(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ({placeholders})"
        ),
        rusqlite::params_from_iter(SCHEMA_TABLES.iter()),
        |r| r.get(0),
    ))?;
    if present as usize != SCHEMA_TABLES.len() {
        apply_migrations(conn)?;
    }
    Ok(())
}

/// Apply every `migrations::migrations()` SQL script to a connection, in
/// version order.
pub fn apply_migrations(conn: &Connection) -> DbResult<()> {
    let mut migrations = crate::migrations::migrations();
    migrations.sort_by_key(|m| m.version);
    for m in migrations {
        e(conn.execute_batch(m.sql))?;
    }
    Ok(())
}

/// Test helper: an in-memory database with the schema applied.
pub fn open_in_memory() -> DbResult<Connection> {
    let conn = e(Connection::open_in_memory())?;
    apply_migrations(&conn)?;
    Ok(conn)
}

/// Current time as RFC 3339 UTC.
pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

// ── repos (read) ───────────────────────────────────────────

const REPO_COLS: &str =
    "id, name, path, default_branch, remote_host, remote_owner, remote_name, language, sidebar_open";

fn repo_from_row(row: &Row<'_>) -> rusqlite::Result<Repo> {
    let host: Option<String> = row.get(4)?;
    let owner: Option<String> = row.get(5)?;
    let name: Option<String> = row.get(6)?;
    let remote = match (host, owner, name) {
        (Some(host), Some(owner), Some(name)) if !owner.is_empty() && !name.is_empty() => {
            Some(RemoteInfo { host, owner, name })
        }
        _ => None,
    };
    Ok(Repo {
        id: row.get(0)?,
        name: row.get(1)?,
        path: row.get(2)?,
        default_branch: row.get(3)?,
        remote,
        language: row.get(7)?,
        sidebar_open: row.get::<_, i64>(8)? != 0,
    })
}

pub fn get_repo(conn: &Connection, id: &str) -> DbResult<Option<Repo>> {
    e(conn
        .query_row(
            &format!("SELECT {REPO_COLS} FROM repos WHERE id = ?1"),
            params![id],
            repo_from_row,
        )
        .optional())
}

/// Non-archived repos.
pub fn list_repos(conn: &Connection) -> DbResult<Vec<Repo>> {
    let mut stmt = e(conn.prepare(&format!(
        "SELECT {REPO_COLS} FROM repos WHERE archived = 0 ORDER BY created_at, name"
    )))?;
    let rows = e(stmt.query_map([], repo_from_row))?;
    e(rows.collect())
}

/// The non-archived repo whose origin is `{owner}/{name}` (case-insensitive).
pub fn find_repo_by_remote(conn: &Connection, owner: &str, name: &str) -> DbResult<Option<Repo>> {
    e(conn
        .query_row(
            &format!(
                "SELECT {REPO_COLS} FROM repos
                 WHERE archived = 0 AND lower(remote_owner) = lower(?1) AND lower(remote_name) = lower(?2)
                 ORDER BY created_at LIMIT 1"
            ),
            params![owner, name],
            repo_from_row,
        )
        .optional())
}

// ── review_sessions ────────────────────────────────────────

const SESSION_COLS: &str = "s.id, s.repo_id, s.source_kind, s.pr_number, s.pr_url, s.title, s.description, \
     s.author, s.base_ref, s.head_ref, s.base_sha, s.head_sha, s.merge_base_sha, s.status, s.error, \
     s.pr_state, s.is_own_pr, s.ci_json, s.diff_stats_json, s.new_commits, s.worktree_path, \
     s.agent_passes, s.posted_review_json, s.archived, s.created_at, s.last_opened_at, \
     (SELECT c.branch FROM session_commits c WHERE c.session_id = s.id), \
     (SELECT c.base_sha FROM session_commits c WHERE c.session_id = s.id), \
     (SELECT c.head_sha FROM session_commits c WHERE c.session_id = s.id), \
     (SELECT c.commit_count FROM session_commits c WHERE c.session_id = s.id)";

fn session_from_row(row: &Row<'_>) -> rusqlite::Result<SessionRow> {
    let source_kind: String = row.get(2)?;
    let base_ref: String = row.get(8)?;
    let head_ref: String = row.get(9)?;
    let source = match source_kind.as_str() {
        "pr" => SessionSource::Pr {
            number: row.get::<_, Option<i64>>(3)?.unwrap_or(0).max(0) as u64,
            url: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
        },
        // The pinned SHAs double as a fallback if the detail row is missing.
        "commits" => SessionSource::Commits {
            branch: row.get::<_, Option<String>>(26)?.filter(|b| !b.is_empty()),
            base: row
                .get::<_, Option<String>>(27)?
                .or(row.get::<_, Option<String>>(10)?)
                .unwrap_or_default(),
            head: row
                .get::<_, Option<String>>(28)?
                .or(row.get::<_, Option<String>>(11)?)
                .unwrap_or_default(),
            count: count(row.get::<_, Option<i64>>(29)?.unwrap_or(1)),
        },
        _ => SessionSource::Branches {
            base: base_ref.clone(),
            head: head_ref.clone(),
        },
    };
    let stats: DiffStats = from_json(row.get(18)?).unwrap_or_default();
    Ok(SessionRow {
        session: ReviewSession {
            id: row.get(0)?,
            repo_id: row.get(1)?,
            source,
            title: row.get(5)?,
            description: row.get(6)?,
            author: row.get(7)?,
            base_ref,
            head_ref,
            base_sha: row.get(10)?,
            head_sha: row.get(11)?,
            merge_base_sha: row.get(12)?,
            status: SessionStatus::parse(&row.get::<_, String>(13)?),
            error: row.get(14)?,
            pr_state: PrState::parse(&row.get::<_, String>(15)?),
            is_own_pr: row.get::<_, i64>(16)? != 0,
            ci: from_json(row.get(17)?),
            files_changed: stats.files,
            lines_added: stats.added,
            lines_removed: stats.removed,
            new_commits: count(row.get(19)?),
            agent_passes: count(row.get(21)?),
            posted_review: from_json(row.get(22)?),
            created_at: row.get::<_, Option<String>>(24)?.unwrap_or_default(),
            last_opened_at: row.get::<_, Option<String>>(25)?.unwrap_or_default(),
        },
        worktree_path: row.get::<_, Option<String>>(20)?.filter(|p| !p.is_empty()),
        archived: row.get::<_, i64>(23)? != 0,
    })
}

fn source_columns(source: &SessionSource) -> (&'static str, Option<i64>, Option<&str>) {
    match source {
        SessionSource::Pr { number, url } => ("pr", Some(*number as i64), Some(url.as_str())),
        SessionSource::Branches { .. } => ("branches", None, None),
        SessionSource::Commits { .. } => ("commits", None, None),
    }
}

/// Keep `session_commits` in step with a commit session's source.
fn write_commit_source(conn: &Connection, session: &ReviewSession) -> DbResult<()> {
    let SessionSource::Commits {
        branch,
        base,
        head,
        count,
    } = &session.source
    else {
        return Ok(());
    };
    e(conn.execute(
        "INSERT INTO session_commits (session_id, branch, base_sha, head_sha, commit_count)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(session_id) DO UPDATE SET
            branch = excluded.branch, base_sha = excluded.base_sha,
            head_sha = excluded.head_sha, commit_count = excluded.commit_count",
        params![session.id, branch, base, head, count],
    ))?;
    Ok(())
}

fn opt_json<T: serde::Serialize>(v: Option<&T>) -> DbResult<Option<String>> {
    v.map(to_json).transpose()
}

fn stats_of(session: &ReviewSession) -> DiffStats {
    DiffStats {
        files: session.files_changed,
        added: session.lines_added,
        removed: session.lines_removed,
    }
}

pub fn insert_session(
    conn: &Connection,
    session: &ReviewSession,
    worktree_path: Option<&str>,
) -> DbResult<()> {
    let (kind, pr_number, pr_url) = source_columns(&session.source);
    let now = now_iso();
    let created = if session.created_at.is_empty() {
        &now
    } else {
        &session.created_at
    };
    let opened = if session.last_opened_at.is_empty() {
        &now
    } else {
        &session.last_opened_at
    };
    e(conn.execute(
        "INSERT INTO review_sessions (
            id, repo_id, source_kind, pr_number, pr_url, title, description, author, base_ref, head_ref,
            base_sha, head_sha, merge_base_sha, status, error, pr_state, is_own_pr, ci_json,
            diff_stats_json, new_commits, worktree_path, agent_passes, posted_review_json, archived,
            created_at, last_opened_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
                   ?19, ?20, ?21, ?22, ?23, 0, ?24, ?25)",
        params![
            session.id,
            session.repo_id,
            kind,
            pr_number,
            pr_url,
            session.title,
            session.description,
            session.author,
            session.base_ref,
            session.head_ref,
            session.base_sha,
            session.head_sha,
            session.merge_base_sha,
            session.status.as_str(),
            session.error,
            session.pr_state.as_str(),
            session.is_own_pr,
            opt_json(session.ci.as_ref())?,
            to_json(&stats_of(session))?,
            session.new_commits,
            worktree_path,
            session.agent_passes,
            opt_json(session.posted_review.as_ref())?,
            created,
            opened,
        ],
    ))?;
    write_commit_source(conn, session)
}

/// Write every mutable column of the session from the struct. Leaves
/// `worktree_path`, `archived` and `created_at` alone.
pub fn update_session(conn: &Connection, session: &ReviewSession) -> DbResult<()> {
    let (kind, pr_number, pr_url) = source_columns(&session.source);
    let changed = e(conn.execute(
        "UPDATE review_sessions SET
            source_kind = ?2, pr_number = ?3, pr_url = ?4, title = ?5, description = ?6, author = ?7,
            base_ref = ?8, head_ref = ?9, base_sha = ?10, head_sha = ?11, merge_base_sha = ?12,
            status = ?13, error = ?14, pr_state = ?15, is_own_pr = ?16, ci_json = ?17,
            diff_stats_json = ?18, new_commits = ?19, agent_passes = ?20, posted_review_json = ?21,
            last_opened_at = ?22
         WHERE id = ?1",
        params![
            session.id,
            kind,
            pr_number,
            pr_url,
            session.title,
            session.description,
            session.author,
            session.base_ref,
            session.head_ref,
            session.base_sha,
            session.head_sha,
            session.merge_base_sha,
            session.status.as_str(),
            session.error,
            session.pr_state.as_str(),
            session.is_own_pr,
            opt_json(session.ci.as_ref())?,
            to_json(&stats_of(session))?,
            session.new_commits,
            session.agent_passes,
            opt_json(session.posted_review.as_ref())?,
            session.last_opened_at,
        ],
    ))?;
    if changed == 0 {
        return Err(format!("Session {} not found.", session.id));
    }
    write_commit_source(conn, session)
}

pub fn get_session(conn: &Connection, id: &str) -> DbResult<Option<SessionRow>> {
    e(conn
        .query_row(
            &format!("SELECT {SESSION_COLS} FROM review_sessions s WHERE s.id = ?1"),
            params![id],
            session_from_row,
        )
        .optional())
}

/// Non-archived sessions of non-archived repos, most recently opened first.
pub fn list_sessions(conn: &Connection) -> DbResult<Vec<ReviewSession>> {
    let mut stmt = e(conn.prepare(&format!(
        "SELECT {SESSION_COLS} FROM review_sessions s
         JOIN repos r ON r.id = s.repo_id
         WHERE s.archived = 0 AND r.archived = 0
         ORDER BY datetime(s.last_opened_at) DESC, s.rowid DESC"
    )))?;
    let rows = e(stmt.query_map([], session_from_row))?;
    Ok(e(rows.collect::<rusqlite::Result<Vec<SessionRow>>>())?
        .into_iter()
        .map(|r| r.session)
        .collect())
}

/// Every session row that still has a worktree path (for pruning).
pub fn list_sessions_with_worktrees(conn: &Connection) -> DbResult<Vec<SessionRow>> {
    let mut stmt = e(conn.prepare(&format!(
        "SELECT {SESSION_COLS} FROM review_sessions s
         WHERE s.worktree_path IS NOT NULL AND s.worktree_path != ''"
    )))?;
    let rows = e(stmt.query_map([], session_from_row))?;
    e(rows.collect())
}

/// An existing non-archived session for the same PR / branch pair, if any.
pub fn find_session_by_source(
    conn: &Connection,
    repo_id: &str,
    source: &SessionSource,
) -> DbResult<Option<ReviewSession>> {
    let row = match source {
        SessionSource::Pr { number, .. } => conn
            .query_row(
                &format!(
                    "SELECT {SESSION_COLS} FROM review_sessions s
                     WHERE s.archived = 0 AND s.repo_id = ?1 AND s.source_kind = 'pr' AND s.pr_number = ?2
                     ORDER BY s.rowid DESC LIMIT 1"
                ),
                params![repo_id, *number as i64],
                session_from_row,
            )
            .optional(),
        SessionSource::Branches { base, head } => conn
            .query_row(
                &format!(
                    "SELECT {SESSION_COLS} FROM review_sessions s
                     WHERE s.archived = 0 AND s.repo_id = ?1 AND s.source_kind = 'branches'
                       AND s.base_ref = ?2 AND s.head_ref = ?3
                     ORDER BY s.rowid DESC LIMIT 1"
                ),
                params![repo_id, base, head],
                session_from_row,
            )
            .optional(),
        // The same commits are the same review whichever branch they were
        // picked from.
        SessionSource::Commits { base, head, .. } => conn
            .query_row(
                &format!(
                    "SELECT {SESSION_COLS} FROM review_sessions s
                     JOIN session_commits sc ON sc.session_id = s.id
                     WHERE s.archived = 0 AND s.repo_id = ?1 AND s.source_kind = 'commits'
                       AND sc.base_sha = ?2 AND sc.head_sha = ?3
                     ORDER BY s.rowid DESC LIMIT 1"
                ),
                params![repo_id, base, head],
                session_from_row,
            )
            .optional(),
    };
    Ok(e(row)?.map(|r| r.session))
}

/// Head SHA of the most recent non-archived commit review of `branch` in
/// this repo.
pub fn last_reviewed_commit(
    conn: &Connection,
    repo_id: &str,
    branch: &str,
) -> DbResult<Option<String>> {
    e(conn
        .query_row(
            "SELECT sc.head_sha FROM review_sessions s
             JOIN session_commits sc ON sc.session_id = s.id
             WHERE s.archived = 0 AND s.repo_id = ?1 AND s.source_kind = 'commits'
               AND sc.branch = ?2
             ORDER BY datetime(s.created_at) DESC, s.rowid DESC LIMIT 1",
            params![repo_id, branch],
            |r| r.get(0),
        )
        .optional())
}

fn update_one(conn: &Connection, sql: &str, p: impl rusqlite::Params, id: &str) -> DbResult<()> {
    if e(conn.execute(sql, p))? == 0 {
        return Err(format!("Session {id} not found."));
    }
    Ok(())
}

pub fn set_session_status(
    conn: &Connection,
    id: &str,
    status: SessionStatus,
    error: Option<&str>,
) -> DbResult<()> {
    update_one(
        conn,
        "UPDATE review_sessions SET status = ?2, error = ?3 WHERE id = ?1",
        params![id, status.as_str(), error],
        id,
    )
}

pub fn set_session_refs(
    conn: &Connection,
    id: &str,
    base_sha: &str,
    head_sha: &str,
    merge_base_sha: &str,
) -> DbResult<()> {
    update_one(
        conn,
        "UPDATE review_sessions SET base_sha = ?2, head_sha = ?3, merge_base_sha = ?4 WHERE id = ?1",
        params![id, base_sha, head_sha, merge_base_sha],
        id,
    )
}

pub fn set_session_worktree(
    conn: &Connection,
    id: &str,
    worktree_path: Option<&str>,
) -> DbResult<()> {
    update_one(
        conn,
        "UPDATE review_sessions SET worktree_path = ?2 WHERE id = ?1",
        params![id, worktree_path],
        id,
    )
}

pub fn set_session_diff_stats(conn: &Connection, id: &str, stats: &DiffStats) -> DbResult<()> {
    update_one(
        conn,
        "UPDATE review_sessions SET diff_stats_json = ?2 WHERE id = ?1",
        params![id, to_json(stats)?],
        id,
    )
}

pub fn set_session_new_commits(conn: &Connection, id: &str, new_commits: u32) -> DbResult<()> {
    update_one(
        conn,
        "UPDATE review_sessions SET new_commits = ?2 WHERE id = ?1",
        params![id, new_commits],
        id,
    )
}

pub fn set_session_posted_review(
    conn: &Connection,
    id: &str,
    review: Option<&PostedReview>,
) -> DbResult<()> {
    update_one(
        conn,
        "UPDATE review_sessions SET posted_review_json = ?2 WHERE id = ?1",
        params![id, opt_json(review)?],
        id,
    )
}

/// Set `last_opened_at` to now.
pub fn touch_session(conn: &Connection, id: &str) -> DbResult<()> {
    update_one(
        conn,
        "UPDATE review_sessions SET last_opened_at = ?2 WHERE id = ?1",
        params![id, now_iso()],
        id,
    )
}

/// Add one to `agent_passes` (SPEC §4.5).
pub fn increment_agent_passes(conn: &Connection, id: &str) -> DbResult<()> {
    update_one(
        conn,
        "UPDATE review_sessions SET agent_passes = agent_passes + 1 WHERE id = ?1",
        params![id],
        id,
    )
}

/// Archive a session: hidden from lists, status `closed`, worktree path
/// cleared, history kept. Remove the worktree itself with
/// `git::remove_worktree` first (read the path with `get_session`).
pub fn archive_session(conn: &Connection, id: &str) -> DbResult<()> {
    update_one(
        conn,
        "UPDATE review_sessions SET archived = 1, status = 'closed', worktree_path = NULL WHERE id = ?1",
        params![id],
        id,
    )
}

/// Archive every session of a repo (SPEC §5.8: removing a repo archives
/// its sessions). Returns the rows as they were, so the caller can remove
/// their worktrees.
pub fn archive_sessions_for_repo(conn: &Connection, repo_id: &str) -> DbResult<Vec<SessionRow>> {
    let rows = {
        let mut stmt = e(conn.prepare(&format!(
            "SELECT {SESSION_COLS} FROM review_sessions s WHERE s.repo_id = ?1 AND s.archived = 0"
        )))?;
        let rows = e(stmt.query_map(params![repo_id], session_from_row))?;
        e(rows.collect::<rusqlite::Result<Vec<SessionRow>>>())?
    };
    e(conn.execute(
        "UPDATE review_sessions SET archived = 1, status = 'closed', worktree_path = NULL
         WHERE repo_id = ?1 AND archived = 0",
        params![repo_id],
    ))?;
    Ok(rows)
}

// ── analyses (cache keyed by session + kind + headSha) ─────

const ANALYSIS_COLS: &str = "session_id, kind, head_sha, status, result_json, verification_json, \
     error, error_details, started_at, finished_at";

fn analysis_from_row(row: &Row<'_>) -> rusqlite::Result<Analysis> {
    Ok(Analysis {
        session_id: row.get(0)?,
        kind: row.get(1)?,
        head_sha: row.get(2)?,
        status: AnalysisStatus::parse(&row.get::<_, String>(3)?),
        result: from_json(row.get(4)?),
        verification: from_json(row.get(5)?),
        error: row.get(6)?,
        error_details: row.get(7)?,
        progress: None,
        started_at: row.get(8)?,
        finished_at: row.get(9)?,
    })
}

/// Insert or replace the analysis for `(session_id, kind, head_sha)`.
/// `progress` is not persisted.
pub fn upsert_analysis(conn: &Connection, analysis: &Analysis) -> DbResult<()> {
    if analysis.head_sha.is_empty() {
        return Err("An analysis needs a head SHA.".to_string());
    }
    e(conn.execute(
        "INSERT INTO analyses (session_id, kind, head_sha, status, result_json, verification_json,
                               error, error_details, started_at, finished_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(session_id, kind, head_sha) DO UPDATE SET
            status = excluded.status, result_json = excluded.result_json,
            verification_json = excluded.verification_json, error = excluded.error,
            error_details = excluded.error_details, started_at = excluded.started_at,
            finished_at = excluded.finished_at",
        params![
            analysis.session_id,
            analysis.kind,
            analysis.head_sha,
            analysis.status.as_str(),
            opt_json(analysis.result.as_ref())?,
            opt_json(analysis.verification.as_ref())?,
            analysis.error,
            analysis.error_details,
            analysis.started_at,
            analysis.finished_at,
        ],
    ))?;
    Ok(())
}

/// The analysis for exactly this head. Never returns a row computed for a
/// different `head_sha`.
pub fn get_analysis(
    conn: &Connection,
    session_id: &str,
    kind: &str,
    head_sha: &str,
) -> DbResult<Option<Analysis>> {
    e(conn
        .query_row(
            &format!(
                "SELECT {ANALYSIS_COLS} FROM analyses
                 WHERE session_id = ?1 AND kind = ?2 AND head_sha = ?3"
            ),
            params![session_id, kind, head_sha],
            analysis_from_row,
        )
        .optional())
}

/// All analyses of a session for exactly this head.
pub fn list_analyses(
    conn: &Connection,
    session_id: &str,
    head_sha: &str,
) -> DbResult<Vec<Analysis>> {
    let mut stmt = e(conn.prepare(&format!(
        "SELECT {ANALYSIS_COLS} FROM analyses
         WHERE session_id = ?1 AND head_sha = ?2 ORDER BY rowid"
    )))?;
    let rows = e(stmt.query_map(params![session_id, head_sha], analysis_from_row))?;
    e(rows.collect())
}

pub fn delete_analysis(
    conn: &Connection,
    session_id: &str,
    kind: &str,
    head_sha: &str,
) -> DbResult<()> {
    e(conn.execute(
        "DELETE FROM analyses WHERE session_id = ?1 AND kind = ?2 AND head_sha = ?3",
        params![session_id, kind, head_sha],
    ))?;
    Ok(())
}

/// On app start: analyses and asks left `running` / `pending`, and sessions
/// left `preparing`, by a previous process become errors ("Interrupted").
/// Returns how many rows changed.
pub fn mark_interrupted(conn: &Connection) -> DbResult<usize> {
    const MSG: &str = "Interrupted when grsp closed. Retry to run it again.";
    let now = now_iso();
    let a = e(conn.execute(
        "UPDATE analyses SET status = 'error', error = ?1, finished_at = ?2
         WHERE status IN ('running', 'pending')",
        params![MSG, now],
    ))?;
    let b = e(conn.execute(
        "UPDATE ask_messages SET status = 'error', error = ?1 WHERE status = 'running'",
        params![MSG],
    ))?;
    let c = e(conn.execute(
        "UPDATE review_sessions SET status = 'error', error = ?1 WHERE status = 'preparing' AND archived = 0",
        params![MSG],
    ))?;
    Ok(a + b + c)
}

// ── ask_messages ───────────────────────────────────────────

const ASK_COLS: &str =
    "id, session_id, question, status, answer_json, verification_json, error, head_sha, created_at";

fn ask_from_row(row: &Row<'_>) -> rusqlite::Result<AskMessage> {
    Ok(AskMessage {
        id: row.get(0)?,
        session_id: row.get(1)?,
        question: row.get(2)?,
        status: AskStatus::parse(&row.get::<_, String>(3)?),
        answer: from_json(row.get(4)?),
        verification: from_json(row.get(5)?),
        error: row.get(6)?,
        progress: None,
        head_sha: row.get(7)?,
        created_at: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
    })
}

pub fn insert_ask_message(conn: &Connection, msg: &AskMessage) -> DbResult<()> {
    let created = if msg.created_at.is_empty() {
        now_iso()
    } else {
        msg.created_at.clone()
    };
    e(conn.execute(
        "INSERT INTO ask_messages (id, session_id, question, status, answer_json, verification_json,
                                   error, head_sha, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            msg.id,
            msg.session_id,
            msg.question,
            msg.status.as_str(),
            opt_json(msg.answer.as_ref())?,
            opt_json(msg.verification.as_ref())?,
            msg.error,
            msg.head_sha,
            created,
        ],
    ))?;
    Ok(())
}

/// Write status, answer, verification and error.
pub fn update_ask_message(conn: &Connection, msg: &AskMessage) -> DbResult<()> {
    let changed = e(conn.execute(
        "UPDATE ask_messages SET status = ?2, answer_json = ?3, verification_json = ?4, error = ?5
         WHERE id = ?1",
        params![
            msg.id,
            msg.status.as_str(),
            opt_json(msg.answer.as_ref())?,
            opt_json(msg.verification.as_ref())?,
            msg.error,
        ],
    ))?;
    if changed == 0 {
        return Err(format!("Message {} not found.", msg.id));
    }
    Ok(())
}

pub fn get_ask_message(conn: &Connection, id: &str) -> DbResult<Option<AskMessage>> {
    e(conn
        .query_row(
            &format!("SELECT {ASK_COLS} FROM ask_messages WHERE id = ?1"),
            params![id],
            ask_from_row,
        )
        .optional())
}

/// A session's history, newest first (all head SHAs — answers from earlier
/// heads are kept and marked "from an earlier version" by comparing
/// `head_sha` with the session's).
pub fn list_ask_messages(conn: &Connection, session_id: &str) -> DbResult<Vec<AskMessage>> {
    let mut stmt = e(conn.prepare(&format!(
        "SELECT {ASK_COLS} FROM ask_messages WHERE session_id = ?1 ORDER BY rowid DESC"
    )))?;
    let rows = e(stmt.query_map(params![session_id], ask_from_row))?;
    e(rows.collect())
}

/// The last `limit` answered Q&As, oldest first (follow-up context).
pub fn recent_answered_asks(
    conn: &Connection,
    session_id: &str,
    limit: usize,
) -> DbResult<Vec<AskMessage>> {
    let mut stmt = e(conn.prepare(&format!(
        "SELECT {ASK_COLS} FROM ask_messages
         WHERE session_id = ?1 AND status = 'done' AND answer_json IS NOT NULL
         ORDER BY rowid DESC LIMIT ?2"
    )))?;
    let rows = e(stmt.query_map(params![session_id, limit as i64], ask_from_row))?;
    let mut out: Vec<AskMessage> = e(rows.collect())?;
    out.reverse();
    Ok(out)
}

// ── question_state ─────────────────────────────────────────

pub fn set_question_opened(
    conn: &Connection,
    session_id: &str,
    question_id: &str,
    opened: bool,
) -> DbResult<()> {
    e(conn.execute(
        "INSERT INTO question_state (session_id, question_id, opened) VALUES (?1, ?2, ?3)
         ON CONFLICT(session_id, question_id) DO UPDATE SET opened = excluded.opened",
        params![session_id, question_id, opened],
    ))?;
    Ok(())
}

pub fn opened_questions(conn: &Connection, session_id: &str) -> DbResult<HashSet<String>> {
    let mut stmt = e(conn
        .prepare("SELECT question_id FROM question_state WHERE session_id = ?1 AND opened != 0"))?;
    let rows = e(stmt.query_map(params![session_id], |r| r.get::<_, String>(0)))?;
    e(rows.collect())
}

// ── findings ───────────────────────────────────────────────

/// Replace the session's unposted findings with `findings` (posted ones
/// are kept as history). Each stored finding gets a fresh globally unique
/// id; the returned findings carry those ids — use them in the ReviewResult.
pub fn replace_findings(
    conn: &Connection,
    session_id: &str,
    head_sha: &str,
    findings: &[Finding],
) -> DbResult<Vec<Finding>> {
    let tx = e(conn.unchecked_transaction())?;
    e(tx.execute(
        "DELETE FROM findings WHERE session_id = ?1 AND posted_review_id IS NULL",
        params![session_id],
    ))?;
    let now = now_iso();
    let mut stored = Vec::with_capacity(findings.len());
    for (position, finding) in findings.iter().enumerate() {
        let mut f = finding.clone();
        f.id = uuid::Uuid::new_v4().to_string();
        e(tx.execute(
            "INSERT INTO findings (id, session_id, head_sha, position, finding_json, comment, included, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![f.id, session_id, head_sha, position as i64, to_json(&f)?, f.comment, f.included, now],
        ))?;
        stored.push(f);
    }
    e(tx.commit())?;
    Ok(stored)
}

/// Unposted findings for exactly this head, in order, with the user's
/// edited `comment` / `included` applied.
pub fn list_findings(
    conn: &Connection,
    session_id: &str,
    head_sha: &str,
) -> DbResult<Vec<Finding>> {
    let mut stmt = e(conn.prepare(
        "SELECT id, finding_json, comment, included FROM findings
         WHERE session_id = ?1 AND head_sha = ?2 AND posted_review_id IS NULL
         ORDER BY position, rowid",
    ))?;
    let rows = e(stmt.query_map(params![session_id, head_sha], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, i64>(3)?,
        ))
    }))?;
    let mut out = Vec::new();
    for row in rows {
        let (id, json, comment, included) = e(row)?;
        // A row that no longer matches the schema is skipped, not fatal.
        if let Ok(mut f) = serde_json::from_str::<Finding>(&json) {
            f.id = id;
            f.comment = comment;
            f.included = included != 0;
            out.push(f);
        }
    }
    Ok(out)
}

/// Edit an unposted finding's comment and/or inclusion. Errors if it
/// doesn't exist in this session.
pub fn update_finding(
    conn: &Connection,
    session_id: &str,
    finding_id: &str,
    comment: Option<&str>,
    included: Option<bool>,
) -> DbResult<()> {
    let changed = e(conn.execute(
        "UPDATE findings SET comment = COALESCE(?3, comment), included = COALESCE(?4, included)
         WHERE id = ?1 AND session_id = ?2 AND posted_review_id IS NULL",
        params![finding_id, session_id, comment, included],
    ))?;
    if changed == 0 {
        return Err("That finding no longer exists.".to_string());
    }
    Ok(())
}

/// Mark this head's unposted findings as posted under `review_id`.
pub fn mark_findings_posted(
    conn: &Connection,
    session_id: &str,
    head_sha: &str,
    review_id: &str,
) -> DbResult<()> {
    e(conn.execute(
        "UPDATE findings SET posted_review_id = ?3
         WHERE session_id = ?1 AND head_sha = ?2 AND posted_review_id IS NULL",
        params![session_id, head_sha, review_id],
    ))?;
    Ok(())
}

// ── notes (private, local only) ────────────────────────────

const NOTE_COLS: &str = "id, session_id, body, anchor_json, head_sha, created_at, updated_at";

fn note_from_row(row: &Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        session_id: row.get(1)?,
        body: row.get(2)?,
        anchor: from_json(row.get(3)?),
        head_sha: row.get(4)?,
        created_at: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
        updated_at: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
    })
}

pub fn get_note(conn: &Connection, id: &str) -> DbResult<Option<Note>> {
    e(conn
        .query_row(
            &format!("SELECT {NOTE_COLS} FROM notes WHERE id = ?1"),
            params![id],
            note_from_row,
        )
        .optional())
}

/// A session's notes, oldest first.
pub fn list_notes(conn: &Connection, session_id: &str) -> DbResult<Vec<Note>> {
    let mut stmt = e(conn.prepare(&format!(
        "SELECT {NOTE_COLS} FROM notes WHERE session_id = ?1 ORDER BY created_at, rowid"
    )))?;
    let rows = e(stmt.query_map(params![session_id], note_from_row))?;
    e(rows.collect())
}

/// Create a note, or change the body of note `id`. The body is trimmed and
/// must not be empty. A new note is pinned to the session's current head;
/// an edit keeps the note's anchor and head.
pub fn save_note(
    conn: &Connection,
    session_id: &str,
    id: Option<&str>,
    body: &str,
    anchor: Option<&NoteAnchor>,
) -> DbResult<Note> {
    let body = body.trim();
    if body.is_empty() {
        return Err("A note can't be empty.".to_string());
    }
    let now = now_iso();
    let gone = || "That note no longer exists.".to_string();
    if let Some(id) = id {
        let changed = e(conn.execute(
            "UPDATE notes SET body = ?3, updated_at = ?4 WHERE id = ?1 AND session_id = ?2",
            params![id, session_id, body, now],
        ))?;
        if changed == 0 {
            return Err(gone());
        }
        return get_note(conn, id)?.ok_or_else(gone);
    }
    let session = get_session(conn, session_id)?
        .ok_or_else(|| "That session no longer exists.".to_string())?
        .session;
    let note = Note {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: session_id.to_string(),
        body: body.to_string(),
        anchor: anchor.cloned(),
        head_sha: session.head_sha.unwrap_or_default(),
        created_at: now.clone(),
        updated_at: now,
    };
    e(conn.execute(
        "INSERT INTO notes (id, session_id, body, anchor_json, head_sha, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            note.id,
            note.session_id,
            note.body,
            opt_json(note.anchor.as_ref())?,
            note.head_sha,
            note.created_at,
            note.updated_at,
        ],
    ))?;
    Ok(note)
}

/// Delete a note. Deleting one that is already gone is not an error.
pub fn delete_note(conn: &Connection, id: &str) -> DbResult<()> {
    e(conn.execute("DELETE FROM notes WHERE id = ?1", params![id]))?;
    Ok(())
}

// ── settings ───────────────────────────────────────────────

/// One JSON-decoded setting value, if present. A value that isn't valid
/// JSON is returned as a plain string.
pub fn read_setting(conn: &Connection, key: &str) -> DbResult<Option<serde_json::Value>> {
    let raw: Option<String> = e(conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |r| r.get(0),
        )
        .optional())?;
    Ok(raw.map(|text| serde_json::from_str(&text).unwrap_or(serde_json::Value::String(text))))
}

fn as_bool(v: &serde_json::Value) -> Option<bool> {
    match v {
        serde_json::Value::Bool(b) => Some(*b),
        serde_json::Value::Number(n) => n.as_i64().map(|i| i != 0),
        serde_json::Value::String(s) => match s.as_str() {
            "true" | "1" => Some(true),
            "false" | "0" => Some(false),
            _ => None,
        },
        _ => None,
    }
}

/// All settings with `DEFAULT_SETTINGS` filled in for missing or invalid values.
pub fn read_settings(conn: &Connection) -> DbResult<GrspSettings> {
    let mut s = GrspSettings::default();
    if let Some(serde_json::Value::String(p)) = read_setting(conn, settings_keys::REVIEW_PROMPT)? {
        s.review_prompt = p;
    }
    if let Some(serde_json::Value::String(a)) = read_setting(conn, settings_keys::AGENT)? {
        match a.as_str() {
            "claude" => s.agent = AgentKind::Claude,
            "codex" => s.agent = AgentKind::Codex,
            _ => {}
        }
    }
    let flag = |key: &str, default: bool| -> DbResult<bool> {
        Ok(read_setting(conn, key)?
            .as_ref()
            .and_then(as_bool)
            .unwrap_or(default))
    };
    s.comprehension_questions = flag(
        settings_keys::COMPREHENSION_QUESTIONS,
        s.comprehension_questions,
    )?;
    s.show_unchanged_blocks = flag(
        settings_keys::SHOW_UNCHANGED_BLOCKS,
        s.show_unchanged_blocks,
    )?;
    s.auto_run_review = flag(settings_keys::AUTO_RUN_REVIEW, s.auto_run_review)?;
    if let Some(v) = read_setting(conn, settings_keys::TRACE_DEPTH)? {
        let depth = v
            .as_u64()
            .or_else(|| v.as_str().and_then(|t| t.parse().ok()));
        if let Some(d @ 1..=3) = depth {
            s.trace_depth = d as u8;
        }
    }
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn db() -> Connection {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO repos (id, name, path, default_branch, remote_host, remote_owner, remote_name, language)
             VALUES ('r1', 'shop', '/code/shop', 'main', 'github', 'Acme', 'Shop', 'Python')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO repos (id, name, path, default_branch) VALUES ('r2', 'local', '/code/local', 'trunk')",
            [],
        )
        .unwrap();
        conn
    }

    fn session(id: &str, repo: &str, number: u64) -> ReviewSession {
        ReviewSession {
            id: id.into(),
            repo_id: repo.into(),
            source: SessionSource::Pr {
                number,
                url: format!("https://github.com/acme/shop/pull/{number}"),
            },
            title: "Require approval".into(),
            description: "Orders above 10k need approval".into(),
            author: "ana".into(),
            base_ref: "main".into(),
            head_ref: "approval".into(),
            base_sha: None,
            head_sha: None,
            merge_base_sha: None,
            status: SessionStatus::Preparing,
            error: None,
            pr_state: PrState::Open,
            is_own_pr: false,
            ci: None,
            files_changed: 0,
            lines_added: 0,
            lines_removed: 0,
            new_commits: 0,
            agent_passes: 0,
            posted_review: None,
            created_at: String::new(),
            last_opened_at: String::new(),
        }
    }

    fn commit_session(id: &str, branch: Option<&str>, base: &str, head: &str) -> ReviewSession {
        let mut s = session(id, "r1", 0);
        s.source = SessionSource::Commits {
            branch: branch.map(String::from),
            base: base.into(),
            head: head.into(),
            count: 2,
        };
        s.base_ref = base[..7].into();
        s.head_ref = branch.unwrap_or(&head[..7]).into();
        s.base_sha = Some(base.into());
        s.head_sha = Some(head.into());
        s.merge_base_sha = Some(base.into());
        s
    }

    fn tables(conn: &Connection) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .unwrap();
        let rows = stmt.query_map([], |r| r.get::<_, String>(0)).unwrap();
        rows.map(Result::unwrap).collect()
    }

    fn only_migration_one(conn: &Connection) {
        let first = crate::migrations::migrations()
            .into_iter()
            .find(|m| m.version == 1)
            .unwrap();
        conn.execute_batch(first.sql).unwrap();
    }

    #[test]
    fn migrations_are_versioned_in_order_and_idempotent() {
        let versions: Vec<i64> = crate::migrations::migrations()
            .iter()
            .map(|m| m.version)
            .collect();
        assert_eq!(versions, vec![1, 2]);

        let conn = open_in_memory().unwrap();
        let fresh = tables(&conn);
        for t in ["review_sessions", "notes", "session_commits"] {
            assert!(fresh.contains(&t.to_string()), "{t} missing from {fresh:?}");
        }
        // tauri-plugin-sql runs them again after Rust has; that must be safe.
        apply_migrations(&conn).unwrap();
        assert_eq!(tables(&conn), fresh);
    }

    #[test]
    fn a_database_with_only_the_first_migration_is_brought_up_to_date() {
        let conn = Connection::open_in_memory().unwrap();
        only_migration_one(&conn);
        conn.execute(
            "INSERT INTO repos (id, name, path) VALUES ('r1', 'shop', '/code/shop')",
            [],
        )
        .unwrap();
        // A session written by the older app version.
        conn.execute(
            "INSERT INTO review_sessions (id, repo_id, source_kind, pr_number, base_ref, head_ref)
             VALUES ('old', 'r1', 'pr', 7, 'main', 'feature')",
            [],
        )
        .unwrap();
        assert!(!tables(&conn).contains(&"notes".to_string()));

        ensure_schema(&conn).unwrap();
        assert!(tables(&conn).contains(&"notes".to_string()));
        assert!(tables(&conn).contains(&"session_commits".to_string()));
        // Existing rows are untouched and readable through the new queries.
        let old = get_session(&conn, "old").unwrap().unwrap().session;
        assert_eq!(old.source.pr_number(), Some(7));
        let note = save_note(&conn, "old", None, "first", None).unwrap();
        assert_eq!(list_notes(&conn, "old").unwrap(), vec![note]);
        // Checking again changes nothing.
        ensure_schema(&conn).unwrap();
        assert_eq!(list_notes(&conn, "old").unwrap().len(), 1);
    }

    #[test]
    fn opening_a_database_file_migrates_it_whatever_state_it_is_in() {
        let dir = tempfile::tempdir().unwrap();
        // Brand new.
        let conn = open(dir.path()).unwrap();
        assert!(tables(&conn).contains(&"notes".to_string()));
        drop(conn);

        // Created by a version that only had the first migration.
        let old_dir = tempfile::tempdir().unwrap();
        {
            let conn = Connection::open(db_path(old_dir.path())).unwrap();
            only_migration_one(&conn);
            assert!(!tables(&conn).contains(&"notes".to_string()));
        }
        let conn = open(old_dir.path()).unwrap();
        assert!(tables(&conn).contains(&"notes".to_string()));
        assert!(list_notes(&conn, "nobody").unwrap().is_empty());
        assert!(list_sessions(&conn).unwrap().is_empty());
    }

    #[test]
    fn commit_sessions_round_trip_and_are_found_by_their_commits() {
        let conn = db();
        let (base, head) = ("b".repeat(40), "a".repeat(40));
        let s = commit_session("c1", Some("main"), &base, &head);
        insert_session(&conn, &s, None).unwrap();

        let row = get_session(&conn, "c1").unwrap().unwrap();
        assert_eq!(row.session.source, s.source);
        assert_eq!(row.session.head_ref, "main");
        assert_eq!(row.session.base_ref, "bbbbbbb");
        assert_eq!(row.session.head_sha.as_deref(), Some(head.as_str()));
        assert_eq!(list_sessions(&conn).unwrap()[0].source, s.source);

        // Found by base and head, whichever branch it is asked for under.
        let probe = |branch: Option<&str>, base: &str, head: &str| SessionSource::Commits {
            branch: branch.map(String::from),
            base: base.into(),
            head: head.into(),
            count: 9,
        };
        let found = |src: &SessionSource| {
            find_session_by_source(&conn, "r1", src)
                .unwrap()
                .map(|s| s.id)
        };
        assert_eq!(found(&probe(Some("main"), &base, &head)), Some("c1".into()));
        assert_eq!(found(&probe(None, &base, &head)), Some("c1".into()));
        // A different run ending at the same commit is a different review.
        assert_eq!(found(&probe(Some("main"), &"c".repeat(40), &head)), None);
        assert_eq!(found(&probe(Some("main"), &base, &"d".repeat(40))), None);
        assert_eq!(
            find_session_by_source(&conn, "r2", &probe(Some("main"), &base, &head)).unwrap(),
            None
        );
        // A PR or branch lookup never returns a commit session.
        assert_eq!(
            find_session_by_source(
                &conn,
                "r1",
                &SessionSource::Branches {
                    base: "bbbbbbb".into(),
                    head: "main".into()
                }
            )
            .unwrap(),
            None
        );

        // update_session keeps the detail row in step.
        let mut changed = row.session.clone();
        changed.source = SessionSource::Commits {
            branch: None,
            base: base.clone(),
            head: head.clone(),
            count: 5,
        };
        update_session(&conn, &changed).unwrap();
        assert_eq!(
            get_session(&conn, "c1").unwrap().unwrap().session.source,
            changed.source
        );

        archive_session(&conn, "c1").unwrap();
        assert_eq!(found(&probe(Some("main"), &base, &head)), None);
    }

    #[test]
    fn last_reviewed_commit_is_the_newest_unarchived_review_of_that_branch() {
        let conn = db();
        let base = "b".repeat(40);
        assert_eq!(last_reviewed_commit(&conn, "r1", "main").unwrap(), None);

        let mut first = commit_session("c1", Some("main"), &base, &"1".repeat(40));
        first.created_at = "2026-10-01T10:00:00.000Z".into();
        let mut second = commit_session("c2", Some("main"), &base, &"2".repeat(40));
        second.created_at = "2026-10-02T10:00:00.000Z".into();
        let mut other_branch = commit_session("c3", Some("release"), &base, &"3".repeat(40));
        other_branch.created_at = "2026-10-03T10:00:00.000Z".into();
        let mut no_branch = commit_session("c4", None, &base, &"4".repeat(40));
        no_branch.created_at = "2026-10-04T10:00:00.000Z".into();
        let mut other_repo = commit_session("c5", Some("main"), &base, &"5".repeat(40));
        other_repo.repo_id = "r2".into();
        other_repo.created_at = "2026-10-05T10:00:00.000Z".into();
        // Inserted out of order: the creation time decides, not the row order.
        for s in [&second, &first, &other_branch, &no_branch, &other_repo] {
            insert_session(&conn, s, None).unwrap();
        }

        assert_eq!(
            last_reviewed_commit(&conn, "r1", "main").unwrap(),
            Some("2".repeat(40))
        );
        assert_eq!(
            last_reviewed_commit(&conn, "r1", "release").unwrap(),
            Some("3".repeat(40))
        );
        assert_eq!(last_reviewed_commit(&conn, "r1", "nope").unwrap(), None);

        archive_session(&conn, "c2").unwrap();
        assert_eq!(
            last_reviewed_commit(&conn, "r1", "main").unwrap(),
            Some("1".repeat(40))
        );
    }

    #[test]
    fn notes_are_created_edited_listed_oldest_first_and_deleted() {
        let conn = db();
        let mut s = session("s1", "r1", 1);
        s.head_sha = Some("h".repeat(40));
        insert_session(&conn, &s, None).unwrap();
        insert_session(&conn, &session("s2", "r1", 2), None).unwrap();

        let line = NoteAnchor::Line {
            file: "orders/policy.txt".into(),
            line: 12,
            side: DiffSide::New,
        };
        let a = save_note(&conn, "s1", None, "  Check the boundary.\n", Some(&line)).unwrap();
        assert_eq!(a.body, "Check the boundary.");
        assert_eq!(a.session_id, "s1");
        assert_eq!(a.anchor.as_ref(), Some(&line));
        assert_eq!(a.head_sha, "h".repeat(40));
        assert_eq!(a.created_at, a.updated_at);
        assert!(chrono::DateTime::parse_from_rfc3339(&a.created_at).is_ok());

        let block = NoteAnchor::Block {
            entry_point_id: "ep1".into(),
            block_id: "b3".into(),
            label: "save_order".into(),
        };
        let b = save_note(&conn, "s1", None, "Whole-review thought", None).unwrap();
        let c = save_note(&conn, "s1", None, "On a block", Some(&block)).unwrap();
        assert_eq!(b.anchor, None);
        assert_ne!(a.id, b.id);
        // A session that isn't prepared yet has no head to pin the note to.
        let other = save_note(&conn, "s2", None, "elsewhere", None).unwrap();
        assert_eq!(other.head_sha, "");

        let ids = |sid: &str| -> Vec<String> {
            list_notes(&conn, sid)
                .unwrap()
                .into_iter()
                .map(|n| n.id)
                .collect()
        };
        assert_eq!(ids("s1"), vec![a.id.clone(), b.id.clone(), c.id.clone()]);
        assert_eq!(ids("s2"), vec![other.id.clone()]);
        assert_eq!(list_notes(&conn, "s1").unwrap()[2].anchor, Some(block));

        // Editing changes the body only, and keeps the note's place in the list.
        conn.execute(
            "UPDATE notes SET updated_at = '2020-01-01T00:00:00.000Z' WHERE id = ?1",
            [&a.id],
        )
        .unwrap();
        let edited = save_note(&conn, "s1", Some(&a.id), " Boundary is exclusive. ", None).unwrap();
        assert_eq!(edited.id, a.id);
        assert_eq!(edited.body, "Boundary is exclusive.");
        assert_eq!(
            edited.anchor.as_ref(),
            Some(&line),
            "the anchor survives an edit"
        );
        assert_eq!(edited.created_at, a.created_at);
        assert!(edited.updated_at.as_str() > "2020-01-01T00:00:00.000Z");
        assert_eq!(ids("s1"), vec![a.id.clone(), b.id.clone(), c.id.clone()]);

        // Empty bodies, unknown notes, other sessions' notes, unknown sessions.
        for blank in ["", "   ", "\n\t"] {
            assert!(save_note(&conn, "s1", None, blank, None)
                .unwrap_err()
                .contains("can't be empty"));
            assert!(save_note(&conn, "s1", Some(&a.id), blank, None).is_err());
        }
        assert_eq!(
            get_note(&conn, &a.id).unwrap().unwrap().body,
            "Boundary is exclusive."
        );
        assert!(save_note(&conn, "s1", Some("nope"), "x", None)
            .unwrap_err()
            .contains("no longer exists"));
        assert!(save_note(&conn, "s2", Some(&a.id), "hijack", None).is_err());
        assert!(save_note(&conn, "missing", None, "x", None)
            .unwrap_err()
            .contains("session no longer exists"));

        delete_note(&conn, &b.id).unwrap();
        assert_eq!(ids("s1"), vec![a.id.clone(), c.id.clone()]);
        assert_eq!(get_note(&conn, &b.id).unwrap(), None);
        // Deleting again is quiet, and other sessions' notes are untouched.
        delete_note(&conn, &b.id).unwrap();
        assert_eq!(ids("s2"), vec![other.id]);
    }

    fn analysis(session: &str, kind: &str, sha: &str, marker: &str) -> Analysis {
        Analysis {
            session_id: session.into(),
            kind: kind.into(),
            head_sha: sha.into(),
            status: AnalysisStatus::Done,
            result: Some(json!({"marker": marker})),
            verification: Some(VerificationReport {
                verified: 3,
                dropped: 1,
                unverified: 0,
                notes: vec!["n".into()],
                files_explored: Some(5),
            }),
            started_at: Some(now_iso()),
            finished_at: Some(now_iso()),
            ..Default::default()
        }
    }

    #[test]
    fn migrations_apply_and_are_repeatable() {
        let conn = open_in_memory().unwrap();
        apply_migrations(&conn).unwrap();
        for table in [
            "repos",
            "review_sessions",
            "analyses",
            "ask_messages",
            "question_state",
            "findings",
            "settings",
        ] {
            let n: i64 = conn
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(n, 1, "{table}");
        }
    }

    #[test]
    fn open_creates_the_file_and_schema() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("appdata");
        let conn = open(&dir).unwrap();
        assert!(db_path(&dir).exists());
        assert!(list_sessions(&conn).unwrap().is_empty());
        drop(conn);
        // Opening again leaves existing data alone.
        let conn = open(&dir).unwrap();
        assert_eq!(read_settings(&conn).unwrap(), GrspSettings::default());
    }

    #[test]
    fn repos_read() {
        let conn = db();
        let r = get_repo(&conn, "r1").unwrap().unwrap();
        assert_eq!(r.name, "shop");
        assert_eq!(r.remote.as_ref().unwrap().owner, "Acme");
        assert_eq!(r.language.as_deref(), Some("Python"));
        assert!(r.sidebar_open);
        assert!(get_repo(&conn, "r2").unwrap().unwrap().remote.is_none());
        assert!(get_repo(&conn, "nope").unwrap().is_none());
        assert_eq!(list_repos(&conn).unwrap().len(), 2);
        assert_eq!(
            find_repo_by_remote(&conn, "acme", "shop")
                .unwrap()
                .unwrap()
                .id,
            "r1"
        );
        assert!(find_repo_by_remote(&conn, "acme", "other")
            .unwrap()
            .is_none());
        conn.execute("UPDATE repos SET archived = 1 WHERE id = 'r1'", [])
            .unwrap();
        assert!(find_repo_by_remote(&conn, "acme", "shop")
            .unwrap()
            .is_none());
        assert_eq!(list_repos(&conn).unwrap().len(), 1);
    }

    #[test]
    fn session_round_trip_and_updates() {
        let conn = db();
        insert_session(&conn, &session("s1", "r1", 482), None).unwrap();
        let row = get_session(&conn, "s1").unwrap().unwrap();
        assert_eq!(row.session.source.pr_number(), Some(482));
        assert_eq!(row.session.status, SessionStatus::Preparing);
        assert_eq!(row.worktree_path, None);
        assert!(!row.archived);
        assert!(!row.session.created_at.is_empty());

        set_session_refs(&conn, "s1", "base", "head1", "mb").unwrap();
        set_session_worktree(&conn, "s1", Some("/data/worktrees/s1")).unwrap();
        set_session_diff_stats(
            &conn,
            "s1",
            &DiffStats {
                files: 4,
                added: 30,
                removed: 7,
            },
        )
        .unwrap();
        set_session_status(&conn, "s1", SessionStatus::Ready, None).unwrap();
        set_session_new_commits(&conn, "s1", 3).unwrap();
        increment_agent_passes(&conn, "s1").unwrap();
        increment_agent_passes(&conn, "s1").unwrap();
        let review = PostedReview {
            id: "99".into(),
            url: "u".into(),
            event: ReviewEvent::RequestChanges,
        };
        set_session_posted_review(&conn, "s1", Some(&review)).unwrap();

        let row = get_session(&conn, "s1").unwrap().unwrap();
        let s = &row.session;
        assert_eq!(s.head_sha.as_deref(), Some("head1"));
        assert_eq!(s.merge_base_sha.as_deref(), Some("mb"));
        assert_eq!(
            (s.files_changed, s.lines_added, s.lines_removed),
            (4, 30, 7)
        );
        assert_eq!(s.status, SessionStatus::Ready);
        assert_eq!(s.new_commits, 3);
        assert_eq!(s.agent_passes, 2);
        assert_eq!(
            s.posted_review.as_ref().unwrap().event,
            ReviewEvent::RequestChanges
        );
        assert_eq!(row.worktree_path.as_deref(), Some("/data/worktrees/s1"));

        // Full update from the struct keeps the worktree path.
        let mut edited = s.clone();
        edited.title = "New title".into();
        edited.pr_state = PrState::Merged;
        edited.is_own_pr = true;
        edited.ci = Some(CiStatus {
            state: CiState::Passing,
            passed: 4,
            total: 4,
        });
        edited.status = SessionStatus::Stale;
        update_session(&conn, &edited).unwrap();
        let row = get_session(&conn, "s1").unwrap().unwrap();
        assert_eq!(row.session, edited);
        assert_eq!(row.worktree_path.as_deref(), Some("/data/worktrees/s1"));

        assert!(set_session_status(&conn, "missing", SessionStatus::Ready, None).is_err());
        assert!(update_session(&conn, &session("missing", "r1", 1)).is_err());
    }

    #[test]
    fn branch_sessions_and_lookup_by_source() {
        let conn = db();
        let mut s = session("s2", "r2", 0);
        s.source = SessionSource::Branches {
            base: "trunk".into(),
            head: "feature/x".into(),
        };
        s.base_ref = "trunk".into();
        s.head_ref = "feature/x".into();
        insert_session(&conn, &s, None).unwrap();
        insert_session(&conn, &session("s1", "r1", 482), None).unwrap();

        let got = get_session(&conn, "s2").unwrap().unwrap().session;
        assert_eq!(got.source, s.source);

        let found = find_session_by_source(&conn, "r2", &s.source)
            .unwrap()
            .unwrap();
        assert_eq!(found.id, "s2");
        let pr = SessionSource::Pr {
            number: 482,
            url: String::new(),
        };
        assert_eq!(
            find_session_by_source(&conn, "r1", &pr)
                .unwrap()
                .unwrap()
                .id,
            "s1"
        );
        assert!(find_session_by_source(&conn, "r2", &pr).unwrap().is_none());
        let other = SessionSource::Pr {
            number: 483,
            url: String::new(),
        };
        assert!(find_session_by_source(&conn, "r1", &other)
            .unwrap()
            .is_none());
    }

    #[test]
    fn listing_ordering_archiving() {
        let conn = db();
        let mut a = session("a", "r1", 1);
        a.last_opened_at = "2026-03-01T10:00:00.000Z".into();
        let mut b = session("b", "r1", 2);
        b.last_opened_at = "2026-03-05T10:00:00.000Z".into();
        let mut c = session("c", "r2", 3);
        c.last_opened_at = "2026-03-03T10:00:00.000Z".into();
        insert_session(&conn, &a, Some("/w/a")).unwrap();
        insert_session(&conn, &b, Some("/w/b")).unwrap();
        insert_session(&conn, &c, None).unwrap();

        let ids = |conn: &Connection| -> Vec<String> {
            list_sessions(conn)
                .unwrap()
                .into_iter()
                .map(|s| s.id)
                .collect()
        };
        assert_eq!(ids(&conn), vec!["b", "c", "a"]);

        touch_session(&conn, "a").unwrap();
        assert_eq!(ids(&conn), vec!["a", "b", "c"]);

        assert_eq!(list_sessions_with_worktrees(&conn).unwrap().len(), 2);
        archive_session(&conn, "b").unwrap();
        assert_eq!(ids(&conn), vec!["a", "c"]);
        let row = get_session(&conn, "b").unwrap().unwrap();
        assert!(row.archived);
        assert_eq!(row.worktree_path, None);
        assert_eq!(row.session.status, SessionStatus::Closed);
        assert_eq!(list_sessions_with_worktrees(&conn).unwrap().len(), 1);
        // Archived sessions don't block a new one for the same PR.
        let pr = SessionSource::Pr {
            number: 2,
            url: String::new(),
        };
        assert!(find_session_by_source(&conn, "r1", &pr).unwrap().is_none());

        // Removing a repo archives its sessions.
        let rows = archive_sessions_for_repo(&conn, "r1").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].worktree_path.as_deref(), Some("/w/a"));
        assert_eq!(ids(&conn), vec!["c"]);

        // Sessions of an archived repo are hidden too.
        conn.execute("UPDATE repos SET archived = 1 WHERE id = 'r2'", [])
            .unwrap();
        assert!(ids(&conn).is_empty());
    }

    #[test]
    fn analysis_cache_is_keyed_by_head_sha() {
        let conn = db();
        insert_session(&conn, &session("s1", "r1", 1), None).unwrap();
        upsert_analysis(&conn, &analysis("s1", "discovery", "sha-old", "old")).unwrap();

        // Same session and kind, different head: nothing is served.
        assert!(get_analysis(&conn, "s1", "discovery", "sha-new")
            .unwrap()
            .is_none());
        assert!(list_analyses(&conn, "s1", "sha-new").unwrap().is_empty());

        let hit = get_analysis(&conn, "s1", "discovery", "sha-old")
            .unwrap()
            .unwrap();
        assert_eq!(hit.result.unwrap()["marker"], "old");
        assert_eq!(hit.verification.unwrap().files_explored, Some(5));
        assert_eq!(hit.status, AnalysisStatus::Done);

        // A result for the new head sits beside the old one; each head gets its own.
        upsert_analysis(&conn, &analysis("s1", "discovery", "sha-new", "new")).unwrap();
        upsert_analysis(&conn, &analysis("s1", "walkthrough:ep1", "sha-new", "walk")).unwrap();
        assert_eq!(
            get_analysis(&conn, "s1", "discovery", "sha-new")
                .unwrap()
                .unwrap()
                .result
                .unwrap()["marker"],
            "new"
        );
        assert_eq!(
            get_analysis(&conn, "s1", "discovery", "sha-old")
                .unwrap()
                .unwrap()
                .result
                .unwrap()["marker"],
            "old"
        );
        assert_eq!(list_analyses(&conn, "s1", "sha-new").unwrap().len(), 2);
        assert_eq!(list_analyses(&conn, "s1", "sha-old").unwrap().len(), 1);

        // Other kinds and other sessions never match.
        assert!(get_analysis(&conn, "s1", "questions", "sha-new")
            .unwrap()
            .is_none());
        assert!(get_analysis(&conn, "s2", "discovery", "sha-new")
            .unwrap()
            .is_none());
        assert!(get_analysis(&conn, "s1", "walkthrough:ep2", "sha-new")
            .unwrap()
            .is_none());

        // Upsert replaces in place for the same key.
        let mut rerun = analysis("s1", "discovery", "sha-new", "rerun");
        rerun.status = AnalysisStatus::Error;
        rerun.result = None;
        rerun.error = Some("Timed out".into());
        rerun.error_details = Some("raw output…".into());
        upsert_analysis(&conn, &rerun).unwrap();
        let got = get_analysis(&conn, "s1", "discovery", "sha-new")
            .unwrap()
            .unwrap();
        assert_eq!(got.status, AnalysisStatus::Error);
        assert!(got.result.is_none());
        assert_eq!(got.error.as_deref(), Some("Timed out"));
        assert_eq!(list_analyses(&conn, "s1", "sha-new").unwrap().len(), 2);

        delete_analysis(&conn, "s1", "discovery", "sha-new").unwrap();
        assert!(get_analysis(&conn, "s1", "discovery", "sha-new")
            .unwrap()
            .is_none());
        assert!(get_analysis(&conn, "s1", "discovery", "sha-old")
            .unwrap()
            .is_some());

        // An analysis can't be stored without a head.
        assert!(upsert_analysis(&conn, &analysis("s1", "discovery", "", "x")).is_err());
    }

    #[test]
    fn interrupted_work_becomes_errors() {
        let conn = db();
        insert_session(&conn, &session("s1", "r1", 1), None).unwrap();
        let mut running = analysis("s1", "discovery", "sha", "x");
        running.status = AnalysisStatus::Running;
        upsert_analysis(&conn, &running).unwrap();
        upsert_analysis(&conn, &analysis("s1", "questions", "sha", "done")).unwrap();
        insert_ask_message(
            &conn,
            &AskMessage {
                id: "m1".into(),
                session_id: "s1".into(),
                question: "q".into(),
                head_sha: "sha".into(),
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(mark_interrupted(&conn).unwrap(), 3);
        assert_eq!(
            get_analysis(&conn, "s1", "discovery", "sha")
                .unwrap()
                .unwrap()
                .status,
            AnalysisStatus::Error
        );
        assert_eq!(
            get_analysis(&conn, "s1", "questions", "sha")
                .unwrap()
                .unwrap()
                .status,
            AnalysisStatus::Done
        );
        assert_eq!(
            get_ask_message(&conn, "m1").unwrap().unwrap().status,
            AskStatus::Error
        );
        assert_eq!(
            get_session(&conn, "s1").unwrap().unwrap().session.status,
            SessionStatus::Error
        );
        assert_eq!(mark_interrupted(&conn).unwrap(), 0);
    }

    #[test]
    fn ask_history() {
        let conn = db();
        insert_session(&conn, &session("s1", "r1", 1), None).unwrap();
        for (i, sha) in ["old", "old", "new", "new"].iter().enumerate() {
            let mut m = AskMessage {
                id: format!("m{i}"),
                session_id: "s1".into(),
                question: format!("question {i}"),
                head_sha: (*sha).into(),
                ..Default::default()
            };
            insert_ask_message(&conn, &m).unwrap();
            if i != 2 {
                m.status = AskStatus::Done;
                m.answer = Some(AskAnswer {
                    paragraphs: vec![format!("answer {i}")],
                    grounded: true,
                    ..Default::default()
                });
                m.verification = Some(VerificationReport {
                    verified: 2,
                    ..Default::default()
                });
                update_ask_message(&conn, &m).unwrap();
            }
        }
        let all = list_ask_messages(&conn, "s1").unwrap();
        let ids: Vec<&str> = all.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(ids, vec!["m3", "m2", "m1", "m0"]);
        // History from earlier heads is kept, with its own head SHA.
        assert_eq!(all[3].head_sha, "old");
        assert_eq!(all[1].status, AskStatus::Running);
        assert_eq!(all[0].answer.as_ref().unwrap().paragraphs[0], "answer 3");
        assert_eq!(all[0].verification.as_ref().unwrap().verified, 2);

        let recent = recent_answered_asks(&conn, "s1", 3).unwrap();
        let ids: Vec<&str> = recent.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(ids, vec!["m0", "m1", "m3"]);
        assert_eq!(recent_answered_asks(&conn, "s1", 1).unwrap()[0].id, "m3");
        assert!(list_ask_messages(&conn, "other").unwrap().is_empty());
        assert!(update_ask_message(
            &conn,
            &AskMessage {
                id: "zz".into(),
                ..Default::default()
            }
        )
        .is_err());
    }

    #[test]
    fn question_state() {
        let conn = db();
        insert_session(&conn, &session("s1", "r1", 1), None).unwrap();
        assert!(opened_questions(&conn, "s1").unwrap().is_empty());
        set_question_opened(&conn, "s1", "q1", true).unwrap();
        set_question_opened(&conn, "s1", "q1", true).unwrap();
        set_question_opened(&conn, "s1", "q2", true).unwrap();
        set_question_opened(&conn, "s1", "q2", false).unwrap();
        let opened = opened_questions(&conn, "s1").unwrap();
        assert_eq!(opened.len(), 1);
        assert!(opened.contains("q1"));
    }

    fn finding(id: &str, title: &str) -> Finding {
        Finding {
            id: id.into(),
            severity: Severity::Blocking,
            title: title.into(),
            why: "why".into(),
            code_ref: CodeRef {
                file: "a.py".into(),
                start_line: 3,
                verified: true,
                ..Default::default()
            },
            excerpt: Excerpt::default(),
            comment: format!("comment for {title}"),
            included: true,
            anchoring: Anchoring::Inline,
        }
    }

    #[test]
    fn findings_lifecycle() {
        let conn = db();
        insert_session(&conn, &session("s1", "r1", 1), None).unwrap();
        insert_session(&conn, &session("s2", "r1", 2), None).unwrap();

        let stored = replace_findings(
            &conn,
            "s1",
            "sha1",
            &[finding("f1", "A"), finding("f2", "B")],
        )
        .unwrap();
        // Ids are made globally unique, so "f1" in two sessions can't collide.
        assert_ne!(stored[0].id, "f1");
        let other = replace_findings(&conn, "s2", "sha1", &[finding("f1", "A")]).unwrap();
        assert_ne!(other[0].id, stored[0].id);

        let listed = list_findings(&conn, "s1", "sha1").unwrap();
        assert_eq!(listed, stored);
        assert_eq!(listed[1].title, "B");

        // Edits.
        update_finding(&conn, "s1", &stored[0].id, Some("edited"), None).unwrap();
        update_finding(&conn, "s1", &stored[1].id, None, Some(false)).unwrap();
        let listed = list_findings(&conn, "s1", "sha1").unwrap();
        assert_eq!(listed[0].comment, "edited");
        assert!(listed[0].included);
        assert_eq!(listed[1].comment, "comment for B");
        assert!(!listed[1].included);
        // Wrong session or unknown id.
        assert!(update_finding(&conn, "s2", &stored[0].id, Some("x"), None).is_err());
        assert!(update_finding(&conn, "s1", "nope", Some("x"), None).is_err());

        // Findings are keyed by head too.
        assert!(list_findings(&conn, "s1", "sha2").unwrap().is_empty());

        // Re-running replaces unposted findings…
        let rerun = replace_findings(&conn, "s1", "sha1", &[finding("f1", "C")]).unwrap();
        let listed = list_findings(&conn, "s1", "sha1").unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].title, "C");

        // …but posted ones are kept in history.
        mark_findings_posted(&conn, "s1", "sha1", "review-9").unwrap();
        assert!(list_findings(&conn, "s1", "sha1").unwrap().is_empty());
        assert!(update_finding(&conn, "s1", &rerun[0].id, Some("x"), None).is_err());
        replace_findings(&conn, "s1", "sha1", &[finding("f1", "D")]).unwrap();
        let kept: i64 = conn
            .query_row("SELECT count(*) FROM findings WHERE session_id = 's1' AND posted_review_id = 'review-9'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, 1);
        assert_eq!(list_findings(&conn, "s1", "sha1").unwrap()[0].title, "D");
        // The other session was never touched.
        assert_eq!(list_findings(&conn, "s2", "sha1").unwrap().len(), 1);
    }

    #[test]
    fn settings_defaults_and_json_values() {
        let conn = db();
        assert_eq!(read_settings(&conn).unwrap(), GrspSettings::default());
        assert_eq!(read_setting(&conn, "agent").unwrap(), None);

        let set = |k: &str, v: &str| {
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![k, v],
            )
            .unwrap();
        };
        set("review_prompt", "\"Be strict.\"");
        set("agent", "\"codex\"");
        set("comprehension_questions", "false");
        set("show_unchanged_blocks", "false");
        set("auto_run_review", "true");
        set("trace_depth", "3");
        let s = read_settings(&conn).unwrap();
        assert_eq!(s.review_prompt, "Be strict.");
        assert_eq!(s.agent, AgentKind::Codex);
        assert!(!s.comprehension_questions && !s.show_unchanged_blocks && s.auto_run_review);
        assert_eq!(s.trace_depth, 3);

        // Invalid or non-JSON values fall back to defaults instead of failing.
        set("agent", "gemini");
        set("trace_depth", "9");
        set("auto_run_review", "\"maybe\"");
        set("review_prompt", "not json at all");
        let s = read_settings(&conn).unwrap();
        assert_eq!(s.agent, AgentKind::Claude);
        assert_eq!(s.trace_depth, 2);
        assert!(!s.auto_run_review);
        assert_eq!(s.review_prompt, "not json at all");
        assert_eq!(read_setting(&conn, "agent").unwrap(), Some(json!("gemini")));
    }
}
