import { DotLoader } from "@ui/components/DotLoader";
import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type {
    Analysis,
    DiscussionComment,
    DiscussionResult,
    DiscussionThread,
    Excerpt,
} from "@core/types/grsp";
import { useExcerpt } from "@core/api/useAnalysis";
import { cn } from "@ui/lib/utils";
import { SectionError } from "../shared/AnalysisSection";
import { CodeBlock } from "../shared/CodeBlock";
import { SectionLabel } from "../shared/SectionLabel";
import {
    discussionCounts,
    discussionOneLiner,
    sectionState,
} from "../lib/status";
import {
    initialOf,
    isLongComment,
    plural,
    relativeTime,
    splitSuggestions,
} from "../lib/text";

const linkButton =
    "self-start text-xs font-medium underline underline-offset-[3px]";

/** A ```suggestion block as a diff against the line the thread is on. */
function SuggestionDiff({
    sessionId,
    thread,
    suggestion,
}: {
    sessionId: string;
    thread: DiscussionThread;
    suggestion: string;
}) {
    const { path, line } = thread;
    const original = useExcerpt(
        sessionId,
        path !== undefined && line !== undefined
            ? { file: path, startLine: line, endLine: line }
            : undefined,
    );
    const excerpt = useMemo<Excerpt>(() => {
        const start = line ?? 1;
        const removed = (original.data?.lines ?? []).map((l) => ({
            n: l.n,
            text: l.text,
            sign: "-" as const,
        }));
        const added = suggestion.split("\n").map((text, index) => ({
            n: start + index,
            text,
            sign: "+" as const,
        }));
        return {
            file: path ?? "",
            startLine: start,
            endLine: start + added.length - 1,
            lines: [...removed, ...added],
            added: added.length,
            removed: removed.length,
            truncated: false,
            totalLines: removed.length + added.length,
        };
    }, [original.data, suggestion, path, line]);

    return (
        <CodeBlock
            excerpt={excerpt}
            label={path ? `Suggested change · ${path}` : "Suggested change"}
            className="mt-1"
        />
    );
}

function Comment({
    sessionId,
    thread,
    comment,
}: {
    sessionId: string;
    thread: DiscussionThread;
    comment: DiscussionComment;
}) {
    const [expanded, setExpanded] = useState(false);
    const parts = useMemo(() => splitSuggestions(comment.body), [comment.body]);
    const prose = parts
        .filter((p) => p.kind === "text")
        .map((p) => p.text)
        .join("\n\n");
    const long = isLongComment(prose);

    return (
        <div className="flex gap-3">
            <div className="grsp-border-strong flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold">
                {initialOf(comment.author)}
            </div>
            <div className="flex min-w-0 grow flex-col gap-1">
                <span className="text-xs">
                    <span className="font-semibold">@{comment.author}</span>
                    <span className="text-muted-foreground">
                        {" "}
                        · {relativeTime(comment.createdAt)}
                    </span>
                </span>
                {prose && (
                    <p
                        className={cn(
                            "grsp-text-1 m-0 max-w-[720px] whitespace-pre-line break-words text-[13.5px]",
                            long && !expanded && "line-clamp-3",
                        )}
                    >
                        {prose}
                    </p>
                )}
                {long && (
                    <button
                        type="button"
                        onClick={() => setExpanded((value) => !value)}
                        aria-expanded={expanded}
                        className={cn(linkButton, "h-7")}
                    >
                        {expanded ? "Show less" : "Show more"}
                    </button>
                )}
                {parts.map((part, index) =>
                    part.kind === "suggestion" ? (
                        <SuggestionDiff
                            key={index}
                            sessionId={sessionId}
                            thread={thread}
                            suggestion={part.text}
                        />
                    ) : null,
                )}
            </div>
        </div>
    );
}

