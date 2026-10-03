#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to grsp.", name)
}

#[tauri::command]
pub async fn open_in_app(path: String, app: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg("-a")
        .arg(&app)
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open {app}: {e}"))?;
    Ok(())
}

/// Set the macOS dock badge count. Pass `None` / null to clear.
#[tauri::command]
#[allow(unused_variables)]
pub fn set_dock_badge(count: Option<u32>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        #[allow(deprecated)]
        unsafe {
            use cocoa::appkit::NSApp;
            use cocoa::base::nil;
            use cocoa::foundation::NSString;
            use objc::runtime::Object;

            let app: *mut Object = NSApp();
            let dock_tile: *mut Object = msg_send![app, dockTile];
            let label = match count {
                Some(n) if n > 0 => {
                    NSString::alloc(nil).init_str(&n.to_string())
                }
                _ => nil,
            };
            let _: () = msg_send![dock_tile, setBadgeLabel: label];
        }
    }

    Ok(())
}
