//! Orchestration: session lifecycle (SPEC §2), running analyses, Ask and
//! posting reviews. Shared by the Tauri commands and the eval runner; events
//! go through `EventSink` so neither depends on the other.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use super::context::{Outcome, PassCtx};
use super::{ask, discovery, discussion, questions, review, walkthrough};
use crate::agent::{AgentError, CancelToken, RunHooks, Runner};
use crate::git::{self, DiffBundle};
use crate::model::analysis_kind as kinds;
use crate::model::*;
use crate::{db, github, verify};

/// Where engine events go (Tauri in the app, nowhere in tests and evals).
pub trait EventSink: Send + Sync {
    fn session(&self, event: SessionEvent);
    fn analysis(&self, event: AnalysisEvent);
    fn ask(&self, event: AskEvent);
}

pub struct NullSink;

impl EventSink for NullSink {
    fn session(&self, _: SessionEvent) {}
    fn analysis(&self, _: AnalysisEvent) {}
    fn ask(&self, _: AskEvent) {}
}

pub struct Engine {
    /// Folder holding grsp.db (tauri-plugin-sql's app config dir).
    db_dir: PathBuf,
    /// App data folder; worktrees live in `{data_dir}/worktrees/{sessionId}`.
    data_dir: PathBuf,
    runner: Runner,
    sink: Arc<dyn EventSink>,
    /// Cancellation handle per running pass: `{sessionId}:{kind}` or
    /// `{sessionId}:ask:{messageId}`.
    running: Mutex<HashMap<String, CancelToken>>,
    /// Latest progress line per running pass (same keys).
    progress: Mutex<HashMap<String, String>>,
    /// DiffBundle per session, valid for one head SHA.
    bundles: Mutex<HashMap<String, (String, Arc<DiffBundle>)>>,
    /// Sessions currently being prepared.
    preparing: Mutex<std::collections::HashSet<String>>,
}

async fn blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| format!("A background task failed: {e}"))?
}

fn short(sha: &str) -> &str {
    &sha[..sha.len().min(7)]
}

fn analysis_key(session_id: &str, kind: &str) -> String {
    format!("{session_id}:{kind}")
}

fn ask_key(session_id: &str, message_id: &str) -> String {
    format!("{session_id}:ask:{message_id}")
}

fn valid_kind(kind: &str) -> bool {
    matches!(
        kind,
        kinds::DISCOVERY | kinds::QUESTIONS | kinds::DISCUSSION | kinds::REVIEW
    ) || kinds::walkthrough_entry(kind).is_some_and(|id| !id.is_empty())
}

impl Engine {
    /// Where grsp keeps clones it made itself: `{data_dir}/repos/{owner}/{name}`.
    pub fn repos_dir(&self) -> PathBuf {
        self.data_dir.join("repos")
    }

    pub fn new(
        db_dir: PathBuf,
        data_dir: PathBuf,
        runner: Runner,
        sink: Arc<dyn EventSink>,
    ) -> Arc<Self> {
        Arc::new(Self {
            db_dir,
            data_dir,
            runner,
            sink,
            running: Mutex::new(HashMap::new()),
            progress: Mutex::new(HashMap::new()),
            bundles: Mutex::new(HashMap::new()),
            preparing: Mutex::new(std::collections::HashSet::new()),
        })
    }

    pub fn conn(&self) -> Result<Connection, String> {
        db::open(&self.db_dir)
    }

    pub fn runner(&self) -> &Runner {
        &self.runner
    }

    fn emit_session(&self, session_id: &str, progress: Option<&str>) {
        self.sink.session(SessionEvent {
            session_id: session_id.to_string(),
            progress: progress.map(String::from),
        });
    }

    fn emit_analysis(
        &self,
        session_id: &str,
        kind: &str,
        status: AnalysisStatus,
        progress: Option<String>,
    ) {
        self.sink.analysis(AnalysisEvent {
            session_id: session_id.to_string(),
            kind: kind.to_string(),
            status,
            progress,
        });
    }

    fn settings(&self) -> GrspSettings {
        self.conn()
            .and_then(|c| db::read_settings(&c))
            .unwrap_or_default()
    }

    // ── Running-pass bookkeeping ───────────────────────────

    /// Register a pass. `None` when one with this key is already running.
    fn begin(&self, key: &str) -> Option<CancelToken> {
        let mut running = self.running.lock().ok()?;
        if running.contains_key(key) {
            return None;
        }
        let token = CancelToken::new();
        running.insert(key.to_string(), token.clone());
        Some(token)
    }

    fn end(&self, key: &str) {
        if let Ok(mut r) = self.running.lock() {
            r.remove(key);
        }
        if let Ok(mut p) = self.progress.lock() {
            p.remove(key);
        }
    }

    fn is_running(&self, key: &str) -> bool {
        self.running
            .lock()
            .map(|r| r.contains_key(key))
            .unwrap_or(false)
    }

    fn cancel_key(&self, key: &str) -> bool {
        match self.running.lock().ok().and_then(|r| r.get(key).cloned()) {
            Some(t) => {
                t.cancel();
                true
            }
            None => false,
        }
    }

    fn cancel_session(&self, session_id: &str) {
        let prefix = format!("{session_id}:");
        if let Ok(r) = self.running.lock() {
            for (k, t) in r.iter() {
                if k.starts_with(&prefix) {
                    t.cancel();
                }
            }
        }
    }

    fn set_progress(&self, key: &str, line: &str) {
        if let Ok(mut p) = self.progress.lock() {
            p.insert(key.to_string(), line.to_string());
        }
    }

    fn progress_of(&self, key: &str) -> Option<String> {
        self.progress.lock().ok().and_then(|p| p.get(key).cloned())
    }

