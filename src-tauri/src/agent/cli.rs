//! The real backend: spawns `claude -p` or `codex exec` in the worktree.

use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use async_trait::async_trait;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

use super::stream::{StreamState, Throttle, PROGRESS_INTERVAL};
use super::{
    detect, json, AgentBackend, AgentError, AgentOutput, AgentRequest, RunHooks, DETAILS_CHARS,
};
use crate::model::AgentKind;

/// Tools Claude Code may use: read, search, list. Nothing that edits or runs.
pub const CLAUDE_READ_TOOLS: &str = "Read,Grep,Glob";
/// `LS` only exists in older Claude Code versions; allowing it is harmless.
pub const CLAUDE_ALLOWED_TOOLS: &str = "Read,Grep,Glob,LS";
pub const CLAUDE_DENIED_TOOLS: &str = "Bash,Edit,Write,MultiEdit,NotebookEdit,WebFetch,WebSearch";

/// Arguments for a Claude Code pass. The prompt is written to stdin.
pub fn claude_args() -> Vec<String> {
    [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--no-session-persistence",
        "--tools",
        CLAUDE_READ_TOOLS,
        "--allowedTools",
        CLAUDE_ALLOWED_TOOLS,
        "--disallowedTools",
        CLAUDE_DENIED_TOOLS,
        "--permission-mode",
        "dontAsk",
        "--strict-mcp-config",
        "--disable-slash-commands",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

/// Arguments for a Codex pass. The trailing `-` reads the prompt from stdin.
pub fn codex_args(last_message_file: Option<&Path>) -> Vec<String> {
    let mut args: Vec<String> = [
        "exec",
        "--json",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        "--ephemeral",
        "--color",
        "never",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    if let Some(f) = last_message_file {
        args.push("--output-last-message".to_string());
        args.push(f.to_string_lossy().to_string());
    }
    args.push("-".to_string());
    args
}

fn looks_like_sign_in_problem(text: &str) -> bool {
    let t = text.to_lowercase();
    t.contains("/login")
        || t.contains("not logged in")
        || t.contains("please log in")
        || t.contains("please login")
        || t.contains("codex login")
        || t.contains("401 unauthorized")
        || t.contains("invalid api key")
        || t.contains("authentication_error")
        || t.contains("oauth token has expired")
}

fn tail(text: &str, max_chars: usize) -> String {
    let t = text.trim();
    let n = t.chars().count();
    if n <= max_chars {
        return t.to_string();
    }
    t.chars().skip(n - max_chars).collect()
}

/// Spawns the installed CLI. Stateless; safe to share.
pub struct CliBackend;

#[async_trait]
impl AgentBackend for CliBackend {
    async fn run(&self, req: &AgentRequest, hooks: &RunHooks) -> Result<AgentOutput, AgentError> {
        run_cli(req, hooks).await
    }
}

async fn run_cli(req: &AgentRequest, hooks: &RunHooks) -> Result<AgentOutput, AgentError> {
    let kind = req.kind;
    let bin = detect::resolve_agent(kind).ok_or(AgentError::NotInstalled(kind))?;

    // Codex writes its final message to a file as well as the event stream;
    // the file is the more reliable of the two.
    let last_message_file = match kind {
        AgentKind::Codex => {
            Some(std::env::temp_dir().join(format!("grsp-codex-{}.txt", uuid::Uuid::new_v4())))
        }
        AgentKind::Claude => None,
    };

    let mut cmd = Command::new(&bin);
    match kind {
        AgentKind::Claude => {
            cmd.args(claude_args());
        }
        AgentKind::Codex => {
            cmd.args(codex_args(last_message_file.as_deref()));
        }
    }
    cmd.current_dir(&req.cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    detect::apply_child_env(&mut cmd);

    let mut child = cmd.spawn().map_err(|e| AgentError::Failed {
        message: format!("Couldn't start {}: {e}", detect::display_name(kind)),
        details: bin.to_string_lossy().to_string(),
    })?;

    // Prompt via stdin, then close it so the CLI knows the prompt is complete.
    if let Some(mut stdin) = child.stdin.take() {
        let prompt = req.prompt.clone();
        tokio::spawn(async move {
            let _ = stdin.write_all(prompt.as_bytes()).await;
            let _ = stdin.shutdown().await;
        });
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let cwd = req.cwd.clone();
    let progress = hooks.progress.clone();

    let stdout_task = tokio::spawn(async move {
        let mut state = StreamState::new(kind, &cwd);
        let mut throttle = Throttle::new(PROGRESS_INTERVAL);
        let mut raw_tail = String::new();
        if let Some(pipe) = stdout {
            let mut lines = BufReader::new(pipe).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Some(p) = state.feed_line(&line) {
                    if throttle.allow() {
                        progress(p);
                    }
                }
                // Keep a bounded tail of non-JSON output for error details.
                if !line.trim_start().starts_with('{') {
                    raw_tail.push_str(&line);
                    raw_tail.push('\n');
                    if raw_tail.len() > 8_192 {
                        raw_tail = tail(&raw_tail, 4_096);
                    }
                }
            }
        }
        (state, raw_tail)
    });

    let stderr_task = tokio::spawn(async move {
        let mut buf = String::new();
        if let Some(mut pipe) = stderr {
            let mut bytes = Vec::new();
            let _ = pipe.read_to_end(&mut bytes).await;
            buf = String::from_utf8_lossy(&bytes).to_string();
        }
        buf
    });

    let cleanup = |f: &Option<std::path::PathBuf>| {
        if let Some(p) = f {
            let _ = std::fs::remove_file(p);
        }
    };

    let status = tokio::select! {
        s = child.wait() => s,
        _ = tokio::time::sleep(req.timeout) => {
            let _ = child.kill().await;
            cleanup(&last_message_file);
            return Err(AgentError::Timeout);
        }
        _ = hooks.cancel.cancelled() => {
            let _ = child.kill().await;
            cleanup(&last_message_file);
            return Err(AgentError::Cancelled);
        }
    };

    // The pipes close when the child exits; give the readers a moment.
    let (state, raw_tail) = match tokio::time::timeout(Duration::from_secs(5), stdout_task).await {
        Ok(Ok(v)) => v,
        _ => (StreamState::new(kind, &req.cwd), String::new()),
    };
    let stderr_text = tokio::time::timeout(Duration::from_secs(5), stderr_task)
        .await
        .ok()
        .and_then(|r| r.ok())
        .unwrap_or_default();

    let file_text = last_message_file
        .as_ref()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .filter(|t| !t.trim().is_empty());
    cleanup(&last_message_file);

    let exit_ok = matches!(&status, Ok(s) if s.success());
    let answer = file_text.or_else(|| state.answer());

    let diagnostics = || {
        let mut d = String::new();
        if let Some(e) = &state.error {
            d.push_str(e);
            d.push('\n');
        }
        d.push_str(&tail(&stderr_text, DETAILS_CHARS));
        if !raw_tail.trim().is_empty() {
            d.push('\n');
            d.push_str(&tail(&raw_tail, DETAILS_CHARS));
        }
        json::excerpt(&d, DETAILS_CHARS)
    };

    if let Some(err) = &state.error {
        if looks_like_sign_in_problem(err) {
            return Err(AgentError::NotSignedIn(kind));
        }
        if state.final_text.is_none() || !exit_ok {
            return Err(AgentError::Failed {
                message: format!(
                    "{} reported an error: {}",
                    detect::display_name(kind),
                    super::stream::one_line(err)
                ),
                details: diagnostics(),
            });
        }
    }

    match answer {
        Some(text) if !text.trim().is_empty() && (exit_ok || state.error.is_none()) => {
            Ok(AgentOutput {
                text,
                files_explored: state.files,
            })
        }
        _ => {
            if looks_like_sign_in_problem(&stderr_text) || looks_like_sign_in_problem(&raw_tail) {
                return Err(AgentError::NotSignedIn(kind));
            }
            let code = match &status {
                Ok(s) => s
                    .code()
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| "signal".to_string()),
                Err(e) => e.to_string(),
            };
            Err(AgentError::Failed {
                message: format!(
                    "{} exited without an answer (exit {code}).",
                    detect::display_name(kind)
                ),
                details: diagnostics(),
            })
        }
    }
}

/// A minimal model ping: used only on explicit Re-check when the CLI has no
/// non-model sign-in command (SPEC §5.8).
pub async fn ping(kind: AgentKind) -> Result<(), AgentError> {
    let cwd = std::env::temp_dir();
    let mut req = AgentRequest::new(kind, cwd, "Reply with the single word OK.".to_string());
    req.timeout = Duration::from_secs(60);
    run_cli(&req, &RunHooks::silent()).await.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_runs_read_only_and_without_session_persistence() {
        let a = claude_args();
        let has_pair = |flag: &str, val: &str| a.windows(2).any(|w| w[0] == flag && w[1] == val);
        assert!(a.contains(&"-p".to_string()));
        assert!(has_pair("--output-format", "stream-json"));
        assert!(a.contains(&"--verbose".to_string()));
        assert!(a.contains(&"--no-session-persistence".to_string()));
        assert!(has_pair("--tools", "Read,Grep,Glob"));
        assert!(has_pair("--allowedTools", "Read,Grep,Glob,LS"));
        let denied = a
            .iter()
            .position(|x| x == "--disallowedTools")
            .map(|i| a[i + 1].clone())
            .unwrap();
        for t in ["Bash", "Edit", "Write"] {
            assert!(denied.split(',').any(|d| d == t), "{t} must be denied");
        }
        assert!(!a.iter().any(|x| x.contains("dangerously")));
    }

    #[test]
    fn codex_runs_in_the_read_only_sandbox_with_json_events() {
        let a = codex_args(Some(Path::new("/tmp/out.txt")));
        assert_eq!(a[0], "exec");
        assert!(a.contains(&"--json".to_string()));
        assert!(a
            .windows(2)
            .any(|w| w[0] == "--sandbox" && w[1] == "read-only"));
        assert!(a
            .windows(2)
            .any(|w| w[0] == "--output-last-message" && w[1] == "/tmp/out.txt"));
        assert_eq!(a.last().map(String::as_str), Some("-"));
        assert!(!a.iter().any(|x| x.contains("dangerously")));
    }

    #[test]
    fn sign_in_problems_are_recognised() {
        assert!(looks_like_sign_in_problem(
            "Invalid API key · Please run /login"
        ));
        assert!(looks_like_sign_in_problem(
            "Not logged in. Run `codex login`."
        ));
        assert!(!looks_like_sign_in_problem("rate limit reached"));
    }

    #[test]
    fn tail_keeps_the_end() {
        assert_eq!(tail("abcdef", 3), "def");
        assert_eq!(tail("ab", 3), "ab");
    }
}
