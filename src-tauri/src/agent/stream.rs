//! Turning an agent CLI's JSON event stream into three things: plain one-line
//! progress (SPEC §4.4), the set of files it explored (§3.5 honesty line) and
//! its final message.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde_json::Value;

use crate::model::AgentKind;

/// Progress lines are capped to this many characters.
pub const PROGRESS_MAX_CHARS: usize = 96;
/// At most one progress update per this interval.
pub const PROGRESS_INTERVAL: Duration = Duration::from_millis(400);

/// Collapse to a single trimmed line of at most `PROGRESS_MAX_CHARS`.
pub fn one_line(s: &str) -> String {
    let flat = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= PROGRESS_MAX_CHARS {
        return flat;
    }
    let head: String = flat.chars().take(PROGRESS_MAX_CHARS - 1).collect();
    format!("{head}…")
}

/// Rate limiter for progress lines: lets one through per interval.
pub struct Throttle {
    interval: Duration,
    last: Option<Instant>,
}

impl Throttle {
    pub fn new(interval: Duration) -> Self {
        Self {
            interval,
            last: None,
        }
    }

    pub fn allow(&mut self) -> bool {
        self.allow_at(Instant::now())
    }

    pub fn allow_at(&mut self, now: Instant) -> bool {
        match self.last {
            Some(prev) if now.duration_since(prev) < self.interval => false,
            _ => {
                self.last = Some(now);
                true
            }
        }
    }
}

/// Accumulated state while reading one agent run's stdout.
pub struct StreamState {
    kind: AgentKind,
    cwd: PathBuf,
    cwd_canonical: Option<PathBuf>,
    /// Distinct repo-relative files the agent read or searched.
    pub files: BTreeSet<String>,
    /// The final message, once seen.
    pub final_text: Option<String>,
    /// Last assistant text seen (fallback when no result event arrives).
    pub last_text: Option<String>,
    /// Error reported by the CLI inside the stream.
    pub error: Option<String>,
    /// Number of tool calls observed.
    pub tool_calls: u32,
}

impl StreamState {
    pub fn new(kind: AgentKind, cwd: &Path) -> Self {
        Self {
            kind,
            cwd: cwd.to_path_buf(),
            cwd_canonical: cwd.canonicalize().ok(),
            files: BTreeSet::new(),
            final_text: None,
            last_text: None,
            error: None,
            tool_calls: 0,
        }
    }

    /// The agent's final message: the CLI's result if present, else the last
    /// assistant text.
    pub fn answer(&self) -> Option<String> {
        self.final_text
            .clone()
            .filter(|t| !t.trim().is_empty())
            .or_else(|| self.last_text.clone().filter(|t| !t.trim().is_empty()))
    }

    /// Feed one stdout line. Returns a progress line when the event describes
    /// tool activity. Lines that aren't JSON are ignored.
    pub fn feed_line(&mut self, line: &str) -> Option<String> {
        let line = line.trim();
        if line.is_empty() || !line.starts_with('{') {
            return None;
        }
        let value: Value = serde_json::from_str(line).ok()?;
        match self.kind {
            AgentKind::Claude => self.feed_claude(&value),
            AgentKind::Codex => self.feed_codex(&value),
        }
    }

    // ── Claude Code stream-json ────────────────────────────

