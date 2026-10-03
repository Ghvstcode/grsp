//! Tauri commands for agents, GitHub, repos, sessions, analyses, ask and
//! review. Names, argument names and result shapes mirror `GrspCommands` in
//! src/core/types/grsp.ts. Long-running work is spawned and reported through
//! the `grsp://session`, `grsp://analysis` and `grsp://ask` events.

use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::agent::{self, detect};
use crate::model::*;
use crate::pipelines::{Engine, EventSink};
use crate::{db, git, github};

/// Shared state: the engine owns the cancellation handles, the 2-pass
/// semaphore (inside its runner) and the running map.
pub struct AppState {
    pub engine: Arc<Engine>,
}

/// Forwards engine events to the webview.
struct TauriSink {
    app: AppHandle,
}

impl EventSink for TauriSink {
    fn session(&self, event: SessionEvent) {
        let _ = self.app.emit(events::SESSION, event);
    }
    fn analysis(&self, event: AnalysisEvent) {
        let _ = self.app.emit(events::ANALYSIS, event);
    }
    fn ask(&self, event: AskEvent) {
        let _ = self.app.emit(events::ASK, event);
    }
}

impl AppState {
    /// Build the state during `setup`. grsp.db lives where tauri-plugin-sql
    /// puts it (the app config dir); worktrees live under the app data dir.
    pub fn init(app: &AppHandle) -> Result<Self, String> {
        let db_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
        let engine = Engine::new(
            db_dir,
            data_dir,
            agent::Runner::cli(),
            Arc::new(TauriSink { app: app.clone() }),
        );
        Ok(Self { engine })
    }
}

async fn blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("A background task failed: {e}"))?
}

fn repo_by_id(engine: &Engine, repo_id: &str) -> Result<Repo, String> {
    db::get_repo(&engine.conn()?, repo_id)?
        .ok_or_else(|| "That repository no longer exists.".to_string())
}

// ── Agents ─────────────────────────────────────────────────

#[tauri::command]
pub async fn agent_detect() -> Result<Vec<AgentStatus>, String> {
    blocking(|| Ok(detect::detect_all())).await
}

/// Re-check one agent. Uses the CLI's own sign-in command; only when the CLI
/// has none does it run the minimal model ping.
#[tauri::command]
pub async fn agent_recheck(kind: AgentKind) -> Result<AgentStatus, String> {
    let mut status = blocking(move || Ok(detect::detect(kind))).await?;
    if status.installed && status.signed_in.is_none() {
        status.signed_in = Some(match agent::cli::ping(kind).await {
            Ok(()) => true,
            Err(agent::AgentError::NotSignedIn(_)) => false,
            Err(e) => return Err(e.message()),
        });
    }
    Ok(status)
}

// ── GitHub ─────────────────────────────────────────────────

#[tauri::command]
pub async fn github_status() -> Result<GithubStatus, String> {
    blocking(|| Ok(github::status())).await
}

#[tauri::command]
pub async fn github_list_open_prs(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<OpenPr>, String> {
    let engine = state.engine.clone();
    blocking(move || {
        let repo = repo_by_id(&engine, &repo_id)?;
        let remote = repo
            .remote
            .filter(|r| r.is_github())
            .ok_or("This repository has no GitHub remote, so there are no pull requests to list. You can still compare two branches.")?;
        github::list_open_prs(&remote.owner, &remote.name)
    })
    .await
}

// ── Repos ──────────────────────────────────────────────────

#[tauri::command]
pub async fn repo_inspect(path: String) -> Result<RepoInspection, String> {
    blocking(move || Ok(git::inspect_repo(&path))).await
}

#[tauri::command]
pub async fn repo_list_branches(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<BranchList, String> {
    let engine = state.engine.clone();
    blocking(move || {
        let repo = repo_by_id(&engine, &repo_id)?;
        git::list_branches(&repo.path)
    })
    .await
}

// ── Sessions ───────────────────────────────────────────────

#[tauri::command]
pub async fn session_create(
    state: State<'_, AppState>,
    input: NewSessionInput,
) -> Result<ReviewSession, String> {
    state.engine.create_session(input).await
}

#[tauri::command]
pub async fn session_list(state: State<'_, AppState>) -> Result<Vec<ReviewSession>, String> {
    let engine = state.engine.clone();
    blocking(move || db::list_sessions(&engine.conn()?)).await
}

#[tauri::command]
pub async fn session_get(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<ReviewSession, String> {
    let engine = state.engine.clone();
    blocking(move || {
        db::get_session(&engine.conn()?, &session_id)?
            .map(|r| r.session)
            .ok_or_else(|| "That session no longer exists.".to_string())
    })
    .await
}

#[tauri::command]
pub async fn session_open(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<ReviewSession, String> {
    state.engine.open_session(&session_id).await
}

#[tauri::command]
pub async fn session_refresh(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<ReviewSession, String> {
    state.engine.refresh_session(&session_id).await
}

#[tauri::command]
pub async fn session_archive(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    state.engine.archive_session(&session_id).await
}

// ── Analyses ───────────────────────────────────────────────

#[tauri::command]
pub async fn analysis_list(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<Analysis>, String> {
    let engine = state.engine.clone();
    blocking(move || engine.list_analyses(&session_id)).await
}

#[tauri::command]
pub async fn analysis_run(
    state: State<'_, AppState>,
    session_id: String,
    kind: String,
) -> Result<(), String> {
    state.engine.start_analysis(&session_id, &kind)
}

#[tauri::command]
pub async fn analysis_cancel(
    state: State<'_, AppState>,
    session_id: String,
    kind: String,
) -> Result<(), String> {
    state.engine.cancel_analysis(&session_id, &kind);
    Ok(())
}

#[tauri::command]
pub async fn question_set_opened(
    state: State<'_, AppState>,
    session_id: String,
    question_id: String,
) -> Result<(), String> {
    let engine = state.engine.clone();
    blocking(move || engine.set_question_opened(&session_id, &question_id)).await
}

// ── Ask ────────────────────────────────────────────────────

#[tauri::command]
pub async fn ask_list(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<AskMessage>, String> {
    let engine = state.engine.clone();
    blocking(move || engine.list_asks(&session_id)).await
}

#[tauri::command]
pub async fn ask_send(
    state: State<'_, AppState>,
    session_id: String,
    question: String,
) -> Result<AskMessage, String> {
    state.engine.ask_send(&session_id, &question)
}

#[tauri::command]
pub async fn ask_cancel(state: State<'_, AppState>, message_id: String) -> Result<(), String> {
    state.engine.ask_cancel(&message_id)
}

// ── Excerpts & review ──────────────────────────────────────

#[tauri::command]
pub async fn excerpt_read(
    state: State<'_, AppState>,
    session_id: String,
    file: String,
    start_line: u32,
    end_line: u32,
) -> Result<Excerpt, String> {
    let engine = state.engine.clone();
    blocking(move || engine.read_excerpt(&session_id, &file, start_line, end_line)).await
}

#[tauri::command]
pub async fn review_update_finding(
    state: State<'_, AppState>,
    session_id: String,
    finding_id: String,
    comment: Option<String>,
    included: Option<bool>,
) -> Result<(), String> {
    let engine = state.engine.clone();
    blocking(move || engine.update_finding(&session_id, &finding_id, comment.as_deref(), included))
        .await
}

#[tauri::command]
pub async fn review_post(
    state: State<'_, AppState>,
    session_id: String,
    input: PostReviewInput,
) -> Result<PostedReview, String> {
    state.engine.post_review(&session_id, input).await
}
