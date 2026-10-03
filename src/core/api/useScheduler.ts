import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { getGlobalSettings } from "@core/db/settings";
import {
    getAgentConfig,
    updateLastScanAt,
    updateLastWorkAt,
} from "@core/db/agent-config";
import { listRepositories } from "@core/db/repositories";
import {
    getNextPendingTask,
    updateTask as dbUpdateTask,
    createScannedTask,
    getDeduplicationContext,
} from "@core/db/tasks";
import { shouldWorkNow, isScanDue } from "@core/services/scheduler";
import { generateBranchName, effectiveBaseBranch } from "@core/utils/branch";
import { getProjectOverrides } from "@core/db/settings";
import { parseOwnerRepo } from "@core/services/github";
import {
    sendNotification,
    playSound,
    incrementBadge,
} from "@core/services/notifications";
import { markTaskNotified } from "@core/api/useEngine";
import type {
    BudgetStatus,
    EngineStatus,
    ScanResult,
    WorkResult,
} from "@core/types/agent";

const TICK_INTERVAL_MS = 30_000; // 30 seconds
const STARTUP_DELAY_MS = 10_000; // 10 second delay before first tick

/**
 * Background scheduler that automatically triggers scans and task execution
 * based on the user's scheduling settings (agent mode, active days, work window,
 * scan frequency).
 *
 * Call once from the top-level app shell (AppShell).
 */
export function useScheduler() {
    const queryClient = useQueryClient();
    const busyRef = useRef(false);

    useEffect(() => {
        let timer: ReturnType<typeof setInterval>;
        let mounted = true;

        async function tick() {
            if (!mounted) return;
            if (busyRef.current) return;
            busyRef.current = true;

            try {
                await runSchedulerTick(queryClient);
            } catch (e) {
                console.error("[scheduler] tick error:", e);
            } finally {
                busyRef.current = false;
            }
        }

        // Delay first tick to let app finish loading
        const startupTimer = setTimeout(() => {
            if (!mounted) return;
            void tick();
            timer = setInterval(() => void tick(), TICK_INTERVAL_MS);
        }, STARTUP_DELAY_MS);

        return () => {
            mounted = false;
            clearTimeout(startupTimer);
            clearInterval(timer);
        };
    }, [queryClient]);
}

