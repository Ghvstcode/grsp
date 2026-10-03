//! Agent runner: one interface over Claude Code and Codex (SPEC §4).
//!
//! The runner spawns the user's own CLI in the session worktree with read-only
//! tools, streams tool activity as plain progress lines, and returns the final
//! message parsed as the pipeline's JSON type, with one repair retry. It never
//! reads, stores or passes API keys.

pub mod cli;
pub mod detect;
pub mod json;
pub mod prompt;
pub mod stream;

use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde::de::DeserializeOwned;
use tokio::sync::{Notify, Semaphore};

use crate::model::AgentKind;

pub use cli::CliBackend;
pub use prompt::PromptLayers;

/// SPEC §4.2: a 5-minute timeout per pass.
pub const PASS_TIMEOUT: Duration = Duration::from_secs(300);
/// SPEC §4.2: at most 2 concurrent passes.
pub const MAX_CONCURRENT_PASSES: usize = 2;
/// Characters of raw output kept for the "Details" disclosure.
pub const DETAILS_CHARS: usize = 2_000;

// ── Cancellation ───────────────────────────────────────────

/// A cancellation handle for one running pass (or one pipeline run).
#[derive(Clone, Default)]
pub struct CancelToken {
    inner: Arc<CancelInner>,
}

#[derive(Default)]
struct CancelInner {
    flag: AtomicBool,
    notify: Notify,
}

impl CancelToken {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.inner.flag.store(true, Ordering::SeqCst);
        self.inner.notify.notify_waiters();
    }

    pub fn is_cancelled(&self) -> bool {
        self.inner.flag.load(Ordering::SeqCst)
    }

    /// Resolves once `cancel` has been called.
    pub async fn cancelled(&self) {
        loop {
            let notified = self.inner.notify.notified();
            tokio::pin!(notified);
            // Register before checking the flag so a concurrent cancel isn't missed.
            notified.as_mut().enable();
            if self.is_cancelled() {
                return;
            }
            notified.await;
        }
    }
}

// ── Requests, output, errors ───────────────────────────────

pub type ProgressFn = Arc<dyn Fn(String) + Send + Sync>;
pub type PassFn = Arc<dyn Fn() + Send + Sync>;

/// One agent pass.
#[derive(Clone)]
pub struct AgentRequest {
    pub kind: AgentKind,
    /// The session worktree; the agent's working directory.
    pub cwd: PathBuf,
    /// The fully layered prompt.
    pub prompt: String,
    pub timeout: Duration,
}

impl AgentRequest {
    pub fn new(kind: AgentKind, cwd: impl Into<PathBuf>, prompt: String) -> Self {
        Self {
            kind,
            cwd: cwd.into(),
            prompt,
            timeout: PASS_TIMEOUT,
        }
    }
}

/// Hooks for one run: progress lines, cancellation, pass counting.
#[derive(Clone)]
pub struct RunHooks {
    /// Receives rate-limited one-line progress.
    pub progress: ProgressFn,
    pub cancel: CancelToken,
    /// Called once per agent process actually started (SPEC §4.5 pass count).
    pub on_pass: PassFn,
}

impl RunHooks {
    pub fn silent() -> Self {
        Self {
            progress: Arc::new(|_| {}),
            cancel: CancelToken::new(),
            on_pass: Arc::new(|| {}),
        }
    }
}