    fn pass_counter(self: &Arc<Self>, session_id: &str) -> Arc<dyn Fn() + Send + Sync> {
        let engine = self.clone();
        let sid = session_id.to_string();
        Arc::new(move || {
            if let Ok(c) = engine.conn() {
                let _ = db::increment_agent_passes(&c, &sid);
            }
            // The footer shows the pass count; tell the UI the row changed.
            engine.emit_session(&sid, None);
        })
    }

    // ── Startup (SPEC §2.4) ────────────────────────────────

    /// Reset work a previous process left unfinished and prune worktrees of
    /// sessions untouched for 14 days.
    pub fn startup(&self) -> Result<(), String> {
        let conn = self.conn()?;
        db::mark_interrupted(&conn)?;
        for s in db::list_sessions(&conn)? {
            if s.status == SessionStatus::Preparing {
                db::set_session_status(
                    &conn,
                    &s.id,
                    SessionStatus::Error,
                    Some("grsp was closed while this session was being prepared. Refresh to try again."),
                )?;
            }
        }
        let mut candidates = Vec::new();
        for row in db::list_sessions_with_worktrees(&conn)? {
            let (Some(wt), Ok(Some(repo))) = (
                row.worktree_path.clone(),
                db::get_repo(&conn, &row.session.repo_id),
            ) else {
                continue;
            };
            candidates.push(git::WorktreeCandidate {
                session_id: row.session.id.clone(),
                repo_path: repo.path,
                worktree_path: wt,
                last_opened_at: row.session.last_opened_at.clone(),
            });
        }
        for id in git::prune_stale_worktrees(&candidates, chrono::Utc::now()) {
            db::set_session_worktree(&conn, &id, None)?;
        }
        Ok(())
    }

    // ── Session context ────────────────────────────────────

    fn session_row(&self, conn: &Connection, session_id: &str) -> Result<db::SessionRow, String> {
        db::get_session(conn, session_id)?
            .ok_or_else(|| "That session no longer exists.".to_string())
    }

    fn repo_of(&self, conn: &Connection, session: &ReviewSession) -> Result<Repo, String> {
        db::get_repo(conn, &session.repo_id)?
            .ok_or_else(|| "The repository for this session was removed.".to_string())
    }

    fn github_remote(repo: &Repo) -> Result<&RemoteInfo, String> {
        repo.remote
            .as_ref()
            .filter(|r| r.is_github())
            .ok_or_else(|| "This repository has no GitHub remote.".to_string())
    }

    fn bundle_for(
        &self,
        session_id: &str,
        worktree: &std::path::Path,
        merge_base: &str,
        head: &str,
    ) -> Result<Arc<DiffBundle>, String> {
        if let Some((sha, b)) = self
            .bundles
            .lock()
            .ok()
            .and_then(|m| m.get(session_id).cloned())
        {
            if sha == head {
                return Ok(b);
            }
        }
        let bundle = Arc::new(git::build_diff(worktree, merge_base, head)?);
        if let Ok(mut m) = self.bundles.lock() {
            m.insert(session_id.to_string(), (head.to_string(), bundle.clone()));
        }
        Ok(bundle)
    }

    /// Everything a pass needs. Recreates the worktree on demand (§2.4).
    fn load_ctx(&self, session_id: &str) -> Result<PassCtx, String> {
        let conn = self.conn()?;
        let row = self.session_row(&conn, session_id)?;
        let session = row.session;
        let (Some(head), Some(merge_base)) =
            (session.head_sha.clone(), session.merge_base_sha.clone())
        else {
            return Err("This session is still being prepared.".to_string());
        };
        let repo = self.repo_of(&conn, &session)?;
        let worktree = git::worktree_path(&self.data_dir, session_id);
        git::ensure_worktree(&repo.path, &worktree, &head)?;
        let wt_str = worktree.to_string_lossy().to_string();
        if row.worktree_path.as_deref() != Some(wt_str.as_str()) {
            db::set_session_worktree(&conn, session_id, Some(&wt_str))?;
        }
        let bundle = self.bundle_for(session_id, &worktree, &merge_base, &head)?;
        let agent = db::read_settings(&conn)
            .map(|s| s.agent)
            .unwrap_or_default();
        PassCtx::new(session, worktree, (*bundle).clone(), agent)
    }

    fn done_result<T: serde::de::DeserializeOwned>(
        &self,
        session_id: &str,
        kind: &str,
        head: &str,
    ) -> Option<T> {
        let conn = self.conn().ok()?;
        let a = db::get_analysis(&conn, session_id, kind, head).ok()??;
        if a.status != AnalysisStatus::Done {
            return None;
        }
        serde_json::from_value(a.result?).ok()
    }

    // ── Creating sessions (SPEC §2.1) ──────────────────────

    fn new_session(repo: &Repo, source: SessionSource) -> ReviewSession {
        let now = db::now_iso();
        ReviewSession {
            id: uuid::Uuid::new_v4().to_string(),
            repo_id: repo.id.clone(),
            source,
            title: String::new(),
            description: String::new(),
            author: String::new(),
            base_ref: String::new(),
            head_ref: String::new(),
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
            created_at: now.clone(),
            last_opened_at: now,
        }
    }

