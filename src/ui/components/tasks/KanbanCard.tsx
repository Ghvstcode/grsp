import { useDraggable } from "@dnd-kit/core";
import {
    Circle,
    CheckCircle2,
    Loader2,
    GitPullRequest,
    XCircle,
    AlertCircle,
    Clock,
} from "lucide-react";
import { Badge } from "@ui/components/ui/badge";
import type { Task } from "@core/types/task";

interface KanbanCardProps {
    task: Task;
    onClick: () => void;
    isQueued?: boolean;
    queuePosition?: number;
}

const categoryLabels: Record<string, string> = {
    tech_debt: "Tech Debt",
    tests: "Tests",
    docs: "Docs",
    security: "Security",
    feature: "Feature",
    performance: "Performance",
    dx: "DX",
    observability: "Observability",
};

const effortColors: Record<string, string> = {
    low: "bg-green-500/15 text-green-600",
    medium: "bg-amber-500/15 text-amber-600",
    high: "bg-red-500/15 text-red-600",
};

function StateIcon({
    state,
    isQueued,
}: {
    state: Task["state"];
    isQueued: boolean;
}) {
    if (isQueued)
        return <Clock className="h-3.5 w-3.5 text-violet-500 shrink-0" />;

    switch (state) {
        case "pending":
            return (
                <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
            );
        case "in_progress":
            return (
                <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />
            );
        case "failed":
            return (
                <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
            );
        case "review":
            return (
                <GitPullRequest className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            );
        case "done":
            return (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
            );
        case "dismissed":
            return (
                <XCircle className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            );
    }
}

export function KanbanCard({
    task,
    onClick,
    isQueued = false,
    queuePosition = -1,
}: KanbanCardProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } =
        useDraggable({
            id: task.id,
            data: { type: "task", task },
        });

    const style = transform
        ? {
              transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
          }
        : undefined;

    const isDone = task.state === "done" || task.state === "dismissed";

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={isDragging ? undefined : onClick}
            className={`group cursor-grab rounded-lg border border-border bg-background p-3 shadow-sm transition-shadow hover:shadow-md hover:border-foreground/20 active:cursor-grabbing ${
                isDragging ? "z-50 opacity-50 shadow-lg" : ""
            } ${isDone ? "opacity-60" : ""}`}
        >
            {/* Top row: icon + title */}
            <div className="flex items-start gap-2">
                <div className="mt-0.5">
                    <StateIcon state={task.state} isQueued={isQueued} />
                </div>
                <span
                    className={`flex-1 text-sm leading-snug line-clamp-2 ${
                        isDone
                            ? "text-muted-foreground line-through"
                            : "text-foreground"
                    }`}
                >
                    {task.title}
                </span>
            </div>

            {/* Description */}
            {task.description && (
                <p className="mt-1.5 text-xs text-muted-foreground/60 line-clamp-2 pl-[22px]">
                    {task.description}
                </p>
            )}

            {/* Bottom row: metadata badges */}
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap pl-[22px]">
                {/* Queue badge */}
                {isQueued && (
                    <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 h-4 bg-violet-500/10 text-violet-600 border-0"
                    >
                        {queuePosition === 0
                            ? "Up Next"
                            : `Queue #${queuePosition + 1}`}
                    </Badge>
                )}

                {/* Category badge */}
                {task.category !== "general" &&
                    categoryLabels[task.category] && (
                        <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 h-4"
                        >
                            {categoryLabels[task.category]}
                        </Badge>
                    )}

                {/* Effort badge */}
                {task.estimatedEffort && (
                    <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 h-4 border-0 ${effortColors[task.estimatedEffort] ?? ""}`}
                    >
                        {task.estimatedEffort}
                    </Badge>
                )}

                {/* Linear badge */}
                {task.source === "linear" && task.linearIdentifier && (
                    <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4 font-mono"
                    >
                        {task.linearIdentifier}
                    </Badge>
                )}

                {/* Diff stats */}
                {(task.linesAdded != null || task.linesRemoved != null) && (
                    <span className="ml-auto text-[10px] font-mono flex gap-1">
                        {task.linesAdded != null && (
                            <span className="text-green-600">
                                +{task.linesAdded}
                            </span>
                        )}
                        {task.linesRemoved != null && (
                            <span className="text-red-500">
                                -{task.linesRemoved}
                            </span>
                        )}
                    </span>
                )}
            </div>
        </div>
    );
}
