import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useEngineStatus } from "@core/api/useEngine";

interface TaskStatusBannerProps {
    taskId: string;
}

const phaseLabels: Record<string, string> = {
    Planning: "Planning implementation",
    Implementing: "Writing code",
    Reviewing: "Reviewing changes",
};

export function TaskStatusBanner({ taskId }: TaskStatusBannerProps) {
    const { data: status } = useEngineStatus();
    const [waitingForScan, setWaitingForScan] = useState(false);

    // Listen for the waiting-for-scan event from the Rust backend.
    // This fires when engine_start_task is blocked waiting for a deep scan
    // to finish before it can start working on the task.
    useEffect(() => {
        const unlisten = listen<{ taskId: string; repositoryId: string }>(
            "agent:task-waiting-for-scan",
            (event) => {
                if (event.payload.taskId === taskId) {
                    setWaitingForScan(true);
                }
            },
        );

        return () => {
            void unlisten.then((fn) => fn());
        };
    }, [taskId]);

    const runningTask = status?.runningTasks?.find((t) => t.taskId === taskId);
    const isWorking = runningTask !== undefined;
    const phase = runningTask?.phase;

    // Clear scan-waiting state once the engine picks up the task
    useEffect(() => {
        if (isWorking && waitingForScan) {
            setWaitingForScan(false);
        }
    }, [isWorking, waitingForScan]);

    if (waitingForScan && !isWorking) {
        return (
            <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                        Waiting for scan to finish
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        A deep scan is still running on this repository. Work
                        will start automatically once it completes.
                    </p>
                </div>
                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            </div>
        );
    }

    if (!isWorking) return null;

    return (
        <div className="flex items-center gap-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                    Agent is working on this task
                </p>
                {phase && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {phaseLabels[phase] ?? phase}
                    </p>
                )}
            </div>
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
        </div>
    );
}
