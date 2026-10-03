//! Finding the agent CLIs and checking sign-in (SPEC §5.8).
//!
//! macOS .app bundles don't inherit the shell PATH, so a bare
//! `Command::new("claude")` fails even when the CLI is installed. We look on
//! PATH first, then in the places the CLIs are known to install themselves.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::model::{AgentKind, AgentStatus};

/// Environment variables that would switch a CLI from the user's subscription
/// to API-key billing. grsp never passes these to an agent.
pub const API_KEY_ENV: &[&str] = &[
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
];

/// Variables set by a parent Claude Code session; a nested run should not
/// believe it is that session.
pub const NESTED_SESSION_ENV: &[&str] = &[
    "CLAUDECODE",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_SSE_PORT",
];

pub fn binary_name(kind: AgentKind) -> &'static str {
    match kind {
        AgentKind::Claude => "claude",
        AgentKind::Codex => "codex",
    }
}

pub fn display_name(kind: AgentKind) -> &'static str {
    match kind {
        AgentKind::Claude => "Claude Code",
        AgentKind::Codex => "Codex",
    }
}

fn home_dir() -> PathBuf {
    dirs::home_dir()
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("/"))
}

fn path_env_dirs() -> Vec<PathBuf> {
    std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default()
}

/// Version-manager directories of the form `{root}/{version}/{suffix}`,
/// newest version first.
fn versioned_dirs(root: &Path, suffix: &str) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::fs::read_dir(root)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_dir())
                .collect()
        })
        .unwrap_or_default();
    dirs.sort();
    dirs.reverse();
    dirs.into_iter()
        .map(|d| if suffix.is_empty() { d } else { d.join(suffix) })
        .collect()
}

/// Known install locations, in priority order (after PATH).
pub fn known_dirs() -> Vec<PathBuf> {
    let home = home_dir();
    let mut dirs = vec![
        home.join(".local/bin"),
        home.join(".claude/bin"),
        home.join(".claude/local"),
        home.join(".codex/bin"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        home.join(".npm-global/bin"),
        home.join(".volta/bin"),
        home.join(".bun/bin"),
        home.join("Library/pnpm"),
        home.join(".local/share/pnpm"),
        home.join(".yarn/bin"),
        home.join(".asdf/shims"),
        home.join(".local/share/mise/shims"),
        home.join(".cargo/bin"),
    ];
    dirs.extend(versioned_dirs(&home.join(".nvm/versions/node"), "bin"));
    dirs.extend(versioned_dirs(
        &home.join(".local/share/fnm/node-versions"),
        "installation/bin",
    ));
    dirs.extend(versioned_dirs(
        &home.join("Library/Application Support/fnm/node-versions"),
        "installation/bin",
    ));
    dirs
}

fn is_executable_file(p: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(p)
            .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        p.is_file()
    }
}

/// Find `name` in the given directories, first hit wins.
pub fn find_in(name: &str, dirs: &[PathBuf]) -> Option<PathBuf> {
    dirs.iter()
        .map(|d| d.join(name))
        .find(|p| is_executable_file(p))
}

/// Resolve any CLI by name: PATH first, then the known install paths.
pub fn resolve_binary(name: &str) -> Option<PathBuf> {
    find_in(name, &path_env_dirs()).or_else(|| find_in(name, &known_dirs()))
}

pub fn resolve_agent(kind: AgentKind) -> Option<PathBuf> {
    resolve_binary(binary_name(kind))
}

/// A PATH for child processes: the inherited PATH, then every known install
/// directory that exists, then the system directories. Agents shell out to
/// `node`, `git`, `rg` and friends, which a bundled app otherwise can't find.
pub fn child_path() -> String {
    let mut dirs = path_env_dirs();
    for d in known_dirs() {
        if d.is_dir() {
            dirs.push(d);
        }
    }
    for d in ["/usr/bin", "/bin", "/usr/sbin", "/sbin"] {
        dirs.push(PathBuf::from(d));
    }
    let mut seen = std::collections::HashSet::new();
    dirs.retain(|d| seen.insert(d.clone()));
    std::env::join_paths(dirs)
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|_| "/usr/bin:/bin".to_string())
}

