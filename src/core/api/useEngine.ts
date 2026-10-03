import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
    getAgentConfig,
    updateAgentConfig,
    getBudgetConfig,
    updateBudgetConfig,
    updateLastScanAt,
} from "@core/db/agent-config";
import {
    createScannedTask,
    getDeduplicationContext,
    getTask,
    recoverStaleTasks,
    updateTask as dbUpdateTask,
} from "@core/db/tasks";
import { listRepositories } from "@core/db/repositories";
import { addComment as addLinearComment } from "@core/services/linear";
import { parseOwnerRepo } from "@core/services/github";
import type {
    BudgetConfig,
    BudgetStatus,
    EngineStatus,
    ScanResult,
    ScheduleMode,
    WorkResult,
} from "@core/types/agent";
import { metrics } from "@core/services/metrics";
import {
    sendNotification,
    playSound,
    incrementBadge,
} from "@core/services/notifications";
import { getGlobalSettings } from "@core/db/settings";
import { savedToast, queuedToast, environmentIssueToast } from "@ui/lib/toast";
import { useQueueStore } from "@core/store/queue-store";

// ── Budget ──────────────────────────────────────────────────

export function useBudgetStatus() {
    return useQuery({
        queryKey: ["budget-status"],
        queryFn: () => invoke<BudgetStatus>("engine_get_budget"),
        refetchInterval: 60_000, // Refresh every minute
    });
}

export function useBudgetConfig() {
    return useQuery({
        queryKey: ["budget-config"],
        queryFn: getBudgetConfig,
    });
}

export function useUpdateBudgetConfig() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (fields: Partial<BudgetConfig>) =>
            updateBudgetConfig(fields),
        onSuccess: () => {
            metrics.track("settings_changed", { setting: "budget_config" });
            savedToast();
            void queryClient.invalidateQueries({
                queryKey: ["budget-config"],
            });
            void queryClient.invalidateQueries({
                queryKey: ["budget-status"],
            });
        },
    });
}

// ── Agent Config ────────────────────────────────────────────

export function useAgentConfig(repositoryId: string | undefined) {
    return useQuery({
        queryKey: ["agent-config", repositoryId],
        queryFn: () => getAgentConfig(repositoryId!),
        enabled: !!repositoryId,
    });
}

export function useUpdateAgentConfig() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            repositoryId,
            ...fields
        }: {
            repositoryId: string;
            enabled?: boolean;
            scheduleMode?: ScheduleMode;
            scheduleWindowStart?: string;
            scheduleWindowEnd?: string;
            scanIntervalMinutes?: number;
            priority?: number;
            scanEnabled?: boolean;
        }) => updateAgentConfig(repositoryId, fields),
        onSuccess: (config) => {
            metrics.track("settings_changed", { setting: "agent_config" });
            savedToast();
            void queryClient.invalidateQueries({
                queryKey: ["agent-config", config.repositoryId],
            });
        },
    });
}

// ── Engine Status ───────────────────────────────────────────

export function useEngineStatus() {
    return useQuery({
        queryKey: ["engine-status"],
        queryFn: () => invoke<EngineStatus>("engine_get_status"),
        refetchInterval: 5_000, // Refresh every 5 seconds when visible
    });
}

// ── Scanning ────────────────────────────────────────────────

export function useScanNow() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            repoPath,
            repositoryId,
            baseBranch,
        }: {
            repoPath: string;
            repositoryId: string;
            baseBranch?: string;
        }) => {
            console.log("scanNow", repoPath, repositoryId, baseBranch);
            // 1. Run the scan via Rust
            const result = await invoke<ScanResult>("engine_scan_now", {
                repoPath,
                repositoryId,
            });
            console.log("result", result);

            // 2. Progressively insert discovered tasks into the DB
            if (result.tasksFound.length > 0) {
                const { existingTitles, maxSortOrder } =
                    await getDeduplicationContext(repositoryId);
                let nextOrder = maxSortOrder;

                for (const scanned of result.tasksFound) {
                    const normalized = scanned.title.toLowerCase().trim();
                    if (existingTitles.has(normalized)) continue;

                    await createScannedTask(
                        repositoryId,
                        scanned,
                        ++nextOrder,
                        baseBranch,
                    );
                    existingTitles.add(normalized);

                    // Invalidate after each insertion so the UI updates progressively
                    await queryClient.invalidateQueries({
                        queryKey: ["tasks", repositoryId, baseBranch],
                    });
                }
            }

            return result;
        },
        onSuccess: (_result, variables) => {
            void updateLastScanAt(variables.repositoryId);
            void queryClient.invalidateQueries({
                queryKey: ["agent-config", variables.repositoryId],
            });
        },
    });
}

