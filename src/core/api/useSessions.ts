import { metrics } from "@core/services/metrics";
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { call, onGrspEvent } from "@core/services/client";
import { useAppStore } from "@core/store/app-store";
import {
    GRSP_EVENTS,
    type NewSessionInput,
    type ReviewSession,
    type SessionEvent,
} from "@core/types/grsp";

/** Every unarchived review session. Refetched when the core reports a change. */
export function useSessions() {
    const queryClient = useQueryClient();

    useEffect(() => {
        return onGrspEvent<SessionEvent>(GRSP_EVENTS.session, () => {
            void queryClient.invalidateQueries({ queryKey: ["sessions"] });
        });
    }, [queryClient]);

    return useQuery({
        queryKey: ["sessions"],
        queryFn: () => call("session_list", {}),
    });
}

/**
 * Starts a review session and selects it. May reject with a JSON-encoded
 * RepoNotAddedError; see `parseRepoNotAdded`.
 */
export function useCreateSession() {
    const queryClient = useQueryClient();
    const setSelectedSession = useAppStore((s) => s.setSelectedSession);

    return useMutation({
        mutationFn: (input: NewSessionInput) =>
            call("session_create", { input }),
        onSuccess: (session, input) => {
            metrics.track("review_session_created", { source: input.kind });
            // Put the session in the list before selecting it; MainContent
            // drops a selection that isn't in the list.
            queryClient.setQueryData<ReviewSession[]>(["sessions"], (list) =>
                list?.some((s) => s.id === session.id)
                    ? list
                    : [session, ...(list ?? [])],
            );
            setSelectedSession(session.id);
            void queryClient.invalidateQueries({ queryKey: ["sessions"] });
        },
    });
}

/** Archives a session: its worktree is removed, its history kept (SPEC §2.4). */
export function useArchiveSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (sessionId: string) =>
            call("session_archive", { sessionId }),
        onSuccess: (_data, sessionId) => {
            const { selectedSessionId, setSelectedSession } =
                useAppStore.getState();
            if (selectedSessionId === sessionId) setSelectedSession(undefined);
            void queryClient.invalidateQueries({ queryKey: ["sessions"] });
        },
    });
}
