use tauri::{Emitter, Manager};

pub mod agent;
mod commands;
pub mod db;
pub mod git;
pub mod github;
mod menu;
pub mod migrations;
pub mod model;
pub mod pipelines;
pub mod verify;

const DB_URL: &str = "sqlite:grsp.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = migrations::migrations();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle();
            let menu = menu::build_menu(handle)?;
            app.set_menu(menu)?;

            // grsp engine state. Work left running by a previous process is
            // reset and old worktrees are pruned off the main thread.
            let state = commands::AppState::init(handle)?;
            let engine = state.engine.clone();
            app.manage(state);
            tauri::async_runtime::spawn_blocking(move || {
                if let Err(e) = engine.startup() {
                    log::warn!("startup cleanup failed: {e}");
                }
            });
            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                std::process::exit(0);
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "settings" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu-navigate", "/settings");
                }
            }
            "docs" => {
                let _ = tauri_plugin_opener::open_url("https://grsp.app/docs", None::<&str>);
            }
            "report_issue" => {
                let _ = tauri_plugin_opener::open_url(
                    "https://github.com/ghvstcode/grsp/issues",
                    None::<&str>,
                );
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            // grsp commands. Keep this list in sync with
            // src/core/types/grsp.ts → GrspCommands.
            commands::agent_detect,
            commands::agent_recheck,
            commands::github_status,
            commands::github_list_open_prs,
            commands::repo_inspect,
            commands::repo_list_branches,
            commands::repo_list_commits,
            commands::repo_clone,
            commands::session_create,
            commands::session_list,
            commands::session_get,
            commands::session_open,
            commands::session_refresh,
            commands::session_archive,
            commands::analysis_list,
            commands::analysis_run,
            commands::analysis_cancel,
            commands::question_set_opened,
            commands::ask_list,
            commands::ask_send,
            commands::ask_cancel,
            commands::excerpt_read,
            commands::diff_read,
            commands::note_list,
            commands::note_save,
            commands::note_delete,
            commands::review_update_finding,
            commands::review_post,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