// ── Deep Scan Event Listener ────────────────────────────────

/**
 * Listens for deep scan (Pass 2) completion events from the Rust backend.
 * When a deep scan finishes, tasks are already persisted in the DB —
 * we just need to invalidate the query cache so the UI refreshes.
 *
 * Engine-aware: if a task is currently active, we also re-invalidate its
 * individual query to ensure the detail view stays consistent after the
 * task list refetch.
 */
export function useDeepScanListener(repositoryId: string | undefined) {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!repositoryId) return;

        const unlisten = listen<{
            repositoryId: string;
            tasksFound: number;
            taskIds: string[];
        }>("agent:scan-deep-completed", (event) => {
            if (event.payload.repositoryId !== repositoryId) return;
            if (event.payload.tasksFound > 0) {
                console.log(
                    `[deep scan] ${event.payload.tasksFound} additional task(s) discovered`,
                );
                void queryClient.invalidateQueries({
                    queryKey: ["tasks", repositoryId],
                });

                // Re-invalidate any running task's individual query so the
                // TaskDetailView stays in sync after the list refetch.
                const status = queryClient.getQueryData<EngineStatus>([
                    "engine-status",
                ]);
                for (const task of status?.runningTasks ?? []) {
                    if (task.repositoryId === repositoryId) {
                        void queryClient.invalidateQueries({
                            queryKey: ["task", task.taskId],
                        });
                    }
                }

                // Notify about new tasks found
                void getGlobalSettings().then((settings) => {
                    if (settings.notificationsEnabled) {
                        void sendNotification(
                            "New tasks discovered",
                            `Deep scan found ${event.payload.tasksFound} additional task(s).`,
                        );
                        void incrementBadge();
                    }
                    if (settings.soundEnabled) {
                        void playSound(settings.soundPreset);
                    }
                });
            }
        });

        return () => {
            void unlisten.then((fn) => fn());
        };
    }, [repositoryId, queryClient]);
}

// ── Task Event Listeners ─────────────────────────────────────

/**
 * Listens for agent task lifecycle events from the Rust backend.
 * Provides real-time UI updates as phases change, and acts as a
 * safety net for DB persistence (in case mutation callbacks fail).
 */
export function useTaskEventListeners(
    taskId: string | undefined,
    repositoryId: string | undefined,
) {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!taskId || !repositoryId) return;

        const unlisteners: Promise<() => void>[] = [];

        unlisteners.push(
            listen<{ taskId: string; repositoryId: string }>(
                "agent:task-started",
                (event) => {
                    if (event.payload.taskId !== taskId) return;
                    console.log("[event] agent:task-started", event.payload);
                    void queryClient.invalidateQueries({
                        queryKey: ["engine-status"],
                    });
                    void queryClient.invalidateQueries({
                        queryKey: ["task", taskId],
                    });
                },
            ),
        );

        unlisteners.push(
            listen<{
                taskId: string;
                repositoryId: string;
                branchName: string | null;
                commitSha: string | null;
            }>("agent:task-completed", (event) => {
                if (event.payload.taskId !== taskId) return;
                console.log("[event] agent:task-completed", event.payload);
                void queryClient.invalidateQueries({
                    queryKey: ["task", taskId],
                });
                void queryClient.invalidateQueries({
                    queryKey: ["tasks", repositoryId],
                });
                void queryClient.invalidateQueries({
                    queryKey: ["engine-status"],
                });
                void queryClient.invalidateQueries({
                    queryKey: ["budget-status"],
                });
            }),
        );

        unlisteners.push(
            listen<{
                taskId: string;
                repositoryId: string;
                error: string | null;
            }>("agent:task-failed", (event) => {
                if (event.payload.taskId !== taskId) return;
                console.log("[event] agent:task-failed", event.payload);
                void queryClient.invalidateQueries({
                    queryKey: ["task", taskId],
                });
                void queryClient.invalidateQueries({
                    queryKey: ["tasks", repositoryId],
                });
                void queryClient.invalidateQueries({
                    queryKey: ["engine-status"],
                });
            }),
        );

        return () => {
            for (const p of unlisteners) {
                void p.then((fn) => fn());
            }
        };
    }, [taskId, repositoryId, queryClient]);
}