    /// Resolve the input to a session row. Returns the session and whether
    /// it still needs preparing. A URL for a repo that isn't added rejects
    /// with the JSON-encoded `RepoNotAddedError`.
    fn create_session_blocking(
        &self,
        input: NewSessionInput,
    ) -> Result<(ReviewSession, bool), String> {
        let conn = self.conn()?;
        let (repo, source) = match input {
            NewSessionInput::Url { url } => {
                let pr = git::parse_pr_url(&url).ok_or_else(|| {
                    "That doesn't look like a GitHub pull request URL. It should look like https://github.com/owner/repo/pull/123.".to_string()
                })?;
                let repo =
                    db::find_repo_by_remote(&conn, &pr.owner, &pr.name)?.ok_or_else(|| {
                        serde_json::to_string(&RepoNotAddedError::new(&pr.owner, &pr.name))
                            .unwrap_or_else(|_| "repo_not_added".to_string())
                    })?;
                let url = format!(
                    "https://github.com/{}/{}/pull/{}",
                    pr.owner, pr.name, pr.number
                );
                (
                    repo,
                    SessionSource::Pr {
                        number: pr.number,
                        url,
                    },
                )
            }
            NewSessionInput::Pr { repo_id, number } => {
                let repo =
                    db::get_repo(&conn, &repo_id)?.ok_or("That repository no longer exists.")?;
                let remote = Self::github_remote(&repo)?;
                let url = format!(
                    "https://github.com/{}/{}/pull/{}",
                    remote.owner, remote.name, number
                );
                (repo, SessionSource::Pr { number, url })
            }
            NewSessionInput::Branches {
                repo_id,
                base,
                head,
            } => {
                let repo =
                    db::get_repo(&conn, &repo_id)?.ok_or("That repository no longer exists.")?;
                if base.trim().is_empty() || head.trim().is_empty() {
                    return Err("Choose a base and a head branch.".to_string());
                }
                if base.trim() == head.trim() {
                    return Err("Choose two different branches.".to_string());
                }
                (
                    repo,
                    SessionSource::Branches {
                        base: base.trim().to_string(),
                        head: head.trim().to_string(),
                    },
                )
            }
        };

        if let Some(existing) = db::find_session_by_source(&conn, &repo.id, &source)? {
            db::touch_session(&conn, &existing.id)?;
            let needs_prepare =
                existing.status == SessionStatus::Error && !self.is_preparing(&existing.id);
            return Ok((existing, needs_prepare));
        }

        let mut session = Self::new_session(&repo, source.clone());
        match &source {
            SessionSource::Pr { number, url } => {
                let remote = Self::github_remote(&repo)?;
                let meta = github::pr_meta(&remote.owner, &remote.name, *number).map_err(|e| {
                    format!("Couldn't load pull request #{number} from GitHub: {e}")
                })?;
                let login = github::status().login;
                session.title = meta.title;
                session.description = meta.body;
                session.is_own_pr = login
                    .as_deref()
                    .is_some_and(|l| l.eq_ignore_ascii_case(&meta.author));
                session.author = meta.author;
                session.base_ref = meta.base_ref;
                session.head_ref = meta.head_ref;
                session.pr_state = meta.state;
                if !meta.url.is_empty() {
                    session.source = SessionSource::Pr {
                        number: *number,
                        url: meta.url,
                    };
                } else {
                    session.source = SessionSource::Pr {
                        number: *number,
                        url: url.clone(),
                    };
                }
            }
            SessionSource::Branches { base, head } => {
                session.title = head.clone();
                session.base_ref = base.clone();
                session.head_ref = head.clone();
            }
        }
        db::insert_session(&conn, &session, None)?;
        Ok((session, true))
    }

    pub async fn create_session(
        self: &Arc<Self>,
        input: NewSessionInput,
    ) -> Result<ReviewSession, String> {
        let engine = self.clone();
        let (session, needs_prepare) =
            blocking(move || engine.create_session_blocking(input)).await?;
        if needs_prepare {
            self.spawn_prepare(&session.id, Vec::new());
        }
        Ok(session)
    }

    // ── Preparing (SPEC §2.2) ──────────────────────────────

    fn is_preparing(&self, session_id: &str) -> bool {
        self.preparing
            .lock()
            .map(|p| p.contains(session_id))
            .unwrap_or(false)
    }

    /// Steps 1–3 of §2.2, with a plain-language progress event for each.
    pub fn prepare_blocking(&self, session_id: &str) -> Result<(), String> {
        let conn = self.conn()?;
        let row = self.session_row(&conn, session_id)?;
        let mut session = row.session;
        let repo = self.repo_of(&conn, &session)?;
        db::set_session_status(&conn, session_id, SessionStatus::Preparing, None)?;

        // 1. Fetch and pin the three SHAs.
        let refs = match &session.source {
            SessionSource::Pr { number, .. } => {
                self.emit_session(session_id, Some(&format!("Fetching pull/{number}/head")));
                git::fetch_pr(&repo.path, *number, &session.base_ref)?
            }
            SessionSource::Branches { base, head } => {
                self.emit_session(session_id, Some(&format!("Resolving {base} and {head}")));
                git::resolve_branch_pair(&repo.path, base, head)?
            }
        };
        db::set_session_refs(
            &conn,
            session_id,
            &refs.base_sha,
            &refs.head_sha,
            &refs.merge_base_sha,
        )?;

        // 2. A detached, read-only worktree at head.
        self.emit_session(
            session_id,
            Some(&format!(
                "Creating a read-only worktree at {}",
                short(&refs.head_sha)
            )),
        );
        let worktree = git::worktree_path(&self.data_dir, session_id);
        git::ensure_worktree(&repo.path, &worktree, &refs.head_sha)?;
        db::set_session_worktree(&conn, session_id, Some(&worktree.to_string_lossy()))?;

        // 3. The DiffMap from the merge base.
        self.emit_session(session_id, Some("Working out what changed"));
        if let Ok(mut m) = self.bundles.lock() {
            m.remove(session_id);
        }
        let bundle =
            self.bundle_for(session_id, &worktree, &refs.merge_base_sha, &refs.head_sha)?;
        db::set_session_diff_stats(&conn, session_id, &bundle.stats)?;
        if bundle.map.files.is_empty() {
            return Err(if bundle.excluded.is_empty() {
                format!(
                    "There are no changes between {} and {}.",
                    session.base_ref, session.head_ref
                )
            } else {
                "Only generated, vendored or lock files changed, so there is nothing to analyse."
                    .to_string()
            });
        }

        // Branch sessions take their author from the head commit.
        if !session.source.is_pr() && session.author.is_empty() {
            if let Ok(out) = git::run_git(
                std::path::Path::new(&repo.path),
                &["log", "-1", "--format=%an", &refs.head_sha],
            ) {
                session = self.session_row(&conn, session_id)?.session;
                session.author = out.trim().to_string();
                db::update_session(&conn, &session)?;
            }
        }

        // PR facts that come from GitHub: CI and state.
        if let (SessionSource::Pr { number, .. }, Ok(remote)) =
            (&session.source, Self::github_remote(&repo))
        {
            self.emit_session(session_id, Some("Checking CI status"));
            let ci = github::ci_status(&remote.owner, &remote.name, &refs.head_sha);
            let mut fresh = self.session_row(&conn, session_id)?.session;
            fresh.ci = Some(ci);
            if let Ok(meta) = github::pr_meta(&remote.owner, &remote.name, *number) {
                fresh.pr_state = meta.state;
            }
            db::update_session(&conn, &fresh)?;
        }

        db::set_session_new_commits(&conn, session_id, 0)?;
        db::set_session_status(&conn, session_id, SessionStatus::Ready, None)?;
        self.emit_session(session_id, None);
        Ok(())
    }

