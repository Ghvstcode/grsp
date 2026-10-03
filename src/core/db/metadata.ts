import Database from "@tauri-apps/plugin-sql";
import { config } from "@core/config";

interface MetadataRow {
    key: string;
    value: string;
}

async function getDb() {
    return await Database.load(config.dbUrl);
}

export async function getMetadata(key: string): Promise<string | undefined> {
    const db = await getDb();
    const rows = await db.select<MetadataRow[]>(
        "SELECT value FROM app_metadata WHERE key = $1",
        [key],
    );
    return rows[0]?.value;
}

export async function setMetadata(key: string, value: string): Promise<void> {
    const db = await getDb();
    await db.execute(
        "INSERT INTO app_metadata (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
        [key, value],
    );
}

export async function isOnboardingComplete(): Promise<boolean> {
    const value = await getMetadata("onboarding_complete");
    return value === "true";
}

export async function setOnboardingComplete(): Promise<void> {
    await setMetadata("onboarding_complete", "true");
}