// ── Shared Task Result Handling ──────────────────────────────

interface TaskStartParams {
    taskId: string;
    repositoryId: string;
    repoPath: string;
    taskTitle: string;
    taskDescription: string;
    filesInvolved: string[];
    baseBranch: string;
    branchName: string;
    userMessages?: string;
    resumeSessionId?: string;
}

type QueryClient = ReturnType<typeof useQueryClient>;

function invalidateTaskQueries(
    queryClient: QueryClient,
    taskId: string,
    repositoryId: string,
) {
    void queryClient.invalidateQueries({
        queryKey: ["tasks", repositoryId],
    });
    void queryClient.invalidateQueries({
        queryKey: ["task", taskId],
    });
    void queryClient.invalidateQueries({
        queryKey: ["engine-status"],
    });
    void queryClient.invalidateQueries({
        queryKey: ["budget-status"],
    });
}

/** Retry a DB write with a short delay. Prevents tasks getting permanently
 *  stuck as in_progress when a transient SQLITE_BUSY error occurs. */
async function dbUpdateTaskWithRetry(
    taskId: string,
    fields: Parameters<typeof dbUpdateTask>[1],
    retries = 2,
): Promise<void> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            await dbUpdateTask(taskId, fields);
            return;
        } catch (e) {
            console.error(
                `[dbUpdateTaskWithRetry] attempt ${attempt + 1}/${retries + 1} failed:`,
                e,
            );
            if (attempt < retries) {
                await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            }
        }
    }
    console.error(
        `[dbUpdateTaskWithRetry] all ${retries + 1} attempts failed for task ${taskId}`,
    );
}

async function handleTaskResult(
    result: WorkResult,
    variables: TaskStartParams,
    queryClient: QueryClient,
    /** Send system notifications. False for manual starts (user is already watching). */
    notify = true,
) {
    metrics.track("agent_run_completed", {
        taskId: variables.taskId,
        success: result.success,
    });

    try {
        if (result.success) {
            console.log(
                "[handleTaskResult] persisting success — branch:",
                result.branchName,
                "sha:",
                result.commitSha,
            );

            const settings = await getGlobalSettings();
            let prUrl: string | undefined;

            if (
                settings.autoCreatePrs &&
                result.branchName &&
                variables.repoPath
            ) {
                try {
                    const pushResult = await invoke<{
                        success: boolean;
                        error?: string;
                    }>("engine_push_branch", {
                        repoPath: variables.repoPath,
                        branchName: result.branchName,
                    });
                    if (pushResult.success) {
                        const pr = await invoke<{ url: string }>(
                            "engine_create_pr",
                            {
                                repoPath: variables.repoPath,
                                branchName: result.branchName,
                                baseBranch: variables.baseBranch,
                                title: variables.taskTitle,
                                body: `## SUSTN Auto-PR\n\n${variables.taskDescription || variables.taskTitle}\n\nBranch: \`${result.branchName}\``,
                            },
                        );
                        prUrl = pr.url;
                        console.log(
                            "[handleTaskResult] auto-PR created:",
                            prUrl,
                        );
                    }
                } catch (prErr) {
                    console.error("[handleTaskResult] auto-PR failed:", prErr);
                }
            }

            // Link PR back to Linear if this is a Linear-sourced task
            if (prUrl) {
                try {
                    const task = await getTask(variables.taskId);
                    if (task?.linearIssueId && settings.linearApiKey) {
                        await addLinearComment(
                            settings.linearApiKey,
                            task.linearIssueId,
                            `PR created by [SUSTN](https://sustn.app): ${prUrl}`,
                        );
                        console.log(
                            "[handleTaskResult] linked PR to Linear issue:",
                            task.linearIdentifier,
                        );
                    }
                } catch (linearErr) {
                    console.error(
                        "[handleTaskResult] Linear link-back failed:",
                        linearErr,
                    );
                }
            }

            const prMeta = prUrl ? parseOwnerRepo(prUrl) : undefined;

            await dbUpdateTaskWithRetry(variables.taskId, {
                state: "review" as const,
                baseBranch: variables.baseBranch,
                branchName: result.branchName,
                commitSha: result.commitSha,
                sessionId: result.sessionId,
                completedAt: new Date().toISOString(),
                ...(prUrl ? { prUrl } : {}),
                ...(prMeta
                    ? {
                          prState: "opened" as const,
                          prNumber: prMeta.number,
                      }
                    : {}),
            });

            if (notify && settings.notificationsEnabled) {
                markTaskNotified(variables.taskId);
                sendNotification(
                    prUrl ? "PR created" : "Task ready for review",
                    `"${variables.taskTitle}" completed successfully.`,
                );
                void incrementBadge();
            }
            if (notify && settings.soundEnabled) {
                markTaskNotified(variables.taskId);
                void playSound(settings.soundPreset);
            }
        } else {
            console.log(
                "[handleTaskResult] persisting failure — error:",
                result.error,
            );
            await dbUpdateTaskWithRetry(variables.taskId, {
                state: "failed" as const,
                lastError: result.error ?? "Unknown error",
                branchName: result.branchName,
                sessionId: result.sessionId,
            });

            if (notify) {
                const settings = await getGlobalSettings();
                if (settings.notificationsEnabled) {
                    markTaskNotified(variables.taskId);
                    sendNotification(
                        "Task failed",
                        `"${variables.taskTitle}" — ${result.error ?? "Unknown error"}`,
                    );
                    void incrementBadge();
                }
                if (settings.soundEnabled) {
                    markTaskNotified(variables.taskId);
                    void playSound(settings.soundPreset);
                }
            }
        }
    } catch (e) {
        console.error("[handleTaskResult] failed to persist WorkResult:", e);
    }

    invalidateTaskQueries(
        queryClient,
        variables.taskId,
        variables.repositoryId,
    );
}