    /// Prepare, then run the analyses of §2.2 step 4. `rerun` lists extra
    /// kinds to run afterwards (a refresh re-runs what had already run).
    pub async fn prepare_and_analyse(self: &Arc<Self>, session_id: &str, rerun: Vec<String>) {
        {
            let Ok(mut p) = self.preparing.lock() else {
                return;
            };
            if !p.insert(session_id.to_string()) {
                return;
            }
        }
        let engine = self.clone();
        let sid = session_id.to_string();
        let prepared = blocking(move || engine.prepare_blocking(&sid)).await;
        if let Ok(mut p) = self.preparing.lock() {
            p.remove(session_id);
        }
        if let Err(e) = prepared {
            if let Ok(conn) = self.conn() {
                let _ = db::set_session_status(&conn, session_id, SessionStatus::Error, Some(&e));
            }
            self.emit_session(session_id, None);
            return;
        }
        self.run_initial_analyses(session_id, rerun).await;
    }

    fn spawn_prepare(self: &Arc<Self>, session_id: &str, rerun: Vec<String>) {
        let engine = self.clone();
        let sid = session_id.to_string();
        tokio::spawn(async move { engine.prepare_and_analyse(&sid, rerun).await });
    }

    /// Discovery, then questions and discussion in parallel (the runner
    /// keeps it to 2 agent processes), then review if auto-run is on.
    async fn run_initial_analyses(self: &Arc<Self>, session_id: &str, rerun: Vec<String>) {
        let settings = self.settings();
        let is_pr = self
            .conn()
            .ok()
            .and_then(|c| db::get_session(&c, session_id).ok().flatten())
            .is_some_and(|r| r.session.source.is_pr());

        self.run_analysis(session_id, kinds::DISCOVERY, true).await;

        let want_questions = settings.comprehension_questions;
        let q = async {
            if want_questions {
                self.run_analysis(session_id, kinds::QUESTIONS, true).await;
            }
        };
        let d = async {
            if is_pr {
                self.run_analysis(session_id, kinds::DISCUSSION, true).await;
            }
        };
        tokio::join!(q, d);

        if settings.auto_run_review || rerun.iter().any(|k| k == kinds::REVIEW) {
            self.run_analysis(session_id, kinds::REVIEW, true).await;
        }
    }

    // ── Opening, staleness, refresh, archive (SPEC §2.3, §2.4) ──

    /// Compare the analysed head with the current one. Returns true when
    /// the session row changed.
    fn check_head_blocking(&self, session_id: &str) -> Result<bool, String> {
        let conn = self.conn()?;
        let mut session = self.session_row(&conn, session_id)?.session;
        if !matches!(session.status, SessionStatus::Ready | SessionStatus::Stale) {
            return Ok(false);
        }
        let Some(analysed) = session.head_sha.clone() else {
            return Ok(false);
        };
        let repo = self.repo_of(&conn, &session)?;
        let before = session.clone();

        let current = match &session.source {
            SessionSource::Pr { number, .. } => {
                let remote = Self::github_remote(&repo)?;
                let meta = github::pr_meta(&remote.owner, &remote.name, *number)?;
                session.pr_state = meta.state;
                session.ci = Some(github::ci_status(
                    &remote.owner,
                    &remote.name,
                    &meta.head_sha,
                ));
                if meta.head_sha != analysed && !meta.head_sha.is_empty() {
                    session.new_commits = github::commits_between(
                        &remote.owner,
                        &remote.name,
                        &analysed,
                        &meta.head_sha,
                    )
                    .unwrap_or(1)
                    .max(1);
                }
                meta.head_sha
            }
            SessionSource::Branches { base, head } => {
                let refs = git::resolve_branch_pair(&repo.path, base, head)?;
                if refs.head_sha != analysed {
                    session.new_commits = git::count_commits(&repo.path, &analysed, &refs.head_sha)
                        .unwrap_or(1)
                        .max(1);
                }
                refs.head_sha
            }
        };
        if !current.is_empty() && current != analysed {
            session.status = SessionStatus::Stale;
        } else {
            session.status = SessionStatus::Ready;
            session.new_commits = 0;
        }
        if session == before {
            return Ok(false);
        }
        db::update_session(&conn, &session)?;
        Ok(true)
    }

