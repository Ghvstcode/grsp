import type { LinearSyncConfig } from "@core/types/linear";
import type { TaskCategory, EstimatedEffort } from "@core/types/task";
import { fetchIssues } from "@core/services/linear";
import {
    createLinearTask,
    getLinearIssueIds,
    getDeduplicationContext,
    fixOrphanedLinearTasks,
} from "@core/db/tasks";

/**
 * Map Linear labels to SUSTN task categories.
 */
function inferCategory(labels: { name: string }[]): TaskCategory {
    const names = new Set(labels.map((l) => l.name.toLowerCase()));

    if (names.has("bug") || names.has("security")) return "security";
    if (names.has("feature") || names.has("enhancement")) return "feature";
    if (names.has("test") || names.has("testing")) return "tests";
    if (names.has("docs") || names.has("documentation")) return "docs";
    if (names.has("performance") || names.has("perf")) return "performance";
    if (
        names.has("tech-debt") ||
        names.has("tech debt") ||
        names.has("refactor")
    )
        return "tech_debt";
    if (names.has("dx") || names.has("developer experience")) return "dx";
    if (
        names.has("observability") ||
        names.has("logging") ||
        names.has("monitoring")
    )
        return "observability";

    return "general";
}

/**
 * Map Linear priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)
 * to SUSTN estimated effort.
 */
function inferEffort(priority: number): EstimatedEffort {
    if (priority <= 1) return "high";
    if (priority <= 2) return "high";
    if (priority <= 3) return "medium";
    return "low";
}

export interface SyncResult {
    imported: number;
    skipped: number;
    errors: string[];
}

/**
 * Sync issues from Linear into SUSTN tasks for a given repository.
 */
export async function syncLinearIssues(
    apiKey: string,
    syncConfig: LinearSyncConfig,
    repositoryId: string,
    baseBranch?: string,
): Promise<SyncResult> {
    const result: SyncResult = { imported: 0, skipped: 0, errors: [] };

    console.log(
        "[linear-sync] starting sync — team:",
        syncConfig.linearTeamName,
        "repo:",
        repositoryId,
        "baseBranch:",
        baseBranch,
    );

    // Fix any previously imported Linear tasks with mismatched base_branch
    await fixOrphanedLinearTasks(repositoryId, baseBranch);

    // Load existing Linear issue IDs for dedup
    const existingIds = await getLinearIssueIds(repositoryId);
    const { minSortOrder } = await getDeduplicationContext(repositoryId);

    let cursor: string | undefined;
    // Linear tasks go to the TOP of the list (lower sort order = higher priority)
    let sortOrder = minSortOrder - 1;

    // Paginate through all matching issues
    do {
        const page = await fetchIssues(apiKey, syncConfig.linearTeamId, {
            projectId: syncConfig.linearProjectId,
            labelNames: syncConfig.filterLabels,
            cursor,
            limit: 50,
        });

        for (const issue of page.issues) {
            if (existingIds.has(issue.id)) {
                result.skipped++;
                continue;
            }

            try {
                await createLinearTask(
                    repositoryId,
                    {
                        title: `${issue.identifier} ${issue.title}`,
                        description: issue.description,
                        category: inferCategory(issue.labels),
                        estimatedEffort: inferEffort(issue.priority),
                        linearIssueId: issue.id,
                        linearIdentifier: issue.identifier,
                        linearUrl: issue.url,
                    },
                    sortOrder--,
                    baseBranch,
                );
                existingIds.add(issue.id);
                result.imported++;
            } catch (err) {
                result.errors.push(
                    `Failed to import ${issue.identifier}: ${err instanceof Error ? err.message : "Unknown error"}`,
                );
            }
        }

        cursor = page.hasMore ? page.endCursor : undefined;
    } while (cursor);

    console.log(
        "[linear-sync] sync complete — imported:",
        result.imported,
        "skipped:",
        result.skipped,
        "errors:",
        result.errors.length,
    );

    return result;
}