async function handleTaskError(
    error: unknown,
    variables: TaskStartParams,
    queryClient: QueryClient,
    /** Send system notifications. False for manual starts (user is already watching). */
    notify = true,
) {
    console.error("[handleTaskError] task mutation failed:", error);
    metrics.track("agent_run_completed", {
        taskId: variables.taskId,
        success: false,
    });

    await dbUpdateTaskWithRetry(variables.taskId, {
        state: "failed" as const,
        lastError: error instanceof Error ? error.message : String(error),
    });

    if (notify) {
        try {
            const settings = await getGlobalSettings();
            if (settings.notificationsEnabled) {
                void sendNotification(
                    "Task failed",
                    `"${variables.taskTitle}" encountered an error.`,
                );
                void incrementBadge();
            }
            if (settings.soundEnabled) {
                void playSound(settings.soundPreset);
            }
        } catch {
            // settings read failed — skip notification
        }
    }

    invalidateTaskQueries(
        queryClient,
        variables.taskId,
        variables.repositoryId,
    );
}

// ── Working ─────────────────────────────────────────────────

export function useStartTask() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (params: TaskStartParams) => {
            console.log(
                "[useStartTask] invoking engine_start_task command — taskId:",
                params.taskId,
            );
            metrics.track("agent_run_started", { taskId: params.taskId });

            // Persist in_progress state to DB BEFORE the long-running Rust command.
            // This guarantees any concurrent cache invalidation (e.g., deep scan
            // completing) will always refetch the correct state from the DB.
            await dbUpdateTask(params.taskId, {
                state: "in_progress" as const,
                startedAt: new Date().toISOString(),
            });

            // Immediately propagate to UI so the task shows as in_progress
            void queryClient.invalidateQueries({
                queryKey: ["task", params.taskId],
            });
            void queryClient.invalidateQueries({
                queryKey: ["tasks", params.repositoryId],
            });
            void queryClient.invalidateQueries({
                queryKey: ["engine-status"],
            });

            return invoke<WorkResult>("engine_start_task", { ...params });
        },
        onSuccess: (result, variables) =>
            handleTaskResult(result, variables, queryClient),
        onError: (error, variables) => {
            const msg = error instanceof Error ? error.message : String(error);
            if (
                msg.includes("Concurrency limit reached") ||
                msg.includes("Another task is already in progress")
            ) {
                // Race condition: engine busy but stale status didn't show it.
                // Queue the task instead of failing it.
                useQueueStore.getState().enqueue(variables);
                queuedToast();
                void dbUpdateTask(variables.taskId, {
                    state: "pending" as const,
                });
                invalidateTaskQueries(
                    queryClient,
                    variables.taskId,
                    variables.repositoryId,
                );
                return;
            }
            if (msg.includes("Budget exhausted")) {
                // Budget ran out — keep task pending, don't mark as failed.
                void dbUpdateTask(variables.taskId, {
                    state: "pending" as const,
                });
                invalidateTaskQueries(
                    queryClient,
                    variables.taskId,
                    variables.repositoryId,
                );
                return;
            }
            void handleTaskError(error, variables, queryClient);
        },
    });
}

