import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { config } from "@core/config";

interface RepositoryRow {
    id: string;
    path: string;
    name: string;
    created_at: string;
    last_pulled_at: string | null;
    default_branch: string | null;
}

export interface Repository {
    id: string;
    path: string;
    name: string;
    createdAt: string;
    lastPulledAt: string | undefined;
    defaultBranch: string;
}

async function getDb() {
    return await Database.load(config.dbUrl);
}

function rowToRepository(row: RepositoryRow): Repository {
    return {
        id: row.id,
        path: row.path,
        name: row.name,
        createdAt: row.created_at,
        lastPulledAt: row.last_pulled_at ?? undefined,
        defaultBranch: row.default_branch ?? "main",
    };
}

export async function listRepositories(): Promise<Repository[]> {
    const db = await getDb();
    const rows = await db.select<RepositoryRow[]>(
        "SELECT * FROM repositories ORDER BY created_at DESC",
    );
    return rows.map(rowToRepository);
}

export async function addRepository(
    path: string,
    name: string,
): Promise<Repository> {
    const db = await getDb();

    const existing = await db.select<{ id: string }[]>(
        "SELECT id FROM repositories WHERE path = $1 LIMIT 1",
        [path],
    );
    if (existing.length > 0) {
        throw new Error("This project has already been added");
    }

    const [id, defaultBranch] = await Promise.all([
        invoke<string>("generate_repo_id"),
        invoke<string>("get_repo_default_branch", { path }),
    ]);

    await db.execute(
        "INSERT INTO repositories (id, path, name, default_branch) VALUES ($1, $2, $3, $4)",
        [id, path, name, defaultBranch],
    );

    const rows = await db.select<RepositoryRow[]>(
        "SELECT * FROM repositories WHERE id = $1",
        [id],
    );

    return rowToRepository(rows[0]);
}

export async function updateLastPulledAt(id: string): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE repositories SET last_pulled_at = CURRENT_TIMESTAMP WHERE id = $1",
        [id],
    );
}

export async function updateDefaultBranch(
    id: string,
    branch: string,
): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE repositories SET default_branch = $1 WHERE id = $2",
        [branch, id],
    );
}
