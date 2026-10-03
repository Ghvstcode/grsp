import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call, onGrspEvent } from "@core/services/client";
import { GRSP_EVENTS, type AskEvent, type AskMessage } from "@core/types/grsp";
import { sessionKeys } from "@core/api/useSession";

/** Apply a progress event to the cached history; undefined = refetch. */
export function applyAskEvent(
    messages: AskMessage[] | undefined,
    event: AskEvent,
): AskMessage[] | undefined {
    if (!messages || event.status !== "running") return undefined;
    if (!messages.some((m) => m.id === event.messageId)) return undefined;
    return messages.map((m) =>
        m.id === event.messageId
            ? { ...m, status: "running", progress: event.progress }
            : m,
    );
}

/**
 * Ask history for a session (newest first) plus send / cancel. `ask_send`
 * returns the running message straight away; the answer arrives through
 * `grsp://ask`.
 */
export function useAsk(sessionId: string) {
    const queryClient = useQueryClient();
    const key = sessionKeys.ask(sessionId);

    const query = useQuery({
        queryKey: key,
        queryFn: () => call("ask_list", { sessionId }),
        refetchOnWindowFocus: false,
        staleTime: Infinity,
    });

    useEffect(() => {
        const askKey = sessionKeys.ask(sessionId);
        return onGrspEvent<AskEvent>(GRSP_EVENTS.ask, (event) => {
            if (event.sessionId !== sessionId) return;
            const patched = applyAskEvent(
                queryClient.getQueryData<AskMessage[]>(askKey),
                event,
            );
            if (patched) {
                queryClient.setQueryData(askKey, patched);
            } else {
                void queryClient.invalidateQueries({ queryKey: askKey });
            }
        });
    }, [sessionId, queryClient]);

    const send = useMutation({
        mutationFn: (question: string) =>
            call("ask_send", { sessionId, question }),
        onSuccess: (message) => {
            queryClient.setQueryData<AskMessage[]>(key, (messages = []) =>
                messages.some((m) => m.id === message.id)
                    ? messages
                    : [message, ...messages],
            );
        },
    });

    const cancel = useMutation({
        mutationFn: (messageId: string) => call("ask_cancel", { messageId }),
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: key });
        },
    });

    return { ...query, messages: query.data ?? [], send, cancel };
}