function Thread({
    sessionId,
    thread,
}: {
    sessionId: string;
    thread: DiscussionThread;
}) {
    // Open threads start expanded, resolved ones folded.
    const [open, setOpen] = useState(!thread.resolved);
    const location =
        thread.path === undefined
            ? "General"
            : thread.line === undefined
              ? thread.path
              : `${thread.path}:${thread.line}`;
    return (
        <div
            className={cn(
                "rounded-[9px] border",
                thread.resolved
                    ? "grsp-border-soft grsp-bg-panel"
                    : "grsp-border-strong",
            )}
        >
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left"
            >
                <span
                    className={cn(
                        "w-[70px] shrink-0 rounded-[4px] border px-2 py-[2px] text-center text-[11px] leading-[16.5px]",
                        thread.resolved
                            ? "text-muted-foreground"
                            : "border-foreground bg-foreground text-background",
                    )}
                >
                    {thread.resolved ? "Resolved" : "Open"}
                </span>
                <span className="grsp-text-2 shrink-0 font-mono text-xs">
                    {location}
                </span>
                <span className="grow truncate text-[13px]">
                    {thread.gist ?? thread.comments[0]?.body ?? ""}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                    {plural(thread.comments.length, "comment")}
                </span>
            </button>
            {open && (
                <div className="flex flex-col gap-3 px-3.5 pb-3.5 pt-1">
                    {thread.comments.map((comment) => (
                        <Comment
                            key={comment.id}
                            sessionId={sessionId}
                            thread={thread}
                            comment={comment}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

interface DiscussionSectionProps {
    sessionId: string;
    /** Branch-pair sessions have no PR, so no discussion. */
    isPr: boolean;
    discussion: Analysis<DiscussionResult> | undefined;
    onRetry: () => void;
    onCancel: () => void;
}

/** "Discussion on GitHub": a one-line digest that expands into the threads. */
export function DiscussionSection({
    sessionId,
    isPr,
    discussion,
    onRetry,
    onCancel,
}: DiscussionSectionProps) {
    const [open, setOpen] = useState(false);
    const state = isPr ? sectionState(discussion) : "done";
    const result = isPr && state === "done" ? discussion?.result : undefined;
    const hasThreads = result !== undefined && result.threads.length > 0;
    const counts = result ? discussionCounts(result) : undefined;

    let line: string;
    if (!isPr) {
        line =
            "There's no discussion for a branch comparison. Open a pull request to see its threads here.";
    } else if (state === "running") {
        line = discussion?.progress ?? "Reading the comments";
    } else if (state === "waiting") {
        line = "Waiting to read the comments";
    } else if (state === "error") {
        line = "Couldn't summarise the discussion.";
    } else if (!hasThreads) {
        line = "No discussion yet.";
    } else {
        line = result ? discussionOneLiner(result) : "";
    }

    const header = (
        <>
            {hasThreads && (
                <ChevronRight
                    size={12}
                    strokeWidth={2}
                    className={cn(
                        "shrink-0 transition-transform duration-100",
                        open && "rotate-90",
                    )}
                />
            )}
            <span className="flex min-w-0 grow flex-col gap-0.5">
                <span className="text-[15px] font-semibold">
                    Discussion on GitHub
                </span>
                <span
                    className={cn(
                        "grsp-text-2 truncate text-[13px]",
                        (state === "running" || state === "waiting") &&
                            "font-mono text-xs leading-[19.5px]",
                    )}
                    aria-live="polite"
                >
                    {line}
                </span>
            </span>
            {counts && hasThreads && (
                <span className="shrink-0 text-xs text-muted-foreground">
                    {plural(counts.comments, "comment")} ·{" "}
                    {plural(counts.people, "person", "people")}
                </span>
            )}
            {state === "running" && <DotLoader />}
        </>
    );
    const headerClass =
        "grsp-bg-panel flex min-h-[60px] w-full items-center gap-3.5 px-5 py-3.5 text-left";

    return (
        <div className="overflow-hidden rounded-[10px] border">
            {hasThreads ? (
                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    aria-expanded={open}
                    className={headerClass}
                >
                    {header}
                </button>
            ) : (
                <div className={headerClass}>
                    {header}
                    {state === "running" && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="shrink-0 text-xs font-medium underline underline-offset-[3px]"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            )}
            {state === "error" && (
                <div className="border-t px-5 py-4">
                    <SectionError
                        title="The discussion summary failed."
                        message={discussion?.error}
                        details={discussion?.errorDetails}
                        onRetry={onRetry}
                    />
                </div>
            )}
            {open && result && hasThreads && (
                <div className="flex flex-col gap-3.5 border-t px-5 pb-5 pt-[18px]">
                    {result.digest && (
                        <div className="grsp-bg-wash flex flex-col gap-1 rounded-lg px-4 py-3.5">
                            <SectionLabel className="grsp-text-2">
                                Where it stands
                            </SectionLabel>
                            <p className="grsp-text-1 m-0 text-[13px]">
                                {result.digest}
                            </p>
                        </div>
                    )}
                    {result.threads.map((thread) => (
                        <Thread
                            key={thread.id}
                            sessionId={sessionId}
                            thread={thread}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