/// Apply grsp's child environment to a command: sensible PATH and HOME, no
/// API keys, no parent-session markers.
pub fn apply_child_env_std(cmd: &mut Command) {
    cmd.env("PATH", child_path());
    cmd.env("HOME", home_dir());
    for k in API_KEY_ENV.iter().chain(NESTED_SESSION_ENV) {
        cmd.env_remove(k);
    }
}

/// Same as `apply_child_env_std` for tokio commands.
pub fn apply_child_env(cmd: &mut tokio::process::Command) {
    cmd.env("PATH", child_path());
    cmd.env("HOME", home_dir());
    for k in API_KEY_ENV.iter().chain(NESTED_SESSION_ENV) {
        cmd.env_remove(k);
    }
}

/// Output of a short helper command.
pub struct ShortOutput {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

/// Run a short command with a hard timeout so a CLI that prompts for input
/// can never hang detection.
pub fn run_short(program: &Path, args: &[&str], timeout: Duration) -> Option<ShortOutput> {
    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_child_env_std(&mut cmd);
    let mut child = cmd.spawn().ok()?;
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(_) => return None,
        }
    }
    let out = child.wait_with_output().ok()?;
    Some(ShortOutput {
        success: out.status.success(),
        stdout: String::from_utf8_lossy(&out.stdout).to_string(),
        stderr: String::from_utf8_lossy(&out.stderr).to_string(),
    })
}

/// "2.1.286 (Claude Code)" → "2.1.286"; "codex-cli 0.149.1" → "0.149.1".
pub fn parse_version(output: &str) -> Option<String> {
    let line = output.lines().find(|l| !l.trim().is_empty())?;
    line.split_whitespace()
        .find(|w| w.chars().next().is_some_and(|c| c.is_ascii_digit()) && w.contains('.'))
        .map(|w| {
            w.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '.' && c != '-')
                .to_string()
        })
        .or_else(|| Some(line.trim().to_string()))
}

/// Outcome of the cheap (non-model) sign-in command.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SignIn {
    Yes,
    No,
    /// The CLI has no such command, or its output wasn't understood.
    Unknown,
}

/// Interpret `claude auth status` (JSON with `loggedIn`).
pub fn parse_claude_auth_status(success: bool, stdout: &str, stderr: &str) -> SignIn {
    if let Some(v) = super::json::extract_object(stdout) {
        if let Some(b) = v.get("loggedIn").and_then(|b| b.as_bool()) {
            return if b { SignIn::Yes } else { SignIn::No };
        }
    }
    let all = format!("{stdout}\n{stderr}").to_lowercase();
    if all.contains("not logged in") || all.contains("not authenticated") {
        return SignIn::No;
    }
    if success && (all.contains("logged in") || all.contains("authenticated")) {
        return SignIn::Yes;
    }
    SignIn::Unknown
}

/// Interpret `codex login status` ("Logged in using ChatGPT" / "Not logged in").
pub fn parse_codex_login_status(success: bool, stdout: &str, stderr: &str) -> SignIn {
    let all = format!("{stdout}\n{stderr}").to_lowercase();
    if all.contains("not logged in") {
        return SignIn::No;
    }
    if all.contains("logged in") {
        return SignIn::Yes;
    }
    if all.contains("unrecognized") || all.contains("unknown") || all.contains("usage:") {
        return SignIn::Unknown;
    }
    if success {
        SignIn::Unknown
    } else {
        SignIn::No
    }
}

/// Run the CLI's own non-model sign-in command.
pub fn cheap_sign_in(kind: AgentKind, bin: &Path) -> SignIn {
    let timeout = Duration::from_secs(10);
    match kind {
        AgentKind::Claude => match run_short(bin, &["auth", "status"], timeout) {
            Some(o) => parse_claude_auth_status(o.success, &o.stdout, &o.stderr),
            None => SignIn::Unknown,
        },
        AgentKind::Codex => match run_short(bin, &["login", "status"], timeout) {
            Some(o) => parse_codex_login_status(o.success, &o.stdout, &o.stderr),
            None => SignIn::Unknown,
        },
    }
}