// ── Queue Processor ─────────────────────────────────────────

/**
 * Global hook that auto-starts queued tasks when the current task finishes.
 * Mount once in AppShell.
 */
export function useQueueProcessor() {
    const queryClient = useQueryClient();

    useEffect(() => {
        async function processNext() {
            // Check concurrency capacity — can we run another task?
            try {
                const engineStatus =
                    await invoke<EngineStatus>("engine_get_status");
                const running = engineStatus.runningTasks?.length ?? 0;
                const limit = engineStatus.concurrencyLimit ?? 1;
                if (running >= limit) {
                    console.log(
                        `[queue] at concurrency limit (${running}/${limit}) — waiting`,
                    );
                    return;
                }
            } catch (e) {
                console.error("[queue] status check failed:", e);
                return;
            }

            // Check budget before dequeuing
            try {
                const status = await invoke<BudgetStatus>("engine_get_budget");
                if (status.budgetExhausted) {
                    console.log("[queue] budget exhausted — pausing queue");
                    return;
                }
            } catch (e) {
                console.error("[queue] budget check failed:", e);
            }

            const next = useQueueStore.getState().dequeue();
            if (!next) return;

            console.log(
                "[queue] starting next task:",
                next.taskId,
                next.taskTitle,
            );

            // Mark task as in_progress in DB
            try {
                await dbUpdateTask(next.taskId, {
                    state: "in_progress" as const,
                    startedAt: new Date().toISOString(),
                });
                void queryClient.invalidateQueries({
                    queryKey: ["task", next.taskId],
                });
                void queryClient.invalidateQueries({
                    queryKey: ["tasks", next.repositoryId],
                });
            } catch (e) {
                console.error("[queue] failed to mark task in_progress:", e);
            }

            // Execute the task
            let requeued = false;
            try {
                metrics.track("agent_run_started", { taskId: next.taskId });
                const result = await invoke<WorkResult>("engine_start_task", {
                    ...next,
                });
                await handleTaskResult(result, next, queryClient);
            } catch (error) {
                const msg =
                    error instanceof Error ? error.message : String(error);
                if (
                    msg.includes("Concurrency limit reached") ||
                    msg.includes("Another task is already in progress")
                ) {
                    // Engine still busy — put task back and wait for completion event
                    useQueueStore.getState().enqueue(next);
                    await dbUpdateTask(next.taskId, {
                        state: "pending" as const,
                    });
                    invalidateTaskQueries(
                        queryClient,
                        next.taskId,
                        next.repositoryId,
                    );
                    requeued = true;
                } else {
                    await handleTaskError(error, next, queryClient);
                }
            } finally {
                if (!requeued) {
                    // Chain: check for more queued tasks
                    void processNext();
                }
            }
        }

        const unlisteners: Promise<() => void>[] = [];

        // Listen for task completion/failure to trigger queue processing
        unlisteners.push(
            listen("agent:task-completed", () => {
                void processNext();
            }),
        );
        unlisteners.push(
            listen("agent:task-failed", () => {
                void processNext();
            }),
        );

        // Also process when a task is enqueued and a slot is available
        const unsub = useQueueStore.subscribe((state, prevState) => {
            if (state.queue.length > prevState.queue.length) {
                void processNext();
            }
        });

        return () => {
            unsub();
            for (const p of unlisteners) {
                void p.then((fn) => fn());
            }
        };
    }, [queryClient]);
}

// ── Global Task Notifications ────────────────────────────────

