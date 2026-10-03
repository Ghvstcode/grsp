#![allow(unexpected_cfgs)]

#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

use tauri::{Emitter, Manager};

pub mod agent;
mod auth;
mod command;
mod commands;
pub mod db;
pub mod git;
pub mod github;
mod menu;
pub mod migrations;
pub mod model;
pub mod pipelines;
mod preflight;
mod repository;
pub mod verify;

const DB_URL: &str = "sqlite:grsp.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = migrations::migrations();

    tauri::Builder::default()
        .manage(commands::AppState::new())
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
            command::greet,
            command::open_in_app,
            command::set_dock_badge,
            auth::generate_auth_id,
            preflight::check_git_installed,
            preflight::check_claude_installed,
            preflight::check_claude_authenticated,
            preflight::check_gh_installed,
            repository::validate_git_repo,
            repository::generate_repo_id,
            repository::get_repo_default_branch,
            repository::clone_repository,
            repository::git_pull,
            repository::get_default_clone_dir,
            repository::list_directory,
            repository::read_file_content,
            // grsp commands (src/commands.rs) are registered below by the
            // pipelines owner. Keep this list in sync with
            // src/core/types/grsp.ts → GrspCommands.
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
