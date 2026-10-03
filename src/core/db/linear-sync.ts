import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { config } from "@core/config";
import type { LinearSyncConfig, LinearSyncSchedule } from "@core/types/linear";

interface LinearSyncConfigRow {
    id: string;
    repository_id: string;
    linear_team_id: string;
    linear_team_name: string;
    linear_project_id: string | null;
    linear_project_name: string | null;
    auto_sync: number;
    sync_schedule: string;
    filter_labels: string | null;
    last_sync_at: string | null;
    created_at: string;
}

async function getDb() {
    return await Database.load(config.dbUrl);
}

function ensureUtc(ts: string): string {
    if (ts.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(ts)) return ts;
    return ts.replace(" ", "T") + "Z";
}

function rowToLinearSyncConfig(row: LinearSyncConfigRow): LinearSyncConfig {
    let filterLabels: string[] | undefined;
    if (row.filter_labels) {
        try {
            filterLabels = JSON.parse(row.filter_labels) as string[];
        } catch {
            filterLabels = undefined;
        }
    }

    return {
        id: row.id,
        repositoryId: row.repository_id,
        linearTeamId: row.linear_team_id,
        linearTeamName: row.linear_team_name,
        linearProjectId: row.linear_project_id ?? undefined,
        linearProjectName: row.linear_project_name ?? undefined,
        autoSync: row.auto_sync === 1,
        syncSchedule: (row.sync_schedule ?? "manual") as LinearSyncSchedule,
        filterLabels,
        lastSyncAt: row.last_sync_at ? ensureUtc(row.last_sync_at) : undefined,
        createdAt: ensureUtc(row.created_at),
    };
}

export async function getLinearSyncConfigs(
    repositoryId: string,
): Promise<LinearSyncConfig[]> {
    const db = await getDb();
    const rows = await db.select<LinearSyncConfigRow[]>(
        "SELECT * FROM linear_sync_config WHERE repository_id = $1 ORDER BY created_at ASC",
        [repositoryId],
    );
    return rows.map(rowToLinearSyncConfig);
}

export async function createLinearSyncConfig(syncConfig: {
    repositoryId: string;
    linearTeamId: string;
    linearTeamName: string;
    linearProjectId?: string;
    linearProjectName?: string;
    filterLabels?: string[];
}): Promise<LinearSyncConfig> {
    const db = await getDb();
    const id = await invoke<string>("generate_task_id");

    await db.execute(
        `INSERT INTO linear_sync_config (id, repository_id, linear_team_id, linear_team_name, linear_project_id, linear_project_name, filter_labels)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            id,
            syncConfig.repositoryId,
            syncConfig.linearTeamId,
            syncConfig.linearTeamName,
            syncConfig.linearProjectId ?? null,
            syncConfig.linearProjectName ?? null,
            syncConfig.filterLabels
                ? JSON.stringify(syncConfig.filterLabels)
                : null,
        ],
    );

    const rows = await db.select<LinearSyncConfigRow[]>(
        "SELECT * FROM linear_sync_config WHERE id = $1",
        [id],
    );

    return rowToLinearSyncConfig(rows[0]);
}

export async function deleteLinearSyncConfig(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM linear_sync_config WHERE id = $1", [id]);
}

export async function getAllLinearSyncConfigs(): Promise<LinearSyncConfig[]> {
    const db = await getDb();
    const rows = await db.select<LinearSyncConfigRow[]>(
        "SELECT * FROM linear_sync_config ORDER BY created_at ASC",
    );
    return rows.map(rowToLinearSyncConfig);
}

export async function updateSyncSchedule(
    id: string,
    schedule: LinearSyncSchedule,
): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE linear_sync_config SET sync_schedule = $1 WHERE id = $2",
        [schedule, id],
    );
}

export async function updateLastSyncAt(id: string): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE linear_sync_config SET last_sync_at = CURRENT_TIMESTAMP WHERE id = $1",
        [id],
    );
}
