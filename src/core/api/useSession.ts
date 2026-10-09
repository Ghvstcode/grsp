import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call, onGrspEvent } from "@core/services/client";
import {
    GRSP_EVENTS,
    type ReviewSession,
    type SessionEvent,
} from "@core/types/grsp";

export const sessionKeys = {
    session: (sessionId: string) => ["grsp", "session", sessionId] as const,
    analyses: (sessionId: string) => ["grsp", "analyses", sessionId] as const,
    ask: (sessionId: string) => ["grsp", "ask", sessionId] as const,
    diff: (sessionId: string, headSha: string | undefined) =>
        ["grsp", "diff", sessionId, headSha ?? ""] as const,
    notes: (sessionId: string) => ["grsp", "notes", sessionId] as const,
    /** Shared with the shell's `useGithubStatus` (useAgents.ts). */
    githubStatus: ["github-status"] as const,
};

/** Commands reject with a string (Tauri) or an Error (anything else). */
export function errorMessage(error: unknown): string {
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message;
    return "Something went wrong.";
}

/**
 * One review session, kept live.
 *
 * Opening the session (`session_open`) happens once per mount; later
 * refetches use `session_get` so nothing is re-checked or re-run on focus
 * (SPEC §4.5). `progress` holds the plain-language preparing steps seen so
 * far, newest last.
 */
export function useSession(sessionId: string) {
    const queryClient = useQueryClient();
    const [progress, setProgress] = useState<string[]>([]);

    const query = useQuery({
        queryKey: sessionKeys.session(sessionId),
        queryFn: () => call("session_get", { sessionId }),
        refetchOnWindowFocus: false,
        staleTime: Infinity,
    });

    useEffect(() => {
        let active = true;
        setProgress([]);
        call("session_open", { sessionId })
            .then((session) => {
                if (!active) return;
                queryClient.setQueryData(
                    sessionKeys.session(sessionId),
                    session,
                );
            })
            .catch((error: unknown) => {
                console.error("session_open failed:", errorMessage(error));
            });
        const off = onGrspEvent<SessionEvent>(GRSP_EVENTS.session, (event) => {
            if (event.sessionId !== sessionId) return;
            const line = event.progress;
            if (line) {
                setProgress((lines) =>
                    lines[lines.length - 1] === line ? lines : [...lines, line],
                );
            }
            void queryClient.invalidateQueries({
                queryKey: sessionKeys.session(sessionId),
            });
        });
        return () => {
            active = false;
            off();
        };
    }, [sessionId, queryClient]);

    return { ...query, progress };
}

/** "Refresh analysis" on the stale bar: new worktree, re-run what had run. */
export function useRefreshSession(sessionId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => call("session_refresh", { sessionId }),
        onSuccess: (session: ReviewSession) => {
            queryClient.setQueryData(sessionKeys.session(sessionId), session);
            void queryClient.invalidateQueries({
                queryKey: sessionKeys.analyses(sessionId),
            });
        },
    });
}
