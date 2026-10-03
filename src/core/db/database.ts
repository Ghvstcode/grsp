import Database from "@tauri-apps/plugin-sql";
import { config } from "@core/config";

/** The app's SQLite database (Tauri only; callers check `isTauri` first). */
export async function getDb() {
    return await Database.load(config.dbUrl);
}
