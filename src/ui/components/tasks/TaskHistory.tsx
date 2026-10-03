import { useTaskEvents } from "@core/api/useTasks";
import type { TaskEvent } from "@core/types/task";
import {
    ArrowRight,
    MessageSquare,
    Pencil,
    Plus,
    FileText,
    Tag,
    Link,
    GitPullRequest,
} from "lucide-react";

interface TaskHistoryProps {
    taskId: string;
}

function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHr = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

const stateLabels: Record<string, string> = {
    pending: "Pending",
    in_progress: "In Progress",
    review: "Awaiting Review",
    done: "Done",
    dismissed: "Dismissed",
};

const prStateLabels: Record<string, string> = {
    opened: "PR Opened",
    in_review: "In Review",
    changes_requested: "Changes Requested",
    addressing: "Addressing Feedback",
    re_review_requested: "Re-review Requested",
    approved: "Approved",
    merged: "Merged",
    needs_human_attention: "Needs Attention",
};

function EventIcon({ eventType }: { eventType: string }) {
    const cls = "h-3.5 w-3.5";
    switch (eventType) {
        case "created":
            return <Plus className={cls} />;
        case "state_change":
            return <ArrowRight className={cls} />;
        case "title_change":
            return <Pencil className={cls} />;
        case "comment":
            return <MessageSquare className={cls} />;
        case "notes_change":
            return <FileText className={cls} />;
        case "category_change":
            return <Tag className={cls} />;
        case "pr_url_change":
            return <Link className={cls} />;
        case "pr_state_change":
            return <GitPullRequest className={cls} />;
        default:
            return <Pencil className={cls} />;
    }
}

function EventDescription({ event }: { event: TaskEvent }) {
    switch (event.eventType) {
        case "created":
            return <span>Task created</span>;
        case "state_change":
            return (
                <span>
                    Moved to{" "}
                    <span className="font-medium">
                        {stateLabels[event.newValue ?? ""] ?? event.newValue}
                    </span>
                </span>
            );
        case "title_change":
            return (
                <span>
                    Title changed from{" "}
                    <span className="italic text-muted-foreground/70">
                        {event.oldValue}
                    </span>{" "}
                    to <span className="font-medium">{event.newValue}</span>
                </span>
            );
        case "comment":
            return <span className="font-medium">{event.comment}</span>;
        case "description_change":
            return <span>Description updated</span>;
        case "notes_change":
            return <span>Notes updated</span>;
        case "category_change":
            return (
                <span>
                    Category changed to{" "}
                    <span className="font-medium">{event.newValue}</span>
                </span>
            );
        case "pr_url_change":
            return <span>PR link updated</span>;
        case "pr_state_change":
            return (
                <span>
                    PR moved to{" "}
                    <span className="font-medium">
                        {prStateLabels[event.newValue ?? ""] ?? event.newValue}
                    </span>
                </span>
            );
        default:
            return <span>{event.eventType}</span>;
    }
}

export function TaskHistory({ taskId }: TaskHistoryProps) {
    const { data: events, isLoading } = useTaskEvents(taskId);

    if (isLoading) {
        return (
            <div className="text-xs text-muted-foreground">
                Loading activity...
            </div>
        );
    }

    if (!events || events.length === 0) {
        return (
            <div className="text-xs text-muted-foreground/60">
                No activity yet.
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <h3 className="text-sm font-medium text-foreground">Activity</h3>
            <div className="relative ml-2 border-l border-border pl-4">
                {events.map((event) => (
                    <div key={event.id} className="relative pb-4 last:pb-0">
                        {/* Timeline dot */}
                        <div className="absolute -left-[21px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                            <EventIcon eventType={event.eventType} />
                        </div>

                        <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-foreground leading-relaxed">
                                <EventDescription event={event} />
                            </span>
                            <span className="text-[10px] text-muted-foreground/50">
                                {formatRelativeTime(event.createdAt)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
