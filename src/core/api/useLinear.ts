import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useGlobalSettings } from "@core/api/useSettings";
import type { SyncResult } from "@core/services/linear-sync";
import {
    testConnection,
    fetchTeams,
    fetchProjects,
} from "@core/services/linear";
import { syncLinearIssues } from "@core/services/linear-sync";
import {
    getLinearSyncConfigs,
    getAllLinearSyncConfigs,
    createLinearSyncConfig as dbCreateSyncConfig,
    deleteLinearSyncConfig as dbDeleteSyncConfig,
    updateLastSyncAt,
    updateSyncSchedule as dbUpdateSyncSchedule,
} from "@core/db/linear-sync";
import { listRepositories } from "@core/db/repositories";
import type { LinearSyncConfig, LinearSyncSchedule } from "@core/types/linear";

// ── Linear Connection ─────────────────────────────────────

export function useLinearTeams() {
    const { data: settings } = useGlobalSettings();
    const apiKey = settings?.linearApiKey;

    return useQuery({
        queryKey: ["linear-teams", apiKey],
        queryFn: () => fetchTeams(apiKey!),
        enabled: !!apiKey && apiKey.length > 0 && settings?.linearEnabled,
        staleTime: 5 * 60 * 1000,
    });
}

export function useLinearProjects(teamId: string | undefined) {
    const { data: settings } = useGlobalSettings();
    const apiKey = settings?.linearApiKey;

    return useQuery({
        queryKey: ["linear-projects", teamId],
        queryFn: () => fetchProjects(apiKey!, teamId!),
        enabled:
            !!apiKey &&
            apiKey.length > 0 &&
            !!teamId &&
            settings?.linearEnabled,
        staleTime: 5 * 60 * 1000,
    });
}

export function useTestLinearConnection() {
    return useMutation({
        mutationFn: (apiKey: string) => testConnection(apiKey),
    });
}

// ── Sync Configs ──────────────────────────────────────────

export function useLinearSyncConfigs(repositoryId: string | undefined) {
    return useQuery({
        queryKey: ["linear-sync-configs", repositoryId],
        queryFn: () => getLinearSyncConfigs(repositoryId!),
        enabled: !!repositoryId,
    });
}

export function useCreateLinearSyncConfig() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (syncConfig: {
            repositoryId: string;
            linearTeamId: string;
            linearTeamName: string;
            linearProjectId?: string;
            linearProjectName?: string;
            filterLabels?: string[];
        }) => dbCreateSyncConfig(syncConfig),
        onSuccess: (_data, variables) => {
            void queryClient.invalidateQueries({
                queryKey: ["linear-sync-configs", variables.repositoryId],
            });
        },
    });
}

export function useDeleteLinearSyncConfig() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            id,
            repositoryId: _repositoryId,
        }: {
            id: string;
            repositoryId: string;
        }) => dbDeleteSyncConfig(id),
        onSuccess: (_data, variables) => {
            void queryClient.invalidateQueries({
                queryKey: ["linear-sync-configs", variables.repositoryId],
            });
        },
    });
}

export function useUpdateSyncSchedule() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            id,
            schedule,
            repositoryId: _repositoryId,
        }: {
            id: string;
            schedule: LinearSyncSchedule;
            repositoryId: string;
        }) => dbUpdateSyncSchedule(id, schedule),
        onSuccess: (_data, variables) => {
            void queryClient.invalidateQueries({
                queryKey: ["linear-sync-configs", variables.repositoryId],
            });
        },
    });
}

// ── Sync Operation ────────────────────────────────────────