    /// Touch `lastOpenedAt` and return the session at once. Recreating the
    /// worktree, checking the head and refetching comments happen in the
    /// background and arrive as events. No agent pass is started here except
    /// a discussion digest whose comment count changed (SPEC §5.3).
    pub async fn open_session(self: &Arc<Self>, session_id: &str) -> Result<ReviewSession, String> {
        let engine = self.clone();
        let sid = session_id.to_string();
        let session = blocking(move || {
            let conn = engine.conn()?;
            db::touch_session(&conn, &sid)?;
            Ok(engine.session_row(&conn, &sid)?.session)
        })
        .await?;

        let engine = self.clone();
        let sid = session_id.to_string();
        let has_head = session.head_sha.is_some();
        let is_pr = session.source.is_pr();
        tokio::spawn(async move {
            if !has_head || engine.is_preparing(&sid) {
                return;
            }
            let (e, s) = (engine.clone(), sid.clone());
            let _ = blocking(move || e.load_ctx(&s).map(|_| ())).await;
            let (e, s) = (engine.clone(), sid.clone());
            if let Ok(true) = blocking(move || e.check_head_blocking(&s)).await {
                engine.emit_session(&sid, None);
            }
            if is_pr {
                engine.refresh_discussion(&sid).await;
            }
        });
        Ok(session)
    }

    /// Refetch comments. The digest only re-runs when the count changed.
    async fn refresh_discussion(self: &Arc<Self>, session_id: &str) {
        let Some(head) = self
            .conn()
            .ok()
            .and_then(|c| db::get_session(&c, session_id).ok().flatten())
            .and_then(|r| r.session.head_sha)
        else {
            return;
        };
        // Only refresh a digest that exists; a failed or missing one waits
        // for Retry.
        if self
            .done_result::<DiscussionResult>(session_id, kinds::DISCUSSION, &head)
            .is_none()
        {
            return;
        }
        self.run_analysis(session_id, kinds::DISCUSSION, false)
            .await;
    }

    /// New worktree and DiffMap, then re-run the analyses that had run.
    pub async fn refresh_session(
        self: &Arc<Self>,
        session_id: &str,
    ) -> Result<ReviewSession, String> {
        let engine = self.clone();
        let sid = session_id.to_string();
        let (session, rerun) = blocking(move || {
            let conn = engine.conn()?;
            let session = engine.session_row(&conn, &sid)?.session;
            let rerun: Vec<String> = match &session.head_sha {
                Some(head) => db::list_analyses(&conn, &sid, head)?
                    .into_iter()
                    .filter(|a| matches!(a.status, AnalysisStatus::Done | AnalysisStatus::Error))
                    .map(|a| a.kind)
                    .collect(),
                None => Vec::new(),
            };
            Ok((session, rerun))
        })
        .await?;
        if self.is_preparing(session_id) {
            return Ok(session);
        }
        self.cancel_session(session_id);

        // Walkthroughs are keyed by entry point id, which a new discovery
        // may renumber; they re-run lazily when opened instead.
        let rerun: Vec<String> = rerun
            .into_iter()
            .filter(|k| !k.starts_with(kinds::WALKTHROUGH_PREFIX))
            .collect();

        let engine = self.clone();
        let sid = session_id.to_string();
        let session = blocking(move || {
            let conn = engine.conn()?;
            db::set_session_status(&conn, &sid, SessionStatus::Preparing, None)?;
            Ok(engine.session_row(&conn, &sid)?.session)
        })
        .await
        .unwrap_or(session);
        self.emit_session(session_id, Some("Refreshing"));
        self.spawn_prepare(session_id, rerun);
        Ok(session)
    }

    /// Remove the worktree, keep the history.
    pub async fn archive_session(self: &Arc<Self>, session_id: &str) -> Result<(), String> {
        self.cancel_session(session_id);
        let engine = self.clone();
        let sid = session_id.to_string();
        blocking(move || {
            let conn = engine.conn()?;
            let row = engine.session_row(&conn, &sid)?;
            if let Ok(repo) = engine.repo_of(&conn, &row.session) {
                let wt = git::worktree_path(&engine.data_dir, &sid);
                let _ = git::remove_worktree(&repo.path, &wt);
            }
            if let Ok(mut m) = engine.bundles.lock() {
                m.remove(&sid);
            }
            db::archive_session(&conn, &sid)
        })
        .await?;
        self.emit_session(session_id, None);
        Ok(())
    }

    // ── Analyses ───────────────────────────────────────────

    /// Analyses for the session's analysed head, with live progress, the
    /// opened state of questions and the user's finding edits applied.
    pub fn list_analyses(&self, session_id: &str) -> Result<Vec<Analysis>, String> {
        let conn = self.conn()?;
        let session = self.session_row(&conn, session_id)?.session;
        let Some(head) = session.head_sha else {
            return Ok(Vec::new());
        };
        let mut list = db::list_analyses(&conn, session_id, &head)?;
        for a in &mut list {
            if a.status == AnalysisStatus::Running {
                a.progress = self.progress_of(&analysis_key(session_id, &a.kind));
            }
            match a.kind.as_str() {
                kinds::QUESTIONS => {
                    if let Some(mut r) = a
                        .result
                        .clone()
                        .and_then(|v| serde_json::from_value::<QuestionsResult>(v).ok())
                    {
                        let opened = db::opened_questions(&conn, session_id)?;
                        for q in &mut r.questions {
                            q.opened = opened.contains(&q.id);
                        }
                        a.result = serde_json::to_value(&r).ok();
                    }
                }
                kinds::REVIEW => {
                    if let Some(mut r) = a
                        .result
                        .clone()
                        .and_then(|v| serde_json::from_value::<ReviewResult>(v).ok())
                    {
                        let edited = db::list_findings(&conn, session_id, &head)?;
                        for f in &mut r.findings {
                            if let Some(e) = edited.iter().find(|e| e.id == f.id) {
                                f.comment = e.comment.clone();
                                f.included = e.included;
                            }
                        }
                        a.result = serde_json::to_value(&r).ok();
                    }
                }
                _ => {}
            }
        }
        Ok(list)
    }