    fn feed_claude(&mut self, v: &Value) -> Option<String> {
        match v.get("type").and_then(Value::as_str)? {
            "assistant" => {
                // Sub-agent messages carry parent_tool_use_id; their text is
                // never the final answer, but their tool use is still activity.
                let is_sub = v.get("parent_tool_use_id").is_some_and(|p| !p.is_null());
                let content = v.get("message")?.get("content")?.as_array()?;
                let mut progress = None;
                let mut text = String::new();
                for item in content {
                    match item.get("type").and_then(Value::as_str) {
                        Some("text") => {
                            if let Some(t) = item.get("text").and_then(Value::as_str) {
                                text.push_str(t);
                            }
                        }
                        Some("tool_use") => {
                            self.tool_calls += 1;
                            let name = item.get("name").and_then(Value::as_str).unwrap_or("");
                            let input = item.get("input").cloned().unwrap_or(Value::Null);
                            progress = Some(self.claude_tool_line(name, &input));
                        }
                        _ => {}
                    }
                }
                if !is_sub && !text.trim().is_empty() {
                    self.last_text = Some(text);
                }
                progress
            }
            "result" => {
                let is_error = v.get("is_error").and_then(Value::as_bool).unwrap_or(false);
                let subtype = v.get("subtype").and_then(Value::as_str).unwrap_or("");
                let result = v.get("result").and_then(Value::as_str).map(String::from);
                if is_error || (!subtype.is_empty() && subtype != "success") {
                    let msg = result
                        .filter(|r| !r.trim().is_empty())
                        .unwrap_or_else(|| format!("The agent stopped early ({subtype})"));
                    self.error = Some(msg);
                } else {
                    self.final_text = result;
                }
                None
            }
            _ => None,
        }
    }

    fn claude_tool_line(&mut self, name: &str, input: &Value) -> String {
        let s = |k: &str| input.get(k).and_then(Value::as_str);
        let line = match name {
            "Read" | "NotebookRead" => {
                let p = s("file_path").or_else(|| s("path")).unwrap_or("");
                let rel = self.note_path(p, true);
                format!("Reading {rel}")
            }
            "Grep" => {
                let pattern = s("pattern").unwrap_or("");
                if let Some(p) = s("path") {
                    self.note_path(p, false);
                }
                format!("Searching for {pattern}")
            }
            "Glob" => format!("Listing {}", s("pattern").unwrap_or("files")),
            "LS" => {
                let rel = self.relativize(s("path").unwrap_or(""));
                if rel.is_empty() {
                    "Listing the repository".to_string()
                } else {
                    format!("Listing {rel}")
                }
            }
            "Task" | "Agent" => "Exploring in more depth".to_string(),
            "" => "Working".to_string(),
            other => format!("Using {other}"),
        };
        one_line(&line)
    }

    // ── Codex exec --json ──────────────────────────────────

    fn feed_codex(&mut self, v: &Value) -> Option<String> {
        let ty = v.get("type").and_then(Value::as_str)?;
        match ty {
            "item.started" | "item.completed" | "item.updated" => {
                let item = v.get("item")?;
                let item_type = item
                    .get("type")
                    .or_else(|| item.get("item_type"))
                    .and_then(Value::as_str)?;
                match item_type {
                    "agent_message" | "assistant_message" => {
                        if ty == "item.completed" {
                            if let Some(t) = item.get("text").and_then(Value::as_str) {
                                self.last_text = Some(t.to_string());
                                self.final_text = Some(t.to_string());
                            }
                        }
                        None
                    }
                    "command_execution" => {
                        if ty != "item.started" {
                            return None;
                        }
                        self.tool_calls += 1;
                        let cmd = item.get("command").and_then(Value::as_str).unwrap_or("");
                        Some(self.codex_command_line(cmd))
                    }
                    "mcp_tool_call" | "web_search" => {
                        if ty != "item.started" {
                            return None;
                        }
                        self.tool_calls += 1;
                        Some("Using a tool".to_string())
                    }
                    _ => None,
                }
            }
            "error" => {
                if let Some(m) = v.get("message").and_then(Value::as_str) {
                    self.error = Some(unwrap_api_error(m));
                }
                None
            }
            "turn.failed" => {
                let m = v
                    .get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(Value::as_str)
                    .unwrap_or("The agent turn failed");
                self.error = Some(unwrap_api_error(m));
                None
            }
            "turn.completed" => {
                // A completed turn supersedes transient stream errors
                // (reconnect notices and the like).
                if self.final_text.is_some() {
                    self.error = None;
                }
                None
            }
            _ => None,
        }
    }