/// What one backend run produced.
#[derive(Debug, Clone, Default)]
pub struct AgentOutput {
    /// The agent's final message.
    pub text: String,
    /// Distinct repo-relative files it read or searched.
    pub files_explored: BTreeSet<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum AgentError {
    /// The CLI binary wasn't found.
    NotInstalled(AgentKind),
    /// The CLI reported that the user isn't signed in.
    NotSignedIn(AgentKind),
    Timeout,
    Cancelled,
    /// The CLI failed to start or exited with an error.
    Failed {
        message: String,
        details: String,
    },
    /// The reply couldn't be parsed even after the repair retry.
    BadOutput {
        message: String,
        details: String,
    },
}

impl AgentError {
    /// Plain-language message for the section's error state.
    pub fn message(&self) -> String {
        match self {
            AgentError::NotInstalled(k) => format!(
                "{} isn't installed, or grsp can't find it. Check Settings → Agent.",
                detect::display_name(*k)
            ),
            AgentError::NotSignedIn(k) => format!(
                "{} isn't signed in. Run `{}` in a terminal, sign in, then retry.",
                detect::display_name(*k),
                detect::binary_name(*k)
            ),
            AgentError::Timeout => {
                "The agent took longer than 5 minutes and was stopped.".to_string()
            }
            AgentError::Cancelled => "Cancelled.".to_string(),
            AgentError::Failed { message, .. } => message.clone(),
            AgentError::BadOutput { message, .. } => message.clone(),
        }
    }

    /// Raw-output excerpt for "Details", when there is one.
    pub fn details(&self) -> Option<String> {
        match self {
            AgentError::Failed { details, .. } | AgentError::BadOutput { details, .. } => {
                Some(details.clone()).filter(|d| !d.trim().is_empty())
            }
            _ => None,
        }
    }
}

impl std::fmt::Display for AgentError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message())
    }
}

impl std::error::Error for AgentError {}

// ── Backend trait ──────────────────────────────────────────

/// Something that can run one agent pass. `CliBackend` spawns the real CLI;
/// contract tests use a scripted backend that replays recorded replies.
#[async_trait]
pub trait AgentBackend: Send + Sync {
    async fn run(&self, req: &AgentRequest, hooks: &RunHooks) -> Result<AgentOutput, AgentError>;
}

/// A parsed reply plus what the agent did to produce it.
#[derive(Debug, Clone)]
pub struct JsonPass<T> {
    pub value: T,
    pub files_explored: BTreeSet<String>,
    /// Agent processes used (2 when the repair retry ran).
    pub passes: u32,
    /// The raw final message that was parsed.
    pub raw: String,
}

// ── Runner ─────────────────────────────────────────────────

/// Runs passes through a backend under the global concurrency limit.
#[derive(Clone)]
pub struct Runner {
    backend: Arc<dyn AgentBackend>,
    semaphore: Arc<Semaphore>,
}

impl Runner {
    pub fn new(backend: Arc<dyn AgentBackend>) -> Self {
        Self::with_limit(backend, MAX_CONCURRENT_PASSES)
    }

    pub fn with_limit(backend: Arc<dyn AgentBackend>, limit: usize) -> Self {
        Self {
            backend,
            semaphore: Arc::new(Semaphore::new(limit.max(1))),
        }
    }

    /// The real runner: spawns the installed CLIs.
    pub fn cli() -> Self {
        Self::new(Arc::new(CliBackend))
    }

    /// Passes currently allowed to start without waiting.
    pub fn available_slots(&self) -> usize {
        self.semaphore.available_permits()
    }

    /// Run one pass and parse its final message as `T`.
    ///
    /// On a parse or schema failure, retry once with the error appended. If
    /// that fails too, return `BadOutput` carrying a raw-output excerpt.
    pub async fn run_json<T: DeserializeOwned>(
        &self,
        req: &AgentRequest,
        hooks: &RunHooks,
    ) -> Result<JsonPass<T>, AgentError> {
        self.run_json_checked(req, hooks, |_| Ok(())).await
    }

    /// `run_json` with an extra check on the parsed value; a reply that
    /// fails it is treated like any other schema failure.
    pub async fn run_json_checked<T, F>(
        &self,
        req: &AgentRequest,
        hooks: &RunHooks,
        check: F,
    ) -> Result<JsonPass<T>, AgentError>
    where
        T: DeserializeOwned,
        F: Fn(&T) -> Result<(), String> + Send + Sync,
    {
        self.run_parsed(req, hooks, |text: &str| -> Result<T, json::JsonError> {
            let value = json::parse_reply::<T>(text)?;
            check(&value).map_err(json::JsonError::Schema)?;
            Ok(value)
        })
        .await
    }

