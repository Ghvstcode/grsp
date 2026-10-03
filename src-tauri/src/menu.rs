use tauri::{
    menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Wry,
};

pub fn build_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<Wry>> {
    // Custom menu items
    let settings = MenuItemBuilder::new("Settings...")
        .id("settings")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    let docs = MenuItemBuilder::new("grsp Documentation")
        .id("docs")
        .build(app)?;

    let report_issue = MenuItemBuilder::new("Report an Issue...")
        .id("report_issue")
        .build(app)?;

    // App menu (first submenu — appears under app name on macOS)
    let app_menu = SubmenuBuilder::new(app, "grsp")
        .about(Some(AboutMetadata {
            name: Some("grsp".into()),
            version: Some(env!("CARGO_PKG_VERSION").into()),
            comments: Some("Understand pull requests instead of reading diffs".into()),
            website: Some("https://grsp.app".into()),
            ..Default::default()
        }))
        .separator()
        .item(&settings)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    // Edit menu
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    // Window menu
    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .fullscreen()
        .separator()
        .close_window()
        .build()?;

    // Help menu
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&docs)
        .item(&report_issue)
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&edit_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()?;

    Ok(menu)
}
