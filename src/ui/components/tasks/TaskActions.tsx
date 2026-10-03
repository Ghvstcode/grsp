import { Button } from "@ui/components/ui/button";
import {
    Play,
    GitPullRequest,
    CheckCircle2,
    XCircle,
    RotateCcw,
    MessageSquarePlus,
    ExternalLink,
    AlertTriangle,
    Loader2,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Task, TaskState } from "@core/types/task";

interface TaskActionsProps {
    task: Task;
    isStarting?: boolean;
    isPushing?: boolean;
    onUpdateState: (state: TaskState) => void;
    onStartWork?: () => void;
    onCreatePr?: () => void;
    onRequestChanges?: () => void;
}

const btnClass =
    "group h-7 gap-1.5 text-xs transition-all duration-200 hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none";

export function TaskActions({
    task,
    isStarting,
    isPushing,
    onUpdateState,
    onStartWork,
    onCreatePr,
    onRequestChanges,
}: TaskActionsProps) {
    const { state } = task;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* Pending: Start Work */}
            {state === "pending" && onStartWork && (
                <Button
                    size="sm"
                    className={btnClass}
                    onClick={onStartWork}
                    disabled={isStarting}
                >
                    {isStarting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Play className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110" />
                    )}
                    Start Work
                </Button>
            )}

            {/* Review: Create PR, Request Changes, Approve */}
            {state === "review" && (
                <>
                    {onCreatePr && !task.prUrl && (
                        <Button
                            size="sm"
                            className={btnClass}
                            onClick={onCreatePr}
                            disabled={isPushing}
                        >
                            {isPushing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <GitPullRequest className="h-3.5 w-3.5" />
                            )}
                            Create PR
                        </Button>
                    )}

                    {task.prUrl && (
                        <Button
                            size="sm"
                            variant="outline"
                            className={btnClass}
                            onClick={() => void openUrl(task.prUrl!)}
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                            View PR
                        </Button>
                    )}

                    {onRequestChanges && (
                        <Button
                            size="sm"
                            variant="outline"
                            className={btnClass}
                            onClick={onRequestChanges}
                        >
                            <MessageSquarePlus className="h-3.5 w-3.5" />
                            Request Changes
                        </Button>
                    )}

                    <Button
                        size="sm"
                        variant="outline"
                        className={btnClass}
                        onClick={() => onUpdateState("done")}
                    >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve & Done
                    </Button>
                </>
            )}

            {/* Done: Reopen + View PR */}
            {state === "done" && (
                <>
                    {task.prUrl && (
                        <Button
                            size="sm"
                            variant="outline"
                            className={btnClass}
                            onClick={() => void openUrl(task.prUrl!)}
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                            View PR
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground"
                        onClick={() => onUpdateState("pending")}
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reopen
                    </Button>
                </>
            )}

            {/* Failed: Retry + error info */}
            {state === "failed" && (
                <>
                    <Button
                        size="sm"
                        className={btnClass}
                        onClick={() => onUpdateState("pending")}
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Retry
                    </Button>
                    {task.lastError && (
                        <div className="flex items-center gap-1.5 text-xs text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate max-w-[300px]">
                                {task.lastError}
                            </span>
                        </div>
                    )}
                </>
            )}

            {/* Dismiss (available for non-terminal states) */}
            {state !== "done" &&
                state !== "dismissed" &&
                state !== "failed" &&
                state !== "in_progress" && (
                    <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground"
                        onClick={() => onUpdateState("dismissed")}
                    >
                        <XCircle className="h-3.5 w-3.5" />
                        Dismiss
                    </Button>
                )}
        </div>
    );
}
