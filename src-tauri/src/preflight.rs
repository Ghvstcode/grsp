use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct CheckResult {
    pub installed: bool,
    pub version: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AuthCheckResult {
    pub authenticated: bool,
}

/// Resolve a binary by checking well-known install locations first.
///
/// macOS .app bundles don't inherit the user's shell PATH, so bare
/// `Command::new("name")` can fail with ENOENT even when the tool is installed.
fn resolve_binary(name: &str, extra_candidates: &[PathBuf]) -> String {
    let mut candidates: Vec<PathBuf> = vec![
        // Homebrew Apple Silicon
        PathBuf::from(format!("/opt/homebrew/bin/{name}")),
        // Homebrew Intel
        PathBuf::from(format!("/usr/local/bin/{name}")),
    ];
    candidates.extend_from_slice(extra_candidates);

    for candidate in &candidates {
        if candidate.exists() {
            return candidate.to_string_lossy().to_string();
        }
    }

    // Fall back to bare name (works when launched from a terminal with correct PATH)
    name.to_string()
}

fn resolve_claude_binary() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/unknown".to_string());
    resolve_binary(
        "claude",
        &[
            PathBuf::from(format!("{home}/.claude/bin/claude")),
            PathBuf::from(format!("{home}/.npm-global/bin/claude")),
        ],
    )
}

fn resolve_gh_binary() -> String {
    resolve_binary("gh", &[])
}

/// Public accessor for use in engine_commands
pub fn resolve_gh_binary_pub() -> String {
    resolve_gh_binary()
}

fn resolve_git_binary() -> String {
    resolve_binary("git", &[PathBuf::from("/usr/bin/git")])
}

fn run_version_check(program: &str, args: &[&str]) -> CheckResult {
    match Command::new(program).args(args).output() {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let version = stdout.lines().next().map(|l| l.trim().to_string());
                CheckResult {
                    installed: true,
                    version,
                }
            } else {
                CheckResult {
                    installed: false,
                    version: None,
                }
            }
        }
        Err(_) => CheckResult {
            installed: false,
            version: None,
        },
    }
}

#[tauri::command]
pub fn check_git_installed() -> CheckResult {
    run_version_check(&resolve_git_binary(), &["--version"])
}

#[tauri::command]
pub fn check_claude_installed() -> CheckResult {
    run_version_check(&resolve_claude_binary(), &["--version"])
}

#[tauri::command]
pub fn check_claude_authenticated() -> AuthCheckResult {
    // Check if ~/.claude directory exists and has config,
    // which indicates the user has run claude at least once.
    // A more robust check would be to run `claude auth status`
    // but that may hang if the CLI prompts for input.
    let home = std::env::var("HOME").unwrap_or_default();
    let claude_dir = std::path::Path::new(&home).join(".claude");

    if claude_dir.exists() {
        // Check for credentials file or config that indicates auth
        let has_config = claude_dir.join("statsig_metadata.json").exists()
            || claude_dir.join("credentials.json").exists()
            || claude_dir.join("stats-cache.json").exists();

        AuthCheckResult {
            authenticated: has_config,
        }
    } else {
        AuthCheckResult {
            authenticated: false,
        }
    }
}

#[tauri::command]
pub fn check_gh_installed() -> CheckResult {
    run_version_check(&resolve_gh_binary(), &["--version"])
}
