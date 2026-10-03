/**
 * PR Import Service
 *
 * Orchestrates importing an external PR into SUSTN:
 *   parse URL → match/clone repo → fetch metadata → create task → trigger lifecycle
 */

import { invoke } from "@tauri-apps/api/core";
import { parseOwnerRepo, getPrMetadata } from "@core/services/github";
import { listRepositories, addRepository } from "@core/db/repositories";
import { createImportedTask, listTasks } from "@core/db/tasks";
import {
    getAgentConfig,
    updateAgentConfig,
    updateLastScanAt,
} from "@core/db/agent-config";
import type { Task } from "@core/types/task";

export type ImportProgress = (step: string) => void;
export type ImportCallbacks = {
    onProgress?: ImportProgress;
    onRepoReady?: (repositoryId: string) => void;
};

/**
 * Import a GitHub PR into SUSTN.
 * Returns the created task, ready for the PR lifecycle poller to pick up.
 */
export async function importPr(
    prUrl: string,
    callbacks?: ImportCallbacks,
): Promise<Task> {
    const progress = callbacks?.onProgress ?? (() => {});

    // 1. Parse the PR URL
    const parsed = parseOwnerRepo(prUrl);
    if (!parsed) {
        throw new Error(
            "Invalid PR URL. Expected: https://github.com/owner/repo/pull/123",
        );
    }
    const { owner, repo, number: prNumber } = parsed;
    console.log(`[pr-import] importing ${owner}/${repo}#${prNumber}`);

    // 2. Find or clone the repository
    progress(`Looking for ${owner}/${repo}...`);
    const repoPath = await resolveRepository(owner, repo, progress);
    const repos = await listRepositories();
    const repository = repos.find((r) => r.path === repoPath);
    if (!repository) {
        throw new Error(`Repository not found after resolution: ${repoPath}`);
    }

    // Signal that the repo is ready (so sidebar can refresh immediately)
    callbacks?.onRepoReady?.(repository.id);

    // 3. Fetch PR metadata from GitHub
    progress(`Fetching PR #${prNumber} details...`);
    const metadata = await getPrMetadata(repoPath, owner, repo, prNumber);
    if (metadata.merged) {
        throw new Error("This PR has already been merged.");
    }
    if (metadata.state === "closed") {
        throw new Error("This PR is closed.");
    }

    console.log(
        `[pr-import] PR #${prNumber}: "${metadata.title}" (${metadata.headBranch} → ${metadata.baseBranch})`,
    );

    // 4. Fetch the PR branch locally
    progress(`Fetching branch ${metadata.headBranch}...`);
    await invoke("engine_fetch_branch", {
        repoPath,
        branchName: metadata.headBranch,
        prNumber,
    });

    // 5. Create the task
    progress("Creating task...");
    const existingTasks = await listTasks(repository.id);
    const maxSortOrder =
        existingTasks.length > 0
            ? Math.max(...existingTasks.map((t) => t.sortOrder))
            : 0;

    const task = await createImportedTask(
        repository.id,
        {
            title: `[PR #${prNumber}] ${metadata.title}`,
            description: metadata.body || undefined,
            baseBranch: metadata.baseBranch,
            branchName: metadata.headBranch,
            prUrl,
            prNumber,
        },
        maxSortOrder + 1,
    );
    console.log(`[pr-import] task created: ${task.id}`);

    // Imported repos shouldn't auto-scan for tasks — the user came here to
    // manage an existing PR, not to start a scan-driven backlog. Disable
    // scanning permanently for this repo; user can re-enable in project settings.
    try {
        await getAgentConfig(repository.id);
        await updateAgentConfig(repository.id, { scanEnabled: false });
        await updateLastScanAt(repository.id);
    } catch {
        // Non-critical
    }

    // Trigger PR lifecycle immediately (don't wait for 2-min poll)
    try {
        const { processTaskPr } = await import("@core/services/pr-lifecycle");
        const { getGlobalSettings, getProjectOverrides } =
            await import("@core/db/settings");
        const settings = await getGlobalSettings();
        const overrides = await getProjectOverrides(repository.id);
        const autoReply =
            overrides.overridePrAutoReply ?? settings.prLifecycleEnabled;

        // Re-fetch the task so it has all fields populated
        const { getTask } = await import("@core/db/tasks");
        const freshTask = await getTask(task.id);
        if (freshTask) {
            void processTaskPr(
                freshTask,
                repoPath,
                settings.maxReviewCycles ?? 5,
                autoReply,
            );
        }
    } catch (e) {
        console.warn(`[pr-import] failed to trigger immediate lifecycle:`, e);
    }

    return task;
}

/**
 * Find a local repository matching the GitHub owner/repo,
 * or clone it if not found.
 */
async function resolveRepository(
    owner: string,
    repo: string,
    progress: ImportProgress,
): Promise<string> {
    const repos = await listRepositories();
    const githubSuffix = `${owner}/${repo}`;

    // Check each repo's remote URL for a match
    for (const r of repos) {
        try {
            const remoteUrl = await invoke<string>("engine_get_remote_url", {
                repoPath: r.path,
            });
            if (
                remoteUrl.includes(githubSuffix) ||
                remoteUrl.includes(`${githubSuffix}.git`)
            ) {
                console.log(
                    `[pr-import] matched existing repo: ${r.name} (${r.path})`,
                );
                return r.path;
            }
        } catch {
            // Skip repos where remote URL can't be read
        }
    }

    // No match — clone the repo
    progress(`Cloning ${owner}/${repo} — this may take a minute...`);
    console.log(`[pr-import] no matching repo, cloning ${owner}/${repo}`);
    const cloneUrl = `https://github.com/${owner}/${repo}.git`;

    const defaultDir = await invoke<string>("get_default_clone_dir");
    const destination = `${defaultDir}/${repo}`;

    // Check if destination already exists (from a previous clone attempt)
    let clonedPath: string;
    try {
        const validateResult = await invoke<{
            valid: boolean;
            error: string | null;
        }>("validate_git_repo", { path: destination });
        if (validateResult.valid) {
            console.log(`[pr-import] reusing existing clone at ${destination}`);
            clonedPath = destination;
        } else {
            throw new Error("not a git repo");
        }
    } catch {
        // Destination doesn't exist or isn't a git repo — clone it
        const result = await invoke<{
            success: boolean;
            output: string;
            error: string | null;
        }>("engine_clone_repo", {
            url: cloneUrl,
            destination,
        });

        if (!result.success) {
            throw new Error(
                `Failed to clone ${owner}/${repo}: ${result.error ?? "unknown error"}`,
            );
        }
        clonedPath = destination;
    }

    // Add to SUSTN (may already exist from a previous attempt)
    try {
        await addRepository(clonedPath, repo);
        console.log(`[pr-import] cloned and added: ${clonedPath}`);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("already been added")) {
            throw e;
        }
    }

    return clonedPath;
}