async function runSchedulerTick(
    queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
    // 1. Read global settings
    const settings = await getGlobalSettings();

    // 2. Check if work is allowed right now
    const workAllowed = shouldWorkNow(settings);

    // 3. Check if engine is at concurrency capacity
    const status = await invoke<EngineStatus>("engine_get_status");
    const running = status.runningTasks?.length ?? 0;
    const limit = status.concurrencyLimit ?? 1;
    if (running >= limit) {
        console.log(
            `[scheduler] at concurrency limit (${running}/${limit}) — skipping tick`,
        );
        return;
    }

    // 4. Check budget
    const budget = await invoke<BudgetStatus>("engine_get_budget");
    if (budget.budgetExhausted) {
        console.log("[scheduler] budget exhausted — skipping tick");
        return;
    }

    // 5. Get all repositories
    const repos = await listRepositories();
    if (repos.length === 0) return;

    // 6. For each repo, check scans and tasks
    for (const repo of repos) {
        const agentConfig = await getAgentConfig(repo.id);
        if (!agentConfig.enabled) continue;

        // ── Auto-scan ──────────────────────────────────────
        if (
            agentConfig.scanEnabled !== false &&
            isScanDue(agentConfig.lastScanAt, settings.scanFrequency)
        ) {
            console.log(`[scheduler] scan due for ${repo.name} — triggering`);

            try {
                const result = await invoke<ScanResult>("engine_scan_now", {
                    repoPath: repo.path,
                    repositoryId: repo.id,
                });

                // Persist quick-scan tasks to DB (same as useScanNow)
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

                // Invalidate queries so UI reflects new tasks
                void queryClient.invalidateQueries({
                    queryKey: ["tasks", repo.id],
                });
                void queryClient.invalidateQueries({
                    queryKey: ["agent-config", repo.id],
                });

                if (result.tasksFound.length > 0) {
                    // Notify
                    if (settings.notificationsEnabled) {
                        void sendNotification(
                            "Scan completed",
                            `Found ${result.tasksFound.length} task(s) in ${repo.name}.`,
                        );
                        void incrementBadge();
                    }
                    if (settings.soundEnabled) {
                        void playSound(settings.soundPreset);
                    }
                }

                console.log(
                    `[scheduler] scan completed for ${repo.name} — ${result.tasksFound.length} tasks found`,
                );
            } catch (e) {
                console.error(`[scheduler] scan failed for ${repo.name}:`, e);
            }

            // One action per tick to be conservative with resources
            return;
        }

        // ── Auto-execute task ──────────────────────────────
        if (!workAllowed) continue;

        const nextTask = await getNextPendingTask(repo.id);
        if (!nextTask) continue;

        console.log(
            `[scheduler] starting task "${nextTask.title}" in ${repo.name}`,
        );

        try {
            const overrides = await getProjectOverrides(repo.id);
            const branchName = generateBranchName(
                nextTask.title,
                nextTask.id,
                settings,
                overrides,
                nextTask,
            );
            const baseBranch = effectiveBaseBranch(
                nextTask.baseBranch,
                settings,
                overrides,
                repo.defaultBranch,
            );

            // Mark task as in_progress
            await dbUpdateTask(nextTask.id, {
                state: "in_progress",
                startedAt: new Date().toISOString(),
            });
            void queryClient.invalidateQueries({
                queryKey: ["tasks", repo.id],
            });

            const result = await invoke<WorkResult>("engine_start_task", {
                taskId: nextTask.id,
                repositoryId: repo.id,
                repoPath: repo.path,
                taskTitle: nextTask.title,
                taskDescription: nextTask.description ?? "",
                filesInvolved: nextTask.filesInvolved ?? [],
                baseBranch,
                branchName,
            });

            await updateLastWorkAt(repo.id);

            // Handle result — same logic as useStartTask onSuccess
            if (result.success) {
                let prUrl: string | undefined;

                if (settings.autoCreatePrs && result.branchName) {
                    try {
                        const pushResult = await invoke<{
                            success: boolean;
                            error?: string;
                        }>("engine_push_branch", {
                            repoPath: repo.path,
                            branchName: result.branchName,
                        });
                        if (pushResult.success) {
                            const pr = await invoke<{ url: string }>(
                                "engine_create_pr",
                                {
                                    repoPath: repo.path,
                                    branchName: result.branchName,
                                    baseBranch,
                                    title: nextTask.title,
                                    body: `## SUSTN Auto-PR\n\n${nextTask.description || nextTask.title}\n\nBranch: \`${result.branchName}\``,
                                },
                            );
                            prUrl = pr.url;
                            console.log("[scheduler] auto-PR created:", prUrl);
                        }
                    } catch (prErr) {
                        console.error("[scheduler] auto-PR failed:", prErr);
                    }
                }

                const prMeta = prUrl ? parseOwnerRepo(prUrl) : undefined;

                await dbUpdateTask(nextTask.id, {
                    state: "review",
                    baseBranch,
                    branchName: result.branchName,
                    commitSha: result.commitSha,
                    completedAt: new Date().toISOString(),
                    ...(prUrl ? { prUrl } : {}),
                    ...(prMeta
                        ? {
                              prState: "opened" as const,
                              prNumber: prMeta.number,
                          }
                        : {}),
                });

                if (settings.notificationsEnabled) {
                    markTaskNotified(nextTask.id);
                    sendNotification(
                        prUrl ? "PR created" : "Task ready for review",
                        `"${nextTask.title}" completed successfully.`,
                    );
                    void incrementBadge();
                }
                if (settings.soundEnabled) {
                    markTaskNotified(nextTask.id);
                    void playSound(settings.soundPreset);
                }
            } else {
                await dbUpdateTask(nextTask.id, {
                    state: "failed",
                    lastError: result.error ?? "Unknown error",
                    branchName: result.branchName,
                });

                if (settings.notificationsEnabled) {
                    markTaskNotified(nextTask.id);
                    sendNotification(
                        "Task failed",
                        `"${nextTask.title}" — ${result.error ?? "Unknown error"}`,
                    );
                    void incrementBadge();
                }
                if (settings.soundEnabled) {
                    markTaskNotified(nextTask.id);
                    void playSound(settings.soundPreset);
                }
            }

            // Invalidate all relevant queries
            void queryClient.invalidateQueries({
                queryKey: ["tasks", repo.id],
            });
            void queryClient.invalidateQueries({
                queryKey: ["task", nextTask.id],
            });
            void queryClient.invalidateQueries({ queryKey: ["engine-status"] });
            void queryClient.invalidateQueries({ queryKey: ["budget-status"] });

            console.log(
                `[scheduler] task "${nextTask.title}" finished — success=${result.success}`,
            );
        } catch (e) {
            console.error(`[scheduler] task execution failed:`, e);

            await dbUpdateTask(nextTask.id, {
                state: "failed",
                lastError: e instanceof Error ? e.message : String(e),
            });

            void queryClient.invalidateQueries({
                queryKey: ["tasks", repo.id],
            });
            void queryClient.invalidateQueries({
                queryKey: ["task", nextTask.id],
            });
            void queryClient.invalidateQueries({ queryKey: ["engine-status"] });
        }

        // One action per tick
        return;
    }
}
