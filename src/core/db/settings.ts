import { isTauri } from "@core/services/client";
import type { GrspSettings } from "@core/types/grsp";
import { getDb } from "./database";
import { readStore, writeStore } from "./browser-store";
import {
    decodeSettings,
    encodeSetting,
    type SettingRow,
    type SettingUpdate,
} from "./settings-codec";

function isRowList(value: unknown): value is SettingRow[] {
    return (
        Array.isArray(value) &&
        value.every(
            (row: unknown) =>
                typeof row === "object" &&
                row !== null &&
                "key" in row &&
                "value" in row &&
                typeof row.key === "string" &&
                typeof row.value === "string",
        )
    );
}

function browserRows(): SettingRow[] {
    return readStore("settings", () => [], isRowList);
}

export async function getSettings(): Promise<GrspSettings> {
    if (!isTauri) return decodeSettings(browserRows());
    const db = await getDb();
    const rows = await db.select<SettingRow[]>(
        "SELECT key, value FROM settings",
    );
    return decodeSettings(rows);
}

export async function updateSetting(update: SettingUpdate): Promise<void> {
    const row = encodeSetting(update);
    if (!isTauri) {
        writeStore("settings", [
            ...browserRows().filter((r) => r.key !== row.key),
            row,
        ]);
        return;
    }
    const db = await getDb();
    await db.execute(
        "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
        [row.key, row.value],
    );
}
