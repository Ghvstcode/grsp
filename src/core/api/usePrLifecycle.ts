/**
 * PR Lifecycle polling hook + related queries.
 * Mount once in AppShell to enable automatic PR review monitoring.
 */

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { prLifecycleTick } from "@core/services/pr-lifecycle";
import {
    listReviews,
    listComments,
    getTasksWithActivePr,
} from "@core/db/pr-lifecycle";
import { getGlobalSettings } from "@core/db/settings";
import {
    sendNotification,
    playSound,
    incrementBadge,
} from "@core/services/notifications";

const POLL_INTERVAL_MS = 120_000; // 2 minutes
const STARTUP_DELAY_MS = 15_000; // 15 seconds after app start

/**
 * Background poller for PR lifecycle events.
 * Mount once in AppShell.
 */
export function usePrLifecyclePoller() {
    const queryClient = useQueryClient();
    const busyRef = useRef(false);

    useEffect(() => {
        let timer: ReturnType<typeof setInterval>;
        let mounted = true;

        async function tick() {
            if (!mounted || busyRef.current) return;
            busyRef.current = true;

            try {
                await prLifecycleTick();
                // Invalidate relevant queries after each tick
                void queryClient.invalidateQueries({ queryKey: ["tasks"] });
                void queryClient.invalidateQueries({ queryKey: ["task"] });
                void queryClient.invalidateQueries({
                    queryKey: ["task-events"],
                });
                void queryClient.invalidateQueries({
                    queryKey: ["pr-reviews"],
                });
                void queryClient.invalidateQueries({
                    queryKey: ["pr-comments"],
                });
            } catch (e) {
                console.error("[pr-lifecycle] tick error:", e);
            } finally {
                busyRef.current = false;
            }
        }

        const startupTimer = setTimeout(() => {
            if (!mounted) return;
            void tick();
            timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
        }, STARTUP_DELAY_MS);

        return () => {
            mounted = false;
            clearTimeout(startupTimer);
            clearInterval(timer);
        };
    }, [queryClient]);

    // Listen for review-addressed events to refresh immediately
    useEffect(() => {
        const unlisteners: Promise<() => void>[] = [];

        unlisteners.push(
            listen<{ taskId: string; repositoryId: string }>(
                "agent:review-addressed",
                (event) => {
                    console.log(
                        "[pr-lifecycle] review addressed:",
                        event.payload,
                    );
                    void queryClient.invalidateQueries({
                        queryKey: ["task", event.payload.taskId],
                    });
                    void queryClient.invalidateQueries({
                        queryKey: ["tasks", event.payload.repositoryId],
                    });
                    void queryClient.invalidateQueries({
                        queryKey: ["pr-comments", event.payload.taskId],
                    });

                    void getGlobalSettings().then((settings) => {
                        if (settings.notificationsEnabled) {
                            void sendNotification(
                                "Review comments addressed",
                                "Agent pushed changes and re-requested review.",
                            );
                            void incrementBadge();
                        }
                        if (settings.soundEnabled) {
                            void playSound(settings.soundPreset);
                        }
                    });
                },
            ),
        );

        unlisteners.push(
            listen<{
                taskId: string;
                repositoryId: string;
                error: string | null;
            }>("agent:review-address-failed", (event) => {
                console.error("[pr-lifecycle] address failed:", event.payload);
                void queryClient.invalidateQueries({
                    queryKey: ["task", event.payload.taskId],
                });

                void getGlobalSettings().then((settings) => {
                    if (settings.notificationsEnabled) {
                        void sendNotification(
                            "Failed to address review",
                            event.payload.error ?? "Unknown error",
                        );
                        void incrementBadge();
                    }
                });
            }),
        );

        return () => {
            for (const p of unlisteners) {
                void p.then((fn) => fn());
            }
        };
    }, [queryClient]);
}

// ── Queries ─────────────────────────────────────────────────

export function usePrReviews(taskId: string | undefined) {
    return useQuery({
        queryKey: ["pr-reviews", taskId],
        queryFn: () => listReviews(taskId!),
        enabled: !!taskId,
    });
}

export function usePrComments(taskId: string | undefined) {
    return useQuery({
        queryKey: ["pr-comments", taskId],
        queryFn: () => listComments(taskId!),
        enabled: !!taskId,
    });
}

export function useActivePrCount() {
    return useQuery({
        queryKey: ["active-pr-count"],
        queryFn: async () => {
            const prs = await getTasksWithActivePr();
            return prs.length;
        },
        refetchInterval: 60_000,
    });
}