export function useSyncLinear() {
    const queryClient = useQueryClient();
    const { data: settings } = useGlobalSettings();

    return useMutation({
        mutationFn: async ({
            syncConfig,
            repositoryId,
            baseBranch,
        }: {
            syncConfig: LinearSyncConfig;
            repositoryId: string;
            baseBranch?: string;
        }) => {
            const apiKey = settings?.linearApiKey;
            if (!apiKey) throw new Error("Linear API key not configured");

            const result = await syncLinearIssues(
                apiKey,
                syncConfig,
                repositoryId,
                baseBranch,
            );

            await updateLastSyncAt(syncConfig.id);

            return result;
        },
        onSuccess: (data: SyncResult, variables) => {
            // Force refetch of all task queries for this repo
            void queryClient.invalidateQueries({
                queryKey: ["tasks", variables.repositoryId],
            });
            void queryClient.invalidateQueries({
                queryKey: ["linear-sync-configs", variables.repositoryId],
            });

            // Show feedback
            if (data.imported > 0) {
                toast.success(
                    `Imported ${data.imported} issue${data.imported > 1 ? "s" : ""} from Linear`,
                );
            } else if (data.skipped > 0) {
                toast.info("All issues already imported — nothing new to sync");
            } else {
                toast.info("No matching issues found in Linear");
            }
            if (data.errors.length > 0) {
                toast.error(
                    `${data.errors.length} issue${data.errors.length > 1 ? "s" : ""} failed to import`,
                );
                console.error("[useSyncLinear] sync errors:", data.errors);
            }
        },
        onError: (error) => {
            toast.error(
                `Linear sync failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        },
    });
}

// ── Auto-Sync ─────────────────────────────────────────────

const SCHEDULE_INTERVALS: Record<string, number> = {
    "6h": 6 * 60 * 60 * 1000,
    "12h": 12 * 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
};

let startupSyncDone = false;

/**
 * Runs scheduled Linear syncs. Mount once in AppShell.
 *
 * - "on_start" configs sync once when the app starts.
 * - Interval configs ("6h", "12h", "daily") sync when enough
 *   time has elapsed since lastSyncAt.
 *
 * Checks every 5 minutes.
 */
export function useLinearAutoSync() {
    const { data: settings } = useGlobalSettings();
    const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
        undefined,
    );

    useEffect(() => {
        if (!settings?.linearEnabled || !settings?.linearApiKey) return;
        const apiKey = settings.linearApiKey;

        async function runScheduledSyncs() {
            const configs = await getAllLinearSyncConfigs();
            const repos = await listRepositories();

            for (const sc of configs) {
                const repo = repos.find((r) => r.id === sc.repositoryId);
                if (!repo) continue;

                let shouldSync = false;

                if (sc.syncSchedule === "on_start" && !startupSyncDone) {
                    shouldSync = true;
                }

                const interval = SCHEDULE_INTERVALS[sc.syncSchedule];
                if (interval) {
                    const lastSync = sc.lastSyncAt
                        ? new Date(sc.lastSyncAt).getTime()
                        : 0;
                    shouldSync = Date.now() - lastSync >= interval;
                }

                if (shouldSync) {
                    try {
                        console.log(
                            `[linear-auto-sync] syncing ${sc.linearTeamName} → ${repo.name}`,
                        );
                        const { syncLinearIssues } =
                            await import("@core/services/linear-sync");
                        const result = await syncLinearIssues(
                            apiKey,
                            sc,
                            sc.repositoryId,
                            repo.defaultBranch,
                        );
                        await updateLastSyncAt(sc.id);
                        if (result.imported > 0) {
                            toast.success(
                                `Auto-synced ${result.imported} issue${result.imported > 1 ? "s" : ""} from Linear → ${repo.name}`,
                            );
                        }
                    } catch (err) {
                        console.error(
                            "[linear-auto-sync] failed:",
                            sc.linearTeamName,
                            err,
                        );
                    }
                }
            }

            startupSyncDone = true;
        }

        // Run once on mount (handles "on_start" + any overdue intervals)
        const timeout = setTimeout(() => void runScheduledSyncs(), 5000);

        // Check every 5 minutes for interval-based schedules
        intervalRef.current = setInterval(
            () => void runScheduledSyncs(),
            5 * 60 * 1000,
        );

        return () => {
            clearTimeout(timeout);
            clearInterval(intervalRef.current);
        };
    }, [settings?.linearEnabled, settings?.linearApiKey]);
}

// ── Augmentation ──────────────────────────────────────────

interface AugmentTaskInput {
    title: string;
    description: string | undefined;
}

interface AugmentTaskResult {
    filesInvolved: string[];
    estimatedEffort: string;
    enrichedDescription: string;
    category: string;
}

export function useAugmentTasks() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            repoPath,
            repositoryId,
            tasks,
        }: {
            repoPath: string;
            repositoryId: string;
            tasks: AugmentTaskInput[];
        }) => {
            const results = await invoke<AugmentTaskResult[]>(
                "engine_augment_tasks",
                { repoPath, tasks },
            );
            return { results, repositoryId };
        },
        onSuccess: (data) => {
            void queryClient.invalidateQueries({
                queryKey: ["tasks", data.repositoryId],
            });
        },
    });
}