/// The command line grsp runs, as shown in Settings.
pub fn display_command(kind: AgentKind) -> String {
    match kind {
        AgentKind::Claude => format!("claude {}", super::cli::claude_args().join(" ")),
        AgentKind::Codex => format!("codex {}", super::cli::codex_args(None).join(" ")),
    }
}

/// Detect one agent: path, version and (cheaply) sign-in. Never calls a model.
pub fn detect(kind: AgentKind) -> AgentStatus {
    let command = display_command(kind);
    let Some(bin) = resolve_agent(kind) else {
        return AgentStatus {
            kind,
            installed: false,
            path: None,
            version: None,
            signed_in: None,
            command,
        };
    };
    let version = run_short(&bin, &["--version"], Duration::from_secs(10))
        .filter(|o| o.success)
        .and_then(|o| parse_version(&o.stdout));
    let signed_in = match cheap_sign_in(kind, &bin) {
        SignIn::Yes => Some(true),
        SignIn::No => Some(false),
        SignIn::Unknown => None,
    };
    AgentStatus {
        kind,
        installed: true,
        path: Some(bin.to_string_lossy().to_string()),
        version,
        signed_in,
        command,
    }
}

pub fn detect_all() -> Vec<AgentStatus> {
    vec![detect(AgentKind::Claude), detect(AgentKind::Codex)]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_parsing() {
        assert_eq!(
            parse_version("2.1.286 (Claude Code)\n").as_deref(),
            Some("2.1.286")
        );
        assert_eq!(
            parse_version("codex-cli 0.149.1").as_deref(),
            Some("0.149.1")
        );
        assert_eq!(
            parse_version("gh version 2.96.0 (2026-07-02)").as_deref(),
            Some("2.96.0")
        );
        assert_eq!(parse_version("").as_deref(), None);
    }

    #[test]
    fn claude_auth_status_json() {
        assert_eq!(
            parse_claude_auth_status(true, r#"{"loggedIn": true, "authMethod": "claude.ai"}"#, ""),
            SignIn::Yes
        );
        assert_eq!(
            parse_claude_auth_status(false, r#"{"loggedIn": false}"#, ""),
            SignIn::No
        );
        assert_eq!(
            parse_claude_auth_status(false, "", "error: unknown command 'auth'"),
            SignIn::Unknown
        );
        assert_eq!(
            parse_claude_auth_status(false, "Not logged in", ""),
            SignIn::No
        );
    }

    #[test]
    fn codex_login_status_text() {
        assert_eq!(
            parse_codex_login_status(true, "Logged in using ChatGPT\n", ""),
            SignIn::Yes
        );
        assert_eq!(
            parse_codex_login_status(false, "", "Not logged in\n"),
            SignIn::No
        );
        assert_eq!(
            parse_codex_login_status(false, "", "error: unrecognized subcommand 'status'"),
            SignIn::Unknown
        );
    }

    #[test]
    fn find_in_respects_order_and_executability() {
        let base = std::env::temp_dir().join(format!("grsp-detect-{}", uuid::Uuid::new_v4()));
        let a = base.join("a");
        let b = base.join("b");
        std::fs::create_dir_all(&a).unwrap();
        std::fs::create_dir_all(&b).unwrap();
        std::fs::write(a.join("tool"), "not executable").unwrap();
        std::fs::write(b.join("tool"), "#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(b.join("tool"), std::fs::Permissions::from_mode(0o755))
                .unwrap();
            assert_eq!(
                find_in("tool", &[a.clone(), b.clone()]),
                Some(b.join("tool"))
            );
        }
        assert_eq!(find_in("missing", &[a, b]), None);
        std::fs::remove_dir_all(base).ok();
    }

    #[test]
    fn child_path_includes_system_dirs_once() {
        let p = child_path();
        let parts: Vec<&str> = p.split(':').collect();
        assert!(parts.contains(&"/usr/bin"));
        assert_eq!(parts.iter().filter(|d| **d == "/usr/bin").count(), 1);
    }

    #[test]
    fn display_command_never_mentions_keys() {
        for kind in [AgentKind::Claude, AgentKind::Codex] {
            let c = display_command(kind).to_lowercase();
            assert!(!c.contains("api"), "{c}");
            assert!(!c.contains("key"), "{c}");
        }
    }
}