    fn codex_command_line(&mut self, raw: &str) -> String {
        let inner = unwrap_shell(raw);
        let words = shell_words(&inner);
        // Record any argument that names an existing file in the worktree.
        for w in &words {
            self.note_path(w, true);
        }
        let prog = words
            .first()
            .map(|w| w.rsplit('/').next().unwrap_or(w).to_string())
            .unwrap_or_default();
        let args: Vec<&String> = words
            .iter()
            .skip(1)
            .take_while(|w| !matches!(w.as_str(), "|" | "&&" | "||" | ";"))
            .filter(|w| !w.starts_with('-'))
            .collect();
        let line = match prog.as_str() {
            "rg" | "grep" | "ag" | "ack" => match args.first() {
                Some(p) => format!("Searching for {p}"),
                None => "Searching".to_string(),
            },
            "cat" | "sed" | "nl" | "head" | "tail" | "bat" | "less" | "awk" | "wc" => {
                match args.iter().rev().find(|a| self.is_worktree_file(a)) {
                    Some(p) => format!("Reading {}", self.relativize(p)),
                    None => "Reading files".to_string(),
                }
            }
            "ls" | "find" | "fd" | "tree" => match args.first() {
                Some(p) => format!("Listing {}", self.relativize(p)),
                None => "Listing the repository".to_string(),
            },
            "git" => format!(
                "Checking git {}",
                args.first().map(|s| s.as_str()).unwrap_or("")
            ),
            "" => "Working".to_string(),
            _ => format!("Running {inner}"),
        };
        one_line(&line)
    }

    // ── Paths ──────────────────────────────────────────────

    /// Repo-relative form of a path the agent mentioned.
    fn relativize(&self, p: &str) -> String {
        let path = Path::new(p);
        if path.is_absolute() {
            if let Ok(rel) = path.strip_prefix(&self.cwd) {
                return rel.to_string_lossy().to_string();
            }
            if let Some(canon) = &self.cwd_canonical {
                if let Ok(rel) = path.strip_prefix(canon) {
                    return rel.to_string_lossy().to_string();
                }
            }
            return p.to_string();
        }
        p.trim_start_matches("./").to_string()
    }

    fn is_worktree_file(&self, p: &str) -> bool {
        let rel = self.relativize(p);
        !rel.is_empty() && !Path::new(&rel).is_absolute() && self.cwd.join(&rel).is_file()
    }

    /// Record `p` as explored when it is a file inside the worktree. With
    /// `trust` unset the path may be a directory (a Grep scope) and is only
    /// recorded when it's a file. Returns the relative form for display.
    fn note_path(&mut self, p: &str, _trust: bool) -> String {
        let rel = self.relativize(p);
        if self.is_worktree_file(p) {
            self.files.insert(rel.clone());
        }
        rel
    }
}

/// Codex reports API failures as a JSON string inside `message`; show the
/// human-readable part.
fn unwrap_api_error(message: &str) -> String {
    serde_json::from_str::<Value>(message)
        .ok()
        .and_then(|v| {
            v.pointer("/error/message")
                .or_else(|| v.get("message"))
                .and_then(Value::as_str)
                .map(String::from)
        })
        .unwrap_or_else(|| message.to_string())
}

/// `bash -lc "rg foo"` → `rg foo`. Codex wraps every command in a shell.
fn unwrap_shell(raw: &str) -> String {
    let t = raw.trim();
    for flag in [" -lc ", " -c "] {
        if let Some(idx) = t.find(flag) {
            let head = &t[..idx];
            let shell = head.rsplit('/').next().unwrap_or(head);
            if matches!(shell, "bash" | "zsh" | "sh") {
                let rest = t[idx + flag.len()..].trim();
                let unquoted = rest
                    .strip_prefix('"')
                    .and_then(|r| r.strip_suffix('"'))
                    .or_else(|| rest.strip_prefix('\'').and_then(|r| r.strip_suffix('\'')))
                    .unwrap_or(rest);
                return unquoted.replace("\\\"", "\"");
            }
        }
    }
    t.to_string()
}

