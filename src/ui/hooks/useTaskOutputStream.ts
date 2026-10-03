import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { TaskOutputEvent } from "@core/types/agent";
import { listAgentEvents, saveAgentEvent } from "@core/db/task-agent-events";

const MAX_LINES = 500;

export function useTaskOutputStream(taskId: string | undefined) {
    const [lines, setLines] = useState<TaskOutputEvent[]>([]);
    const [loaded, setLoaded] = useState(false);

    // Load historical events from the DB
    useEffect(() => {
        if (!taskId) return;
        setLines([]);
        setLoaded(false);
        let cancelled = false;

        void listAgentEvents(taskId).then((historical) => {
            if (cancelled) return;
            setLines(historical);
            setLoaded(true);
        });

        return () => {
            cancelled = true;
        };
    }, [taskId]);

    // Listen for live events
    useEffect(() => {
        if (!taskId) return;

        const unlisten = listen<TaskOutputEvent>(
            "agent:task-output",
            (event) => {
                if (event.payload.taskId !== taskId) return;

                setLines((prev) => {
                    const next = [...prev, event.payload];
                    return next.length > MAX_LINES
                        ? next.slice(-MAX_LINES)
                        : next;
                });

                // Persist asynchronously
                void saveAgentEvent(event.payload).catch((e) => {
                    console.warn(
                        "[useTaskOutputStream] failed to persist event:",
                        e,
                    );
                });
            },
        );

        return () => {
            void unlisten.then((fn) => fn());
        };
    }, [taskId]);

    // Streaming if the last event isn't a "result" (completion) event
    const isStreaming =
        loaded &&
        lines.length > 0 &&
        lines[lines.length - 1]?.eventType !== "result";

    return { lines, isStreaming };
}