    /// Run a pipeline pass. The raw schemas deserialise leniently (a missing
    /// list is an empty list), so the top-level shape is enforced by
    /// `model::parse_agent_output` and each pipeline states in `check` what a
    /// usable reply must contain. Either failing triggers the repair retry.
    pub async fn run_output<T, F>(
        &self,
        req: &AgentRequest,
        hooks: &RunHooks,
        check: F,
    ) -> Result<JsonPass<T>, AgentError>
    where
        T: crate::model::AgentOutput,
        F: Fn(&T) -> Result<(), String> + Send + Sync,
    {
        self.run_parsed(req, hooks, |text: &str| -> Result<T, json::JsonError> {
            let raw = json::extract_value(text).ok_or(json::JsonError::NoObject)?;
            let value =
                crate::model::parse_agent_output::<T>(raw).map_err(json::JsonError::Schema)?;
            check(&value).map_err(json::JsonError::Schema)?;
            Ok(value)
        })
        .await
    }

    async fn run_parsed<T, P>(
        &self,
        req: &AgentRequest,
        hooks: &RunHooks,
        parse: P,
    ) -> Result<JsonPass<T>, AgentError>
    where
        P: Fn(&str) -> Result<T, json::JsonError> + Send + Sync,
    {
        if hooks.cancel.is_cancelled() {
            return Err(AgentError::Cancelled);
        }
        if self.semaphore.available_permits() == 0 {
            (hooks.progress)("Waiting for another analysis to finish".to_string());
        }
        let _permit = tokio::select! {
            p = self.semaphore.acquire() => p.map_err(|_| AgentError::Cancelled)?,
            _ = hooks.cancel.cancelled() => return Err(AgentError::Cancelled),
        };

        (hooks.on_pass)();
        let first = self.backend.run(req, hooks).await?;
        let mut files = first.files_explored.clone();
        let first_err = match parse(&first.text) {
            Ok(value) => {
                return Ok(JsonPass {
                    value,
                    files_explored: files,
                    passes: 1,
                    raw: first.text,
                })
            }
            Err(e) => e,
        };

        if hooks.cancel.is_cancelled() {
            return Err(AgentError::Cancelled);
        }
        (hooks.progress)("Asking the agent to fix its reply".to_string());
        let mut retry = req.clone();
        retry.prompt = prompt::build_repair(&req.prompt, &first_err.to_string(), &first.text);
        (hooks.on_pass)();
        let second = self.backend.run(&retry, hooks).await?;
        files.extend(second.files_explored.iter().cloned());
        match parse(&second.text) {
            Ok(value) => Ok(JsonPass {
                value,
                files_explored: files,
                passes: 2,
                raw: second.text,
            }),
            Err(e) => Err(AgentError::BadOutput {
                message: format!("The agent's reply couldn't be read: {e}."),
                details: json::excerpt(&second.text, DETAILS_CHARS),
            }),
        }
    }
}

// ── Scripted backend (tests, contract tests, evals) ────────

/// Replays recorded replies in order. Records the prompts it was given.
pub struct ScriptedBackend {
    replies: std::sync::Mutex<std::collections::VecDeque<Result<AgentOutput, AgentError>>>,
    pub prompts: std::sync::Mutex<Vec<String>>,
}

impl ScriptedBackend {
    pub fn new<I, S>(replies: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Self {
            replies: std::sync::Mutex::new(
                replies
                    .into_iter()
                    .map(|s| {
                        Ok(AgentOutput {
                            text: s.into(),
                            files_explored: BTreeSet::new(),
                        })
                    })
                    .collect(),
            ),
            prompts: std::sync::Mutex::new(Vec::new()),
        }
    }

    pub fn from_results(replies: Vec<Result<AgentOutput, AgentError>>) -> Self {
        Self {
            replies: std::sync::Mutex::new(replies.into()),
            prompts: std::sync::Mutex::new(Vec::new()),
        }
    }

    pub fn calls(&self) -> usize {
        self.prompts.lock().map(|p| p.len()).unwrap_or(0)
    }
}

