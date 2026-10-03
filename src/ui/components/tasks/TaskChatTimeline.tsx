import { useMemo } from "react";
import {
    ArrowRight,
    MessageSquare,
    MessageSquarePlus,
    Pencil,
    Plus,
    FileText,
    Tag,
    Link,
    Bot,
    User,
    GitPullRequest,
} from "lucide-react";
import { useTaskEvents, useTaskMessages } from "@core/api/useTasks";
import type { TaskEvent, TaskMessage } from "@core/types/task";

interface TaskChatTimelineProps {
    taskId: string;
}

// ── Timeline item types ────────────────────────────────────

type TimelineItem =
    | { kind: "event"; data: TaskEvent }
    | { kind: "message"; data: TaskMessage };

// ── Helpers ────────────────────────────────────────────────

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
    failed: "Failed",
};

const prStateLabels: Record<string, string> = {
    opened: "PR Opened",
    in_review: "In Review",
    changes_requested: "Changes Requested",
    addressing: "Addressing Feedback",
    re_review_requested: "Re-review Requested",
    approved: "Approved",
    merged: "Merged",
    needs_human_attention: "Needs Your Attention",
};

// ── Event rendering ────────────────────────────────────────

function EventIcon({ eventType }: { eventType: string }) {
    const cls = "h-3 w-3";
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
        case "pr_event":
        case "pr_state_change":
            return <GitPullRequest className={cls} />;
        default:
            return <Pencil className={cls} />;
    }
}

function EventDescription({ event }: { event: TaskEvent }) {
    switch (event.eventType) {
        case "created":
            return (
                <span>
                    Task created
                    {event.comment && (
                        <span className="text-muted-foreground/70">
                            {" "}
                            — {event.comment}
                        </span>
                    )}
                </span>
            );
        case "state_change":
            return (
                <span>
                    Moved to{" "}
                    <span className="font-medium">
                        {stateLabels[event.newValue ?? ""] ?? event.newValue}
                    </span>
                    {event.comment && (
                        <span className="text-muted-foreground/70">
                            {" "}
                            — {event.comment}
                        </span>
                    )}
                </span>
            );
        case "title_change":
            return (
                <span>
                    Title changed to{" "}
                    <span className="font-medium">{event.newValue}</span>
                </span>
            );
        case "comment":
            return <span>{event.comment}</span>;
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
        case "pr_event":
            return <span>{event.comment}</span>;
        default:
            return <span>{event.eventType}</span>;
    }
}

// ── System event row ───────────────────────────────────────

function SystemEvent({ event }: { event: TaskEvent }) {
    return (
        <div className="flex items-center gap-2 py-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shrink-0">
                <EventIcon eventType={event.eventType} />
            </div>
            <span className="text-xs text-muted-foreground leading-relaxed flex-1">
                <EventDescription event={event} />
            </span>
            <span className="text-[10px] text-muted-foreground/40 shrink-0">
                {formatRelativeTime(event.createdAt)}
            </span>
        </div>
    );
}

// ── Chat message (Linear-style comment) ─────────────────────

function ChatMessage({ message }: { message: TaskMessage }) {
    const isUser = message.role === "user";
    const isAgent = message.role === "agent";
    const isChangeRequest = message.metadata?.type === "change_request";

    const authorLabel = isUser ? "You" : isAgent ? "Agent" : "System";

    return (
        <div
            className={`flex gap-2.5 py-2 ${
                isChangeRequest
                    ? "rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-2.5 py-2.5"
                    : ""
            }`}
        >
            <div
                className={`flex h-5 w-5 items-center justify-center rounded-full shrink-0 mt-0.5 ${
                    isChangeRequest
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : isAgent
                          ? "bg-primary/10 text-primary"
                          : isUser
                            ? "bg-foreground/8 text-foreground/60"
                            : "bg-muted text-muted-foreground"
                }`}
            >
                {isChangeRequest ? (
                    <MessageSquarePlus className="h-3 w-3" />
                ) : isAgent ? (
                    <Bot className="h-3 w-3" />
                ) : (
                    <User className="h-3 w-3" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-foreground/80">
                        {authorLabel}
                    </span>
                    {isChangeRequest && (
                        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                            requested changes
                        </span>
                    )}
                    <span className="text-[10px] text-muted-foreground/40">
                        {formatRelativeTime(message.createdAt)}
                    </span>
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-foreground/70 whitespace-pre-wrap">
                    {message.content}
                </p>
            </div>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────

export function TaskChatTimeline({ taskId }: TaskChatTimelineProps) {
    const { data: events } = useTaskEvents(taskId);
    const { data: messages } = useTaskMessages(taskId);

    // Merge events and messages into a unified timeline
    const timeline = useMemo<TimelineItem[]>(() => {
        const items: TimelineItem[] = [];

        if (events) {
            for (const event of events) {
                if (event.eventType === "comment") continue;
                items.push({ kind: "event", data: event });
            }
        }

        if (messages) {
            for (const message of messages) {
                items.push({ kind: "message", data: message });
            }
        }

        items.sort(
            (a, b) =>
                new Date(a.data.createdAt).getTime() -
                new Date(b.data.createdAt).getTime(),
        );

        return items;
    }, [events, messages]);

    return (
        <div className="space-y-1">
            {timeline.length === 0 && (
                <p className="text-xs text-muted-foreground/40 py-2">
                    No activity yet
                </p>
            )}
            {timeline.map((item) => {
                if (item.kind === "event") {
                    return (
                        <SystemEvent
                            key={`e-${item.data.id}`}
                            event={item.data}
                        />
                    );
                }
                return (
                    <ChatMessage
                        key={`m-${item.data.id}`}
                        message={item.data}
                    />
                );
            })}
        </div>
    );
}
