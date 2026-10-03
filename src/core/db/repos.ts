import { call, useFixtures as fixtureMode } from "@core/services/client";
import type { Repo, RepoInspection } from "@core/types/grsp";
import { FIXTURE_REPOS } from "@core/fixtures/scenario";
import { getDb } from "./database";
import { readStore, writeStore } from "./browser-store";

interface RepoRow {
    id: string;
    name: string;
    path: string;
    default_branch: string | null;
    remote_host: string | null;
    remote_owner: string | null;
    remote_name: string | null;
    language: string | null;
    sidebar_open: number;
    archived: number;
    created_at: string;
}

function rowToRepo(row: RepoRow): Repo {
    return {
        id: row.id,
        name: row.name,
        path: row.path,
        defaultBranch: row.default_branch ?? "main",
        remote:
            row.remote_host === "github" && row.remote_owner && row.remote_name
                ? {
                      host: "github",
                      owner: row.remote_owner,
                      name: row.remote_name,
                  }
                : undefined,
        language: row.language ?? undefined,
        sidebarOpen: row.sidebar_open !== 0,
    };
}

// ── Fixture mode ───────────────────────────────────────────
// Outside Tauri (or with VITE_GRSP_FIXTURES=1) sessions come from the fixture
// backend, so the repo folders they belong to come from here, not SQLite.

function isRepoList(value: unknown): value is Repo[] {
    return (
        Array.isArray(value) &&
        value.every(
            (repo: unknown) =>
                typeof repo === "object" &&
                repo !== null &&
                "id" in repo &&
                "path" in repo &&
                "name" in repo,
        )
    );
}

function browserRepos(): Repo[] {
    // Seeded with the prototype's three repo folders, whose ids the fixture
    // sessions refer to.
    return readStore("repos", () => FIXTURE_REPOS, isRepoList);
}

// ── API ────────────────────────────────────────────────────

export async function listRepos(): Promise<Repo[]> {
    if (fixtureMode) return browserRepos();
    const db = await getDb();
    const rows = await db.select<RepoRow[]>(
        "SELECT * FROM repos WHERE archived = 0 ORDER BY created_at ASC, name ASC",
    );
    return rows.map(rowToRepo);
}

function folderName(path: string): string {
    return path.split(/[\\/]/).filter(Boolean).pop() ?? "unknown";
}

/**
 * Adds a folder as a repo. The folder must be a git repo (SPEC §5.8); the
 * remote, default branch and language come from `repo_inspect`.
 */
export async function addRepo(path: string): Promise<Repo> {
    const inspection: RepoInspection = await call("repo_inspect", { path });
    if (!inspection.isGitRepo) {
        throw new Error(
            inspection.error ?? "This folder is not a git repository.",
        );
    }

    const name = inspection.name || folderName(path);

    if (fixtureMode) {
        const repos = browserRepos();
        if (repos.some((r) => r.path === path)) {
            throw new Error("This folder has already been added");
        }
        const repo: Repo = {
            id: crypto.randomUUID(),
            name,
            path,
            defaultBranch: inspection.defaultBranch,
            remote: inspection.remote,
            language: inspection.language,
            sidebarOpen: true,
        };
        writeStore("repos", [...repos, repo]);
        return repo;
    }

    const db = await getDb();
    const existing = await db.select<{ id: string; archived: number }[]>(
        "SELECT id, archived FROM repos WHERE path = $1 LIMIT 1",
        [path],
    );
    const found = existing[0];
    if (found && found.archived === 0) {
        throw new Error("This folder has already been added");
    }

    const fields = [
        name,
        inspection.defaultBranch,
        inspection.remote?.host ?? null,
        inspection.remote?.owner ?? null,
        inspection.remote?.name ?? null,
        inspection.language ?? null,
    ];

    // `path` is UNIQUE, so a previously removed folder is brought back
    // rather than inserted again. Its old sessions stay archived.
    const id = found?.id ?? crypto.randomUUID();
    if (found) {
        await db.execute(
            `UPDATE repos SET name = $1, default_branch = $2, remote_host = $3,
                remote_owner = $4, remote_name = $5, language = $6,
                sidebar_open = 1, archived = 0
             WHERE id = $7`,
            [...fields, id],
        );
    } else {
        await db.execute(
            `INSERT INTO repos (name, default_branch, remote_host, remote_owner, remote_name, language, id, path)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [...fields, id, path],
        );
    }

    const rows = await db.select<RepoRow[]>(
        "SELECT * FROM repos WHERE id = $1",
        [id],
    );
    return rowToRepo(rows[0]);
}

/**
 * Removes a repo folder from grsp. Its sessions are archived, not deleted
 * (SPEC §5.8). Nothing on disk in the folder itself is touched.
 */
export async function removeRepo(id: string): Promise<void> {
    // Let the core archive each session first so worktrees are cleaned up.
    try {
        const sessions = await call("session_list", {});
        await Promise.allSettled(
            sessions
                .filter((s) => s.repoId === id)
                .map((s) => call("session_archive", { sessionId: s.id })),
        );
    } catch (e) {
        console.warn("[repos] could not archive sessions via the core:", e);
    }

    if (fixtureMode) {
        writeStore(
            "repos",
            browserRepos().filter((r) => r.id !== id),
        );
        return;
    }

    const db = await getDb();
    await db.execute(
        "UPDATE review_sessions SET archived = 1 WHERE repo_id = $1",
        [id],
    );
    await db.execute("UPDATE repos SET archived = 1 WHERE id = $1", [id]);
}

export async function setRepoSidebarOpen(
    id: string,
    open: boolean,
): Promise<void> {
    if (fixtureMode) {
        writeStore(
            "repos",
            browserRepos().map((r) =>
                r.id === id ? { ...r, sidebarOpen: open } : r,
            ),
        );
        return;
    }
    const db = await getDb();
    await db.execute("UPDATE repos SET sidebar_open = $1 WHERE id = $2", [
        open ? 1 : 0,
        id,
    ]);
}