/// Minimal shell word splitting: whitespace, single and double quotes.
fn shell_words(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    let mut had = false;
    for c in s.chars() {
        match quote {
            Some(q) if c == q => quote = None,
            Some(_) => cur.push(c),
            None if c == '"' || c == '\'' => {
                quote = Some(c);
                had = true;
            }
            None if c.is_whitespace() => {
                if !cur.is_empty() || had {
                    out.push(std::mem::take(&mut cur));
                    had = false;
                }
            }
            None => cur.push(c),
        }
    }
    if !cur.is_empty() || had {
        out.push(cur);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_tree() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("grsp-stream-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("orders")).unwrap();
        std::fs::write(dir.join("orders/services.py"), "x = 1\n").unwrap();
        std::fs::write(dir.join("README.md"), "hi\n").unwrap();
        dir
    }

    #[test]
    fn claude_read_becomes_reading_line_and_counts_the_file() {
        let dir = temp_tree();
        let mut st = StreamState::new(AgentKind::Claude, &dir);
        let abs = dir.join("orders/services.py");
        let line = serde_json::json!({
            "type": "assistant",
            "message": {"content": [
                {"type": "text", "text": "Let me look."},
                {"type": "tool_use", "name": "Read", "input": {"file_path": abs}}
            ]}
        })
        .to_string();
        assert_eq!(
            st.feed_line(&line).as_deref(),
            Some("Reading orders/services.py")
        );
        assert!(st.files.contains("orders/services.py"));
        assert_eq!(st.tool_calls, 1);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn claude_grep_and_glob_lines() {
        let dir = temp_tree();
        let mut st = StreamState::new(AgentKind::Claude, &dir);
        let grep = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Grep","input":{"pattern":"bulk_create"}}]}}"#;
        assert_eq!(
            st.feed_line(grep).as_deref(),
            Some("Searching for bulk_create")
        );
        let glob = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Glob","input":{"pattern":"**/*.py"}}]}}"#;
        assert_eq!(st.feed_line(glob).as_deref(), Some("Listing **/*.py"));
        assert!(st.files.is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn claude_result_event_is_the_final_text() {
        let dir = temp_tree();
        let mut st = StreamState::new(AgentKind::Claude, &dir);
        st.feed_line(
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"draft"}]}}"#,
        );
        st.feed_line(
            r#"{"type":"result","subtype":"success","is_error":false,"result":"{\"ok\":true}"}"#,
        );
        assert_eq!(st.answer().as_deref(), Some("{\"ok\":true}"));
        assert!(st.error.is_none());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn claude_falls_back_to_last_assistant_text() {
        let dir = temp_tree();
        let mut st = StreamState::new(AgentKind::Claude, &dir);
        st.feed_line(
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"{\"a\":1}"}]}}"#,
        );
        assert_eq!(st.answer().as_deref(), Some("{\"a\":1}"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn claude_error_result_is_captured() {
        let dir = temp_tree();
        let mut st = StreamState::new(AgentKind::Claude, &dir);
        st.feed_line(r#"{"type":"result","subtype":"success","is_error":true,"result":"Invalid API key · Please run /login"}"#);
        assert!(st.error.as_deref().unwrap().contains("/login"));
        assert!(st.final_text.is_none());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn codex_command_lines() {
        let dir = temp_tree();
        let mut st = StreamState::new(AgentKind::Codex, &dir);
        let rg = r#"{"type":"item.started","item":{"id":"i1","type":"command_execution","command":"/bin/zsh -lc \"rg -n bulk_create orders\"","status":"in_progress"}}"#;
        assert_eq!(
            st.feed_line(rg).as_deref(),
            Some("Searching for bulk_create")
        );
        let cat = r#"{"type":"item.started","item":{"id":"i2","type":"command_execution","command":"bash -lc 'sed -n 1,40p orders/services.py'","status":"in_progress"}}"#;
        assert_eq!(
            st.feed_line(cat).as_deref(),
            Some("Reading orders/services.py")
        );
        assert!(st.files.contains("orders/services.py"));
        // Completion of the same item is not a second progress line.
        let done = r#"{"type":"item.completed","item":{"id":"i2","type":"command_execution","command":"bash -lc 'sed -n 1,40p orders/services.py'","status":"completed"}}"#;
        assert_eq!(st.feed_line(done), None);
        assert_eq!(st.tool_calls, 2);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn codex_agent_message_is_the_final_text() {
        let dir = temp_tree();
        let mut st = StreamState::new(AgentKind::Codex, &dir);
        st.feed_line(r#"{"type":"item.completed","item":{"id":"i1","type":"agent_message","text":"thinking out loud"}}"#);
        st.feed_line(r#"{"type":"item.completed","item":{"id":"i9","type":"agent_message","text":"{\"ok\":true}"}}"#);
        st.feed_line(r#"{"type":"turn.completed","usage":{}}"#);
        assert_eq!(st.answer().as_deref(), Some("{\"ok\":true}"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn codex_turn_failed_is_an_error() {
        let dir = temp_tree();
        let mut st = StreamState::new(AgentKind::Codex, &dir);
        st.feed_line(r#"{"type":"turn.failed","error":{"message":"usage limit reached"}}"#);
        assert_eq!(st.error.as_deref(), Some("usage limit reached"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn codex_nested_api_errors_are_unwrapped() {
        let dir = temp_tree();
        let mut st = StreamState::new(AgentKind::Codex, &dir);
        // Recorded from codex-cli 0.149.1.
        st.feed_line(r#"{"type":"item.completed","item":{"id":"item_0","type":"error","message":"a warning, not fatal"}}"#);
        assert!(st.error.is_none());
        st.feed_line(r#"{"type":"turn.failed","error":{"message":"{\"type\":\"error\",\"status\":400,\"error\":{\"type\":\"invalid_request_error\",\"message\":\"The model requires a newer version of Codex.\"}}"}}"#);
        assert_eq!(
            st.error.as_deref(),
            Some("The model requires a newer version of Codex.")
        );
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn non_json_lines_are_ignored() {
        let dir = temp_tree();
        let mut st = StreamState::new(AgentKind::Claude, &dir);
        assert_eq!(st.feed_line("warning: something"), None);
        assert_eq!(st.feed_line(""), None);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn one_line_flattens_and_truncates() {
        assert_eq!(one_line("Searching for a\n  b"), "Searching for a b");
        let long = "x".repeat(300);
        let out = one_line(&long);
        assert_eq!(out.chars().count(), PROGRESS_MAX_CHARS);
        assert!(out.ends_with('…'));
    }

    #[test]
    fn throttle_allows_one_per_interval() {
        let mut t = Throttle::new(Duration::from_millis(400));
        let t0 = Instant::now();
        assert!(t.allow_at(t0));
        assert!(!t.allow_at(t0 + Duration::from_millis(100)));
        assert!(!t.allow_at(t0 + Duration::from_millis(399)));
        assert!(t.allow_at(t0 + Duration::from_millis(400)));
        assert!(!t.allow_at(t0 + Duration::from_millis(500)));
    }

    #[test]
    fn shell_unwrapping_and_words() {
        assert_eq!(
            unwrap_shell("/bin/bash -lc \"rg 'a b' src\""),
            "rg 'a b' src"
        );
        assert_eq!(shell_words("rg 'a b' src"), vec!["rg", "a b", "src"]);
        assert_eq!(unwrap_shell("ls -la"), "ls -la");
    }
}
