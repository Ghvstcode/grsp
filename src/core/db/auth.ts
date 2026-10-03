import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { config } from "@core/config";

interface AuthRow {
    id: string;
    github_id: number;
    github_username: string;
    github_avatar_url: string | null;
    github_email: string | null;
    github_access_token: string;
    created_at: string;
    updated_at: string;
}

export interface AuthRecord {
    id: string;
    githubId: number;
    username: string;
    avatarUrl: string | undefined;
    email: string | undefined;
    accessToken: string;
}

async function getDb() {
    return await Database.load(config.dbUrl);
}

function rowToRecord(row: AuthRow): AuthRecord {
    return {
        id: row.id,
        githubId: row.github_id,
        username: row.github_username,
        avatarUrl: row.github_avatar_url ?? undefined,
        email: row.github_email ?? undefined,
        accessToken: row.github_access_token,
    };
}

export async function getAuth(): Promise<AuthRecord | undefined> {
    const db = await getDb();
    const rows = await db.select<AuthRow[]>("SELECT * FROM auth LIMIT 1");
    if (rows.length === 0) return undefined;
    return rowToRecord(rows[0]);
}

export async function saveAuth(params: {
    githubId: number;
    username: string;
    avatarUrl: string | undefined;
    email: string | undefined;
    accessToken: string;
}): Promise<void> {
    const db = await getDb();
    const id = await invoke<string>("generate_auth_id");

    // Delete any existing auth record (single-user app)
    await db.execute("DELETE FROM auth");

    await db.execute(
        `INSERT INTO auth (id, github_id, github_username, github_avatar_url, github_email, github_access_token)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
            id,
            params.githubId,
            params.username,
            params.avatarUrl ?? null,
            params.email ?? null,
            params.accessToken,
        ],
    );
}

export async function clearAuth(): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM auth");
}
