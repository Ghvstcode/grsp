import { isTauri } from "@core/services/client";
import { getDb } from "./database";
import { readStore, writeStore } from "./browser-store";

interface MetadataRow {
    key: string;
    value: string;
}

// ── Browser mode ───────────────────────────────────────────

function isStringRecord(value: unknown): value is Record<string, string> {
    return (
        typeof value === "object" &&
        value !== null &&
        Object.values(value).every((v) => typeof v === "string")
    );
}

function browserMetadata(): Record<string, string> {
    return readStore("metadata", () => ({}), isStringRecord);
}

/**
 * In a plain browser onboarding counts as complete, unless the page was
 * opened with `?onboarding=1` and the flow hasn't been finished since.
 */
let browserOnboardingForced =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("onboarding") === "1";

// ── API ────────────────────────────────────────────────────

export async function getMetadata(key: string): Promise<string | undefined> {
    if (!isTauri) return browserMetadata()[key];
    const db = await getDb();
    const rows = await db.select<MetadataRow[]>(
        "SELECT value FROM app_metadata WHERE key = $1",
        [key],
    );
    return rows[0]?.value;
}

export async function setMetadata(key: string, value: string): Promise<void> {
    if (!isTauri) {
        writeStore("metadata", { ...browserMetadata(), [key]: value });
        return;
    }
    const db = await getDb();
    await db.execute(
        "INSERT INTO app_metadata (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
        [key, value],
    );
}

export async function isOnboardingComplete(): Promise<boolean> {
    if (!isTauri) return !browserOnboardingForced;
    const value = await getMetadata("onboarding_complete");
    return value === "true";
}

export async function setOnboardingComplete(): Promise<void> {
    if (!isTauri) {
        browserOnboardingForced = false;
        return;
    }
    await setMetadata("onboarding_complete", "true");
}