    /// Start, retry or re-run one analysis. Returns immediately.
    pub fn start_analysis(self: &Arc<Self>, session_id: &str, kind: &str) -> Result<(), String> {
        if !valid_kind(kind) {
            return Err(format!("Unknown analysis: {kind}"));
        }
        let conn = self.conn()?;
        let session = self.session_row(&conn, session_id)?.session;
        if session.head_sha.is_none() {
            return Err("This session is still being prepared.".to_string());
        }
        if kind == kinds::DISCUSSION && !session.source.is_pr() {
            return Err("Discussion is only available for pull requests.".to_string());
        }
        if self.is_running(&analysis_key(session_id, kind)) {
            return Ok(());
        }
        let engine = self.clone();
        let (sid, kind) = (session_id.to_string(), kind.to_string());
        tokio::spawn(async move { engine.run_analysis(&sid, &kind, true).await });
        Ok(())
    }

    pub fn cancel_analysis(&self, session_id: &str, kind: &str) {
        self.cancel_key(&analysis_key(session_id, kind));
    }

    fn save_analysis(&self, analysis: &Analysis) {
        if let Ok(conn) = self.conn() {
            if let Err(e) = db::upsert_analysis(&conn, analysis) {
                log::error!("couldn't save analysis {}: {e}", analysis.kind);
            }
        }
    }

