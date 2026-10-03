import { useDroppable } from "@dnd-kit/core";
import {
    Circle,
    Loader2,
    GitPullRequest,
    AlertCircle,
    CheckCircle2,
    XCircle,
} from "lucide-react";
import type { Task, TaskState } from "@core/types/task";
import { KanbanCard } from "./KanbanCard";

interface KanbanColumnProps {
    state: TaskState;
    tasks: Task[];
    onTaskClick: (taskId: string) => void;
    queuedTaskIds: Map<string, number>;
}

const columnConfig: Record<
    TaskState,
    {
        label: string;
        icon: React.ComponentType<{ className?: string }>;
        iconClass: string;
        accentClass: string;
    }
> = {
    pending: {
        label: "Pending",
        icon: Circle,
        iconClass: "text-muted-foreground/50",
        accentClass: "bg-muted-foreground/10",
    },
    in_progress: {
        label: "In Progress",
        icon: Loader2,
        iconClass: "text-blue-500",
        accentClass: "bg-blue-500/10",
    },
    review: {
        label: "Review",
        icon: GitPullRequest,
        iconClass: "text-amber-500",
        accentClass: "bg-amber-500/10",
    },
    failed: {
        label: "Failed",
        icon: AlertCircle,
        iconClass: "text-red-500",
        accentClass: "bg-red-500/10",
    },
    done: {
        label: "Done",
        icon: CheckCircle2,
        iconClass: "text-green-500",
        accentClass: "bg-green-500/10",
    },
    dismissed: {
        label: "Dismissed",
        icon: XCircle,
        iconClass: "text-muted-foreground/50",
        accentClass: "bg-muted-foreground/10",
    },
};

export function KanbanColumn({
    state,
    tasks,
    onTaskClick,
    queuedTaskIds,
}: KanbanColumnProps) {
    const config = columnConfig[state];
    const Icon = config.icon;

    const { setNodeRef, isOver } = useDroppable({
        id: `column-${state}`,
        data: { type: "column", state },
    });

    return (
        <div className="flex min-w-[260px] max-w-[320px] flex-1 flex-col min-h-0">
            {/* Column header — fixed at top */}
            <div className="mb-3 flex shrink-0 items-center gap-2 px-1">
                <div
                    className={`flex h-5 w-5 items-center justify-center rounded ${config.accentClass}`}
                >
                    <Icon className={`h-3 w-3 ${config.iconClass}`} />
                </div>
                <span className="text-sm font-medium text-foreground">
                    {config.label}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                    {tasks.length}
                </span>
            </div>

            {/* Droppable area — scrolls independently */}
            <div
                ref={setNodeRef}
                className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border-2 border-dashed p-2 transition-colors ${
                    isOver
                        ? "border-foreground/30 bg-accent/50"
                        : "border-transparent bg-muted/30"
                }`}
            >
                {tasks.map((task) => {
                    const queuePos = queuedTaskIds.get(task.id);
                    return (
                        <KanbanCard
                            key={task.id}
                            task={task}
                            onClick={() => onTaskClick(task.id)}
                            isQueued={queuePos !== undefined}
                            queuePosition={queuePos ?? -1}
                        />
                    );
                })}

                {tasks.length === 0 && (
                    <div className="flex flex-1 items-center justify-center py-8 text-xs text-muted-foreground/40">
                        No tasks
                    </div>
                )}
            </div>
        </div>
    );
}
