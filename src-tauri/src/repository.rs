use serde::Serialize;
use std::path::Path;

const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".venv",
    "vendor",
    ".turbo",
    ".cache",
    "coverage",
];

#[derive(Debug, Serialize)]
pub struct ValidateResult {
    pub valid: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CloneResult {
    pub success: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn validate_git_repo(path: String) -> ValidateResult {
    let repo_path = Path::new(&path);

    if !repo_path.exists() {
        return ValidateResult {
            valid: false,
            error: Some("Directory does not exist".to_string()),
        };
    }

    if !repo_path.is_dir() {
        return ValidateResult {
            valid: false,
            error: Some("Path is not a directory".to_string()),
        };
    }

    let git_dir = repo_path.join(".git");
    if !git_dir.exists() {
        return ValidateResult {
            valid: false,
            error: Some("This directory doesn't have git initialized".to_string()),
        };
    }

    ValidateResult {
        valid: true,
        error: None,
    }
}

#[tauri::command]
pub fn generate_repo_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[tauri::command]
pub async fn clone_repository(url: String, destination: String) -> CloneResult {
    // Run blocking git clone on a background thread so the UI stays responsive
    tauri::async_runtime::spawn_blocking(move || {
        let dest_path = Path::new(&destination);

        // Create parent directory if it doesn't exist
        if let Some(parent) = dest_path.parent() {
            if !parent.exists() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    return CloneResult {
                        success: false,
                        path: None,
                        error: Some(format!("Failed to create directory: {}", e)),
                    };
                }
            }
        }

        match std::process::Command::new("git")
            .args(["clone", &url, &destination])
            .output()
        {
            Ok(output) => {
                if output.status.success() {
                    CloneResult {
                        success: true,
                        path: Some(destination),
                        error: None,
                    }
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    CloneResult {
                        success: false,
                        path: None,
                        error: Some(format!("git clone failed: {}", stderr.trim())),
                    }
                }
            }
            Err(e) => CloneResult {
                success: false,
                path: None,
                error: Some(format!("Failed to execute git: {}", e)),
            },
        }
    })
    .await
    .unwrap_or_else(|e| CloneResult {
        success: false,
        path: None,
        error: Some(format!("Clone task panicked: {}", e)),
    })
}

#[derive(Debug, Serialize)]
pub struct PullResult {
    pub success: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn git_pull(path: String) -> PullResult {
    tauri::async_runtime::spawn_blocking(move || {
        match std::process::Command::new("git")
            .args(["pull"])
            .current_dir(&path)
            .output()
        {
            Ok(output) => {
                if output.status.success() {
                    PullResult {
                        success: true,
                        error: None,
                    }
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    PullResult {
                        success: false,
                        error: Some(format!("git pull failed: {}", stderr.trim())),
                    }
                }
            }
            Err(e) => PullResult {
                success: false,
                error: Some(format!("Failed to execute git: {}", e)),
            },
        }
    })
    .await
    .unwrap_or_else(|e| PullResult {
        success: false,
        error: Some(format!("Pull task panicked: {}", e)),
    })
}

#[tauri::command]
pub fn get_repo_default_branch(path: String) -> String {
    crate::git::detect_default_branch(&path)
}

#[tauri::command]
pub fn get_default_clone_dir() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let default_dir = Path::new(&home).join("sustn").join("repos");

    // Create the directory if it doesn't exist
    if !default_dir.exists() {
        let _ = std::fs::create_dir_all(&default_dir);
    }

    default_dir.to_string_lossy().to_string()
}

// ── File tree ───────────────────────────────────────────────

const MAX_FILE_SIZE: u64 = 1_048_576; // 1 MB

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub content: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn read_file_content(repo_path: String, relative_path: String) -> Result<FileContent, String> {
    let base = Path::new(&repo_path);
    let target = base.join(&relative_path);

    // Security: ensure target is within repo_path
    let canonical_base = base.canonicalize().map_err(|e| e.to_string())?;
    let canonical_target = target.canonicalize().map_err(|e| e.to_string())?;
    if !canonical_target.starts_with(&canonical_base) {
        return Err("Path traversal not allowed".to_string());
    }

    if !target.is_file() {
        return Ok(FileContent {
            content: None,
            error: Some("Not a file".to_string()),
        });
    }

    let metadata = std::fs::metadata(&target).map_err(|e| e.to_string())?;
    if metadata.len() > MAX_FILE_SIZE {
        return Ok(FileContent {
            content: None,
            error: Some("File too large to display (> 1 MB)".to_string()),
        });
    }

    match std::fs::read_to_string(&target) {
        Ok(content) => Ok(FileContent {
            content: Some(content),
            error: None,
        }),
        Err(_) => Ok(FileContent {
            content: None,
            error: Some("Cannot display this file (binary or unreadable)".to_string()),
        }),
    }
}

// ── Directory listing for file tree ─────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub extension: String,
}

#[tauri::command]
pub fn list_directory(repo_path: String, relative_path: String) -> Result<Vec<DirEntry>, String> {
    let base = Path::new(&repo_path);
    let target = if relative_path.is_empty() {
        base.to_path_buf()
    } else {
        base.join(&relative_path)
    };

    if !target.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    // Security: ensure target is within repo_path
    let canonical_base = base.canonicalize().map_err(|e| e.to_string())?;
    let canonical_target = target.canonicalize().map_err(|e| e.to_string())?;
    if !canonical_target.starts_with(&canonical_base) {
        return Err("Path traversal not allowed".to_string());
    }

    let mut entries: Vec<DirEntry> = std::fs::read_dir(&target)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            let metadata = entry.metadata().ok()?;
            let is_dir = metadata.is_dir();

            // Skip filtered directories
            if is_dir && SKIP_DIRS.contains(&name.as_str()) {
                return None;
            }

            let rel = entry
                .path()
                .strip_prefix(base)
                .ok()?
                .to_string_lossy()
                .to_string();

            let ext = entry
                .path()
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_string();

            Some(DirEntry {
                name,
                path: rel,
                is_dir,
                size: if is_dir { 0 } else { metadata.len() },
                extension: ext,
            })
        })
        .collect();

    // Sort: directories first, then alphabetical (case-insensitive)
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}