    /// Run one analysis to completion: build prompt → run agent → parse →
    /// verify → persist. Never returns an error; failures are stored on the
    /// analysis so the section can show them with Retry.
    ///
    /// `force` re-runs the discussion digest even when the comment count is
    /// unchanged (a user-initiated run); a focus refresh passes false.
    pub async fn run_analysis(self: &Arc<Self>, session_id: &str, kind: &str, force: bool) {
        let key = analysis_key(session_id, kind);
        let Some(cancel) = self.begin(&key) else {
            return;
        };

        let engine = self.clone();
        let sid = session_id.to_string();
        let ctx = match blocking(move || engine.load_ctx(&sid)).await {
            Ok(c) => c,
            Err(e) => {
                self.end(&key);
                // Without a head there is no cache key to store the error under.
                let head = self
                    .conn()
                    .ok()
                    .and_then(|c| db::get_session(&c, session_id).ok().flatten())
                    .and_then(|r| r.session.head_sha);
                if let Some(head) = head {
                    self.save_analysis(&Analysis {
                        session_id: session_id.to_string(),
                        kind: kind.to_string(),
                        head_sha: head,
                        status: AnalysisStatus::Error,
                        error: Some(e),
                        finished_at: Some(db::now_iso()),
                        ..Default::default()
                    });
                }
                self.emit_analysis(session_id, kind, AnalysisStatus::Error, None);
                return;
            }
        };
        let head = ctx.head_sha.clone();

        // The discussion's facts come from GitHub before any agent runs, and
        // an unchanged comment count needs no agent at all.
        let previous_discussion: Option<DiscussionResult> = if kind == kinds::DISCUSSION {
            self.done_result(session_id, kinds::DISCUSSION, &head)
        } else {
            None
        };
        let quiet_refresh = kind == kinds::DISCUSSION && !force && previous_discussion.is_some();

        let mut analysis = Analysis {
            session_id: session_id.to_string(),
            kind: kind.to_string(),
            head_sha: head.clone(),
            status: AnalysisStatus::Running,
            started_at: Some(db::now_iso()),
            ..Default::default()
        };
        if !quiet_refresh {
            self.save_analysis(&analysis);
            self.emit_analysis(session_id, kind, AnalysisStatus::Running, None);
        }

        let hooks = {
            let engine = self.clone();
            let (sid, k, pkey) = (session_id.to_string(), kind.to_string(), key.clone());
            RunHooks {
                progress: Arc::new(move |line: String| {
                    engine.set_progress(&pkey, &line);
                    engine.emit_analysis(&sid, &k, AnalysisStatus::Running, Some(line));
                }),
                cancel: cancel.clone(),
                on_pass: self.pass_counter(session_id),
            }
        };

        let outcome = self
            .compute(
                session_id,
                kind,
                &ctx,
                &hooks,
                previous_discussion,
                force,
                quiet_refresh,
            )
            .await;
        self.end(&key);

        match outcome {
            Ok(Some((result, report))) => {
                analysis.status = AnalysisStatus::Done;
                analysis.result = Some(result);
                analysis.verification = Some(report);
                analysis.finished_at = Some(db::now_iso());
                self.save_analysis(&analysis);
                self.emit_analysis(session_id, kind, AnalysisStatus::Done, None);
            }
            // A quiet discussion refresh that failed leaves the stored
            // digest untouched.
            Ok(None) => {}
            Err(e) => {
                analysis.status = AnalysisStatus::Error;
                analysis.error = Some(e.message());
                analysis.error_details = e.details();
                analysis.finished_at = Some(db::now_iso());
                self.save_analysis(&analysis);
                self.emit_analysis(session_id, kind, AnalysisStatus::Error, None);
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn compute(
        self: &Arc<Self>,
        session_id: &str,
        kind: &str,
        ctx: &PassCtx,
        hooks: &RunHooks,
        previous_discussion: Option<DiscussionResult>,
        force: bool,
        quiet_refresh: bool,
    ) -> Result<Option<(serde_json::Value, VerificationReport)>, AgentError> {
        fn pack<T: serde::Serialize>(
            o: Outcome<T>,
        ) -> Result<Option<(serde_json::Value, VerificationReport)>, AgentError> {
            let value = serde_json::to_value(&o.result).map_err(|e| AgentError::Failed {
                message: format!("Couldn't store the result: {e}"),
                details: String::new(),
            })?;
            Ok(Some((value, o.report)))
        }
        let failed = |message: &str| AgentError::Failed {
            message: message.to_string(),
            details: String::new(),
        };
        let head = ctx.head_sha.as_str();
        let need_discovery = || -> Result<DiscoveryResult, AgentError> {
            self.done_result::<DiscoveryResult>(session_id, kinds::DISCOVERY, head)
                .ok_or_else(|| {
                    failed("This needs the Gist's analysis first. Retry the Gist, then try again.")
                })
        };

        match kind {
            kinds::DISCOVERY => pack(discovery::run(&self.runner, ctx, hooks).await?),
            kinds::QUESTIONS => {
                let d = need_discovery()?;
                pack(questions::run(&self.runner, ctx, &d, hooks).await?)
            }
            kinds::DISCUSSION => {
                let SessionSource::Pr { number, .. } = ctx.session.source.clone() else {
                    return Err(failed("Discussion is only available for pull requests."));
                };
                let engine = self.clone();
                let sid = session_id.to_string();
                let fetched = blocking(move || {
                    let conn = engine.conn()?;
                    let session = engine.session_row(&conn, &sid)?.session;
                    let repo = engine.repo_of(&conn, &session)?;
                    let remote = Self::github_remote(&repo)?;
                    github::discussion_threads(&remote.owner, &remote.name, number)
                })
                .await;
                let threads = match fetched {
                    Ok(t) => t,
                    Err(_) if quiet_refresh => return Ok(None),
                    Err(e) => {
                        return Err(failed(&format!(
                            "Couldn't load the discussion from GitHub: {e}"
                        )))
                    }
                };
                if !force {
                    if let Some(prev) = &previous_discussion {
                        if let Some(kept) = discussion::carry_over(prev, threads.clone()) {
                            return pack(Outcome {
                                result: kept,
                                report: VerificationReport::default(),
                            });
                        }
                    }
                }
                if quiet_refresh {
                    // The count changed: this is now a visible digest run.
                    self.emit_analysis(
                        session_id,
                        kind,
                        AnalysisStatus::Running,
                        Some("Reading new comments".to_string()),
                    );
                }
                pack(discussion::run(&self.runner, ctx, threads, hooks).await?)
            }
            kinds::REVIEW => {
                let d: Option<DiscoveryResult> =
                    self.done_result(session_id, kinds::DISCOVERY, head);
                let disc: Option<DiscussionResult> =
                    self.done_result(session_id, kinds::DISCUSSION, head);
                let prompt = self.settings().review_prompt;
                let mut out =
                    review::run(&self.runner, ctx, d.as_ref(), disc.as_ref(), &prompt, hooks)
                        .await?;
                // Re-running replaces unposted findings; posted ones stay.
                let conn = self.conn().map_err(|e| failed(&e))?;
                out.result.findings =
                    db::replace_findings(&conn, session_id, head, &out.result.findings)
                        .map_err(|e| failed(&e))?;
                pack(out)
            }
            other => match kinds::walkthrough_entry(other) {
                Some(entry_id) => {
                    let d = need_discovery()?;
                    let depth = self.settings().trace_depth;
                    pack(walkthrough::run(&self.runner, ctx, &d, entry_id, depth, hooks).await?)
                }
                None => Err(failed("Unknown analysis.")),
            },
        }
    }

    // ── Ask (SPEC §5.4) ────────────────────────────────────

    pub fn list_asks(&self, session_id: &str) -> Result<Vec<AskMessage>, String> {
        let conn = self.conn()?;
        let mut list = db::list_ask_messages(&conn, session_id)?;
        for m in &mut list {
            if m.status == AskStatus::Running {
                m.progress = self.progress_of(&ask_key(session_id, &m.id));
            }
        }
        Ok(list)
    }

    /// Store the running message and return it; the answer arrives by event.
    pub fn ask_send(
        self: &Arc<Self>,
        session_id: &str,
        question: &str,
    ) -> Result<AskMessage, String> {
        let question = question.trim();
        if question.is_empty() {
            return Err("Type a question first.".to_string());
        }
        let conn = self.conn()?;
        let session = self.session_row(&conn, session_id)?.session;
        let head = session
            .head_sha
            .clone()
            .ok_or("This session is still being prepared.")?;
        // Follow-up context, read before this question is stored.
        let history = db::recent_answered_asks(&conn, session_id, ask::HISTORY_LIMIT)?;
        let msg = AskMessage {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            question: question.to_string(),
            status: AskStatus::Running,
            answer: None,
            verification: None,
            error: None,
            progress: None,
            head_sha: head,
            created_at: db::now_iso(),
        };
        db::insert_ask_message(&conn, &msg)?;
        let engine = self.clone();
        let running = msg.clone();
        tokio::spawn(async move { engine.run_ask(running, history).await });
        Ok(msg)
    }

    pub async fn run_ask(self: &Arc<Self>, mut msg: AskMessage, history: Vec<AskMessage>) {
        let session_id = msg.session_id.clone();
        let key = ask_key(&session_id, &msg.id);
        let Some(cancel) = self.begin(&key) else {
            return;
        };
        let emit = |engine: &Engine, status: AskStatus, progress: Option<String>| {
            engine.sink.ask(AskEvent {
                session_id: session_id.clone(),
                message_id: msg.id.clone(),
                status,
                progress,
            });
        };
        emit(self, AskStatus::Running, None);

        let engine = self.clone();
        let sid = session_id.clone();
        let result = match blocking(move || engine.load_ctx(&sid)).await {
            Err(e) => Err(AgentError::Failed {
                message: e,
                details: String::new(),
            }),
            Ok(ctx) => {
                let hooks = {
                    let engine = self.clone();
                    let (sid, mid, pkey) = (session_id.clone(), msg.id.clone(), key.clone());
                    RunHooks {
                        progress: Arc::new(move |line: String| {
                            engine.set_progress(&pkey, &line);
                            engine.sink.ask(AskEvent {
                                session_id: sid.clone(),
                                message_id: mid.clone(),
                                status: AskStatus::Running,
                                progress: Some(line),
                            });
                        }),
                        cancel,
                        on_pass: self.pass_counter(&session_id),
                    }
                };
                let d: Option<DiscoveryResult> =
                    self.done_result(&session_id, kinds::DISCOVERY, &ctx.head_sha);
                ask::run(
                    &self.runner,
                    &ctx,
                    d.as_ref(),
                    &history,
                    &msg.question,
                    &hooks,
                )
                .await
            }
        };
        self.end(&key);

        let status = match result {
            Ok(out) => {
                msg.answer = Some(out.result);
                msg.verification = Some(out.report);
                AskStatus::Done
            }
            Err(e) => {
                msg.error = Some(e.message());
                AskStatus::Error
            }
        };
        msg.status = status;
        if let Ok(conn) = self.conn() {
            if let Err(e) = db::update_ask_message(&conn, &msg) {
                log::error!("couldn't save ask answer: {e}");
            }
        }
        self.sink.ask(AskEvent {
            session_id: msg.session_id.clone(),
            message_id: msg.id.clone(),
            status,
            progress: None,
        });
    }

    pub fn ask_cancel(&self, message_id: &str) -> Result<(), String> {
        let conn = self.conn()?;
        if let Some(m) = db::get_ask_message(&conn, message_id)? {
            self.cancel_key(&ask_key(&m.session_id, message_id));
        }
        Ok(())
    }

    // ── Questions, excerpts, findings ──────────────────────

    pub fn set_question_opened(&self, session_id: &str, question_id: &str) -> Result<(), String> {
        db::set_question_opened(&self.conn()?, session_id, question_id, true)
    }

    /// Uncapped read of a range for "Show all" (SPEC §3.4).
    pub fn read_excerpt(
        &self,
        session_id: &str,
        file: &str,
        start_line: u32,
        end_line: u32,
    ) -> Result<Excerpt, String> {
        let ctx = self.load_ctx(session_id)?;
        let src = ctx.source();
        verify::excerpt_range(&src, ctx.map(), file, start_line, end_line, false)
            .ok_or_else(|| format!("Couldn't read {file}."))
    }

    pub fn update_finding(
        &self,
        session_id: &str,
        finding_id: &str,
        comment: Option<&str>,
        included: Option<bool>,
    ) -> Result<(), String> {
        db::update_finding(&self.conn()?, session_id, finding_id, comment, included)
    }

    // ── Posting (SPEC §5.6) ────────────────────────────────

    fn post_review_blocking(
        &self,
        session_id: &str,
        input: &PostReviewInput,
    ) -> Result<PostedReview, String> {
        let conn = self.conn()?;
        let session = self.session_row(&conn, session_id)?.session;
        review::check_can_post(&session, input.event)?;
        let SessionSource::Pr { number, .. } = &session.source else {
            return Err("Posting is only available for pull requests.".to_string());
        };
        let head = session
            .head_sha
            .clone()
            .ok_or("The session isn't ready yet.")?;
        let repo = self.repo_of(&conn, &session)?;
        let remote = Self::github_remote(&repo)?;

        let findings = db::list_findings(&conn, session_id, &head)?;
        let payload = review::build_payload(&head, input.event, &input.body, &findings)?;

        let login = github::status()
            .login
            .ok_or("GitHub isn't connected. Run `gh auth login` in a terminal, then try again.")?;
        if login.eq_ignore_ascii_case(&session.author) && input.event != ReviewEvent::Comment {
            return Err("GitHub doesn't let you approve or request changes on your own pull request. Post it as a comment instead.".to_string());
        }

        // Double-post guard: a retry after a network error must not post twice.
        let existing = github::reviews_json(&remote.owner, &remote.name, *number).map_err(|e| {
            format!("Couldn't check for an existing review, so nothing was posted: {e}")
        })?;
        let posted = match review::find_duplicate(&existing, &login, &payload)? {
            Some(mut already) => {
                already.event = input.event;
                already
            }
            None => github::post_review(&remote.owner, &remote.name, *number, &payload)
                .map_err(|e| format!("GitHub didn't accept the review: {e}"))?,
        };

        db::set_session_posted_review(&conn, session_id, Some(&posted))?;
        db::mark_findings_posted(&conn, session_id, &head, &posted.id)?;
        Ok(posted)
    }

    pub async fn post_review(
        self: &Arc<Self>,
        session_id: &str,
        input: PostReviewInput,
    ) -> Result<PostedReview, String> {
        let engine = self.clone();
        let sid = session_id.to_string();
        let posted = blocking(move || engine.post_review_blocking(&sid, &input)).await?;
        self.emit_session(session_id, None);
        Ok(posted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn analysis_kinds_are_validated() {
        for k in [
            "discovery",
            "questions",
            "discussion",
            "review",
            "walkthrough:ep1",
        ] {
            assert!(valid_kind(k), "{k}");
        }
        for k in ["", "walkthrough:", "ask", "discovery2"] {
            assert!(!valid_kind(k), "{k}");
        }
    }

    #[test]
    fn keys_are_scoped_to_the_session() {
        assert_eq!(analysis_key("s1", "walkthrough:ep2"), "s1:walkthrough:ep2");
        assert!(ask_key("s1", "m1").starts_with("s1:"));
    }
}