#[async_trait]
impl AgentBackend for ScriptedBackend {
    async fn run(&self, req: &AgentRequest, _hooks: &RunHooks) -> Result<AgentOutput, AgentError> {
        if let Ok(mut p) = self.prompts.lock() {
            p.push(req.prompt.clone());
        }
        let next = self.replies.lock().ok().and_then(|mut r| r.pop_front());
        next.unwrap_or_else(|| {
            Err(AgentError::Failed {
                message: "No recorded reply left".to_string(),
                details: String::new(),
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use std::sync::atomic::AtomicUsize;

    #[derive(Debug, Deserialize, PartialEq)]
    struct Reply {
        answer: String,
    }

    fn req() -> AgentRequest {
        AgentRequest::new(
            AgentKind::Claude,
            std::env::temp_dir(),
            "PROMPT".to_string(),
        )
    }

    fn counting_hooks() -> (RunHooks, Arc<AtomicUsize>) {
        let n = Arc::new(AtomicUsize::new(0));
        let n2 = n.clone();
        let hooks = RunHooks {
            progress: Arc::new(|_| {}),
            cancel: CancelToken::new(),
            on_pass: Arc::new(move || {
                n2.fetch_add(1, Ordering::SeqCst);
            }),
        };
        (hooks, n)
    }

    #[tokio::test]
    async fn good_reply_parses_in_one_pass() {
        let backend = Arc::new(ScriptedBackend::new([
            "```json\n{\"answer\": \"yes\"}\n```",
        ]));
        let runner = Runner::new(backend.clone());
        let (hooks, passes) = counting_hooks();
        let out: JsonPass<Reply> = runner.run_json(&req(), &hooks).await.unwrap();
        assert_eq!(out.value.answer, "yes");
        assert_eq!(out.passes, 1);
        assert_eq!(passes.load(Ordering::SeqCst), 1);
        assert_eq!(backend.calls(), 1);
    }

    #[tokio::test]
    async fn malformed_reply_is_retried_once_with_the_error_appended() {
        let backend = Arc::new(ScriptedBackend::new([
            "Here you go: {\"answer\": ",
            "{\"answer\": \"fixed\"}",
        ]));
        let runner = Runner::new(backend.clone());
        let (hooks, passes) = counting_hooks();
        let out: JsonPass<Reply> = runner.run_json(&req(), &hooks).await.unwrap();
        assert_eq!(out.value.answer, "fixed");
        assert_eq!(out.passes, 2);
        assert_eq!(passes.load(Ordering::SeqCst), 2);
        let prompts = backend.prompts.lock().unwrap();
        assert_eq!(prompts[0], "PROMPT");
        assert!(prompts[1].starts_with("PROMPT"));
        assert!(prompts[1].contains("did not contain a JSON object"));
        assert!(prompts[1].contains("Here you go"));
    }

    #[tokio::test]
    async fn schema_failure_is_retried_and_then_errors_with_details() {
        let backend = Arc::new(ScriptedBackend::new([
            "{\"wrong\": 1}",
            "{\"still\": \"wrong\"}",
            "{\"answer\": \"never used\"}",
        ]));
        let runner = Runner::new(backend.clone());
        let (hooks, passes) = counting_hooks();
        let err = runner.run_json::<Reply>(&req(), &hooks).await.unwrap_err();
        match &err {
            AgentError::BadOutput { message, details } => {
                assert!(message.contains("answer"), "{message}");
                assert!(details.contains("still"));
            }
            other => panic!("unexpected {other:?}"),
        }
        assert_eq!(err.details().as_deref(), Some("{\"still\": \"wrong\"}"));
        // Exactly one retry, never a third pass.
        assert_eq!(backend.calls(), 2);
        assert_eq!(passes.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn backend_errors_are_not_retried() {
        let backend = Arc::new(ScriptedBackend::from_results(vec![Err(
            AgentError::Timeout,
        )]));
        let runner = Runner::new(backend.clone());
        let err = runner
            .run_json::<Reply>(&req(), &RunHooks::silent())
            .await
            .unwrap_err();
        assert_eq!(err, AgentError::Timeout);
        assert_eq!(backend.calls(), 1);
    }

    #[tokio::test]
    async fn cancelled_before_start_never_calls_the_backend() {
        let backend = Arc::new(ScriptedBackend::new(["{\"answer\": \"x\"}"]));
        let runner = Runner::new(backend.clone());
        let hooks = RunHooks::silent();
        hooks.cancel.cancel();
        let err = runner.run_json::<Reply>(&req(), &hooks).await.unwrap_err();
        assert_eq!(err, AgentError::Cancelled);
        assert_eq!(backend.calls(), 0);
    }

    /// A backend that blocks until released, to observe concurrency.
    struct GateBackend {
        running: AtomicUsize,
        peak: AtomicUsize,
        release: Notify,
    }

    #[async_trait]
    impl AgentBackend for GateBackend {
        async fn run(
            &self,
            _req: &AgentRequest,
            hooks: &RunHooks,
        ) -> Result<AgentOutput, AgentError> {
            let now = self.running.fetch_add(1, Ordering::SeqCst) + 1;
            self.peak.fetch_max(now, Ordering::SeqCst);
            tokio::select! {
                _ = self.release.notified() => {}
                _ = hooks.cancel.cancelled() => {
                    self.running.fetch_sub(1, Ordering::SeqCst);
                    return Err(AgentError::Cancelled);
                }
            }
            self.running.fetch_sub(1, Ordering::SeqCst);
            Ok(AgentOutput {
                text: "{\"answer\": \"ok\"}".into(),
                files_explored: BTreeSet::new(),
            })
        }
    }

    #[tokio::test]
    async fn at_most_two_passes_run_at_once() {
        let backend = Arc::new(GateBackend {
            running: AtomicUsize::new(0),
            peak: AtomicUsize::new(0),
            release: Notify::new(),
        });
        let runner = Runner::new(backend.clone());
        let mut handles = Vec::new();
        for _ in 0..5 {
            let r = runner.clone();
            handles.push(tokio::spawn(async move {
                r.run_json::<Reply>(&req(), &RunHooks::silent()).await
            }));
        }
        // Let everything that can start, start.
        for _ in 0..50 {
            tokio::time::sleep(Duration::from_millis(5)).await;
            if backend.running.load(Ordering::SeqCst) == 2 {
                break;
            }
        }
        assert_eq!(backend.running.load(Ordering::SeqCst), 2);
        // Drain: keep releasing until all five finish.
        let mut done = 0;
        while done < 5 {
            backend.release.notify_waiters();
            tokio::time::sleep(Duration::from_millis(5)).await;
            done = handles.iter().filter(|h| h.is_finished()).count();
        }
        for h in handles {
            assert!(h.await.unwrap().is_ok());
        }
        assert_eq!(backend.peak.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn a_queued_pass_can_be_cancelled_while_waiting() {
        let backend = Arc::new(GateBackend {
            running: AtomicUsize::new(0),
            peak: AtomicUsize::new(0),
            release: Notify::new(),
        });
        let runner = Runner::with_limit(backend.clone(), 1);
        let first_hooks = RunHooks::silent();
        let r1 = runner.clone();
        let h1c = first_hooks.clone();
        let first = tokio::spawn(async move { r1.run_json::<Reply>(&req(), &h1c).await });
        while backend.running.load(Ordering::SeqCst) == 0 {
            tokio::time::sleep(Duration::from_millis(2)).await;
        }
        let queued_hooks = RunHooks::silent();
        let r2 = runner.clone();
        let h2c = queued_hooks.clone();
        let queued = tokio::spawn(async move { r2.run_json::<Reply>(&req(), &h2c).await });
        tokio::time::sleep(Duration::from_millis(10)).await;
        queued_hooks.cancel.cancel();
        assert_eq!(queued.await.unwrap().unwrap_err(), AgentError::Cancelled);
        // Cancelling a running pass stops it too.
        first_hooks.cancel.cancel();
        assert_eq!(first.await.unwrap().unwrap_err(), AgentError::Cancelled);
        assert_eq!(backend.peak.load(Ordering::SeqCst), 1);
    }
}