/**
 * Catch-all notification handler for task completion/failure events.
 * Fires regardless of whether the task was started by the scheduler,
 * queue processor, or manual useStartTask — ensures the user always
 * gets notified even if the primary code path is interrupted.
 *
 * Uses a Set to deduplicate with notifications sent inline by the
 * scheduler or handleTaskResult.
 *
 * Mount once in AppShell.
 */
const notifiedTaskIds = new Set<string>();

export function markTaskNotified(taskId: string): void {
    notifiedTaskIds.add(taskId);
    // Auto-clean after 30s to prevent unbounded growth
    setTimeout(() => notifiedTaskIds.delete(taskId), 30_000);
}

export function useGlobalTaskNotifications() {
    useEffect(() => {
        const unlisteners: Promise<() => void>[] = [];

        unlisteners.push(
            listen<{
                taskId: string;
                repositoryId: string;
                branchName: string | null;
                commitSha: string | null;
            }>("agent:task-completed", (event) => {
                const { taskId } = event.payload;
                if (notifiedTaskIds.has(taskId)) return;
                markTaskNotified(taskId);

                void (async () => {
                    try {
                        const settings = await getGlobalSettings();
                        const task = await getTask(taskId);
                        const title = task?.title ?? "Task";

                        if (settings.notificationsEnabled) {
                            sendNotification(
                                task?.prUrl
                                    ? "PR created"
                                    : "Task ready for review",
                                `"${title}" completed successfully.`,
                            );
                            void incrementBadge();
                        }
                        if (settings.soundEnabled) {
                            void playSound(settings.soundPreset);
                        }
                    } catch (err) {
                        console.error("[global-notify] failed:", err);
                    }
                })();
            }),
        );

        unlisteners.push(
            listen<{
                taskId: string;
                repositoryId: string;
                error: string | null;
            }>("agent:task-failed", (event) => {
                const { taskId, error } = event.payload;
                if (notifiedTaskIds.has(taskId)) return;
                markTaskNotified(taskId);

                void (async () => {
                    try {
                        const settings = await getGlobalSettings();
                        const task = await getTask(taskId);
                        const title = task?.title ?? "Task";

                        if (settings.notificationsEnabled) {
                            sendNotification(
                                "Task failed",
                                `"${title}" — ${error ?? "Unknown error"}`,
                            );
                            void incrementBadge();
                        }
                        if (settings.soundEnabled) {
                            void playSound(settings.soundPreset);
                        }
                    } catch (err) {
                        console.error("[global-notify] failed:", err);
                    }
                })();
            }),
        );

        return () => {
            for (const p of unlisteners) {
                void p.then((fn) => fn());
            }
        };
    }, []);
}

// ── Environment Issue Listener ───────────────────────────────

/**
 * Listens for environment issues detected by the engine (e.g. Xcode license,
 * missing git) and shows a persistent toast with a "Fix" button that opens
 * Terminal with the appropriate command.
 *
 * Mount once in AppShell.
 */
export function useEnvironmentIssueListener() {
    useEffect(() => {
        const unlisten = listen<{
            error: string;
            fixCommand: string | null;
            fixLabel: string | null;
        }>("agent:environment-issue", (event) => {
            const { error, fixCommand, fixLabel } = event.payload;
            environmentIssueToast(
                error,
                fixCommand ?? undefined,
                fixLabel ?? undefined,
            );
        });

        return () => {
            void unlisten.then((fn) => fn());
        };
    }, []);
}

// ── Branch Operations ───────────────────────────────────────

export function usePushBranch() {
    return useMutation({
        mutationFn: ({
            repoPath,
            branchName,
        }: {
            repoPath: string;
            branchName: string;
        }) =>
            invoke<{ success: boolean; error?: string }>("engine_push_branch", {
                repoPath,
                branchName,
            }),
    });
}

export function useCreatePr() {
    return useMutation({
        mutationFn: (params: {
            repoPath: string;
            branchName: string;
            baseBranch: string;
            title: string;
            body: string;
        }) => invoke<{ url: string }>("engine_create_pr", params),
    });
}

// ── Diff ────────────────────────────────────────────────────

export interface DiffFileStat {
    file: string;
    additions: number;
    deletions: number;
}

