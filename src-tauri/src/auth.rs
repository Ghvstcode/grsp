// We use the SQL plugin from the frontend for most DB operations,
// but this command provides UUID generation for auth records.

#[tauri::command]
pub fn generate_auth_id() -> String {
    uuid::Uuid::new_v4().to_string()
}