export function useDiffStat(
    repoPath: string | undefined,
    baseBranch: string | undefined,
    headBranch: string | undefined,
) {
    return useQuery({
        queryKey: ["diff-stat", repoPath, baseBranch, headBranch],
        queryFn: () =>
            invoke<DiffFileStat[]>("engine_get_diff_stat", {
                repoPath,
                baseBranch,
                headBranch,
            }),
        enabled: !!repoPath && !!baseBranch && !!headBranch,
    });
}

export function useDiff(
    repoPath: string | undefined,
    baseBranch: string | undefined,
    headBranch: string | undefined,
) {
    return useQuery({
        queryKey: ["diff", repoPath, baseBranch, headBranch],
        queryFn: () =>
            invoke<string>("engine_get_diff", {
                repoPath,
                baseBranch,
                headBranch,
            }),
        enabled: !!repoPath && !!baseBranch && !!headBranch,
    });
}

// ── Startup Recovery ────────────────────────────────────────

// Module-level flag so it survives AppShell unmount/remount cycles
// (e.g. navigating to /settings and back). Only resets on true app restart.
let startupRecovered = false;

/**
 * Recovers stale in_progress tasks on app startup.
 * Call once from the top-level app shell.
 */
export function useStartupRecovery() {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (startupRecovered) return;
        startupRecovered = true;

        void recoverStaleTasks().then((count) => {
            if (count > 0) {
                console.log(
                    `Recovered ${count} stale task(s) from previous session`,
                );
                // Invalidate all task queries so the UI reflects the reset states
                void queryClient.invalidateQueries({
                    queryKey: ["tasks"],
                });
            }
        });

        // Sync persisted concurrency limit to the Rust engine state
        void getGlobalSettings().then((settings) => {
            if (typeof settings.concurrencyLimit === "number") {
                void invoke("engine_set_concurrency_limit", {
                    limit: settings.concurrencyLimit,
                }).catch((e) => {
                    console.warn(
                        "[startup] failed to sync concurrency limit:",
                        e,
                    );
                });
            }
        });
    }, [queryClient]);
}

// ── Startup Scan ────────────────────────────────────────────

// Module-level flag — same rationale as startupRecovered above.
let startupScanStarted = false;

/**
 * Scans repositories that have never been scanned on app startup.
 * Runs once, staggering scans to avoid overloading the system.
 * Call once from the top-level app shell.
 */
export function useStartupScan() {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (startupScanStarted) return;
        startupScanStarted = true;

        void runStartupScans(queryClient);
    }, [queryClient]);
}

async function runStartupScans(queryClient: ReturnType<typeof useQueryClient>) {
    // Short delay to let the app finish initializing
    await new Promise((resolve) => setTimeout(resolve, 3_000));

    try {
        const repos = await listRepositories();

        for (const repo of repos) {
            const config = await getAgentConfig(repo.id);

            // Skip if scan-on-discovery is disabled for this repo
            if (config.scanEnabled === false) continue;

            // Only auto-scan repos that have NEVER been scanned
            if (config.lastScanAt) continue;

            console.log(
                `[startup-scan] ${repo.name} has never been scanned — triggering`,
            );

            try {
                const result = await invoke<ScanResult>("engine_scan_now", {
                    repoPath: repo.path,
                    repositoryId: repo.id,
                });

                // Persist quick-scan tasks
                const baseBranch = repo.defaultBranch ?? "main";
                if (result.tasksFound.length > 0) {
                    const { existingTitles, maxSortOrder } =
                        await getDeduplicationContext(repo.id);
                    let nextOrder = maxSortOrder;

                    for (const scanned of result.tasksFound) {
                        const normalized = scanned.title.toLowerCase().trim();
                        if (existingTitles.has(normalized)) continue;

                        await createScannedTask(
                            repo.id,
                            scanned,
                            ++nextOrder,
                            baseBranch,
                        );
                        existingTitles.add(normalized);
                    }
                }

                await updateLastScanAt(repo.id);

                void queryClient.invalidateQueries({
                    queryKey: ["tasks", repo.id],
                });
                void queryClient.invalidateQueries({
                    queryKey: ["agent-config", repo.id],
                });

                console.log(
                    `[startup-scan] ${repo.name} — ${result.tasksFound.length} task(s) found`,
                );
            } catch (e) {
                console.error(
                    `[startup-scan] scan failed for ${repo.name}:`,
                    e,
                );
            }
        }
    } catch (e) {
        console.error("[startup-scan] failed:", e);
    }
}
