import { Fragment } from "react";
import type { CommitInfo, CommitList as Commits } from "@core/types/grsp";
import {
    newCommitCount,
    pickCount,
    type CommitPick,
} from "@core/utils/commits";
import { errorMessage, relativeTime } from "@core/utils/sessions";
import { cn } from "@ui/lib/utils";

interface CommitListProps {
    list: Commits | undefined;
    isLoading: boolean;
    error: unknown;
    onRetry: () => void;
    onPick: (pick: CommitPick) => void;
    /** A review is being opened; the list is disabled meanwhile. */
    pending?: boolean;
    className?: string;
}

const frame = "rounded-lg border border-line";

function plural(count: number, one: string): string {
    return `${count} ${count === 1 ? one : `${one}s`}`;
}

function CommitMeta({ commit }: { commit: CommitInfo }) {
    return (
        <span className="flex min-w-0 items-baseline gap-1.5 text-xs text-text-3">
            <span className="shrink-0 font-mono text-[11px] text-text-2">
                {commit.shortSha}
            </span>
            <span aria-hidden>·</span>
            <span className="truncate">{commit.author}</span>
            <span aria-hidden>·</span>
            <span className="shrink-0">{relativeTime(commit.authoredAt)}</span>
            <span aria-hidden>·</span>
            <span className="shrink-0 font-mono text-[11px]">
                +{commit.added} −{commit.removed}
            </span>
            {commit.isMerge && (
                <span className="shrink-0 rounded-[4px] border border-line px-1 text-[10px] uppercase leading-[15px] tracking-[0.05em]">
                    Merge
                </span>
            )}
        </span>
    );
}

/**
 * Recent commits on a branch. Clicking a commit reviews it alone; "+N newer"
 * reviews it together with everything after it; the top row reviews what
 * arrived since the last commit review on this branch.
 */
export function CommitList({
    list,
    isLoading,
    error,
    onRetry,
    onPick,
    pending = false,
    className,
}: CommitListProps) {
    if (isLoading) {
        return (
            <div className={cn(frame, className)}>
                <p className="px-4 py-3 text-[13px] text-text-2">
                    Fetching the branch and reading its commits…
                </p>
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="flex flex-col gap-2 border-t border-line-soft px-4 py-3"
                    >
                        <div className="h-3 w-3/5 animate-pulse rounded bg-wash" />
                        <div className="h-2.5 w-2/5 animate-pulse rounded bg-wash" />
                    </div>
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className={cn(frame, "px-4 py-3", className)}>
                <p className="text-[13px] font-medium">Couldn't list commits</p>
                <p className="mt-0.5 select-text break-words text-xs text-text-2">
                    {errorMessage(error)}
                </p>
                <button
                    type="button"
                    onClick={onRetry}
                    className="mt-2 text-xs font-medium underline underline-offset-[3px]"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (!list || list.commits.length === 0) {
        return (
            <div className={cn(frame, "px-4 py-3", className)}>
                <p className="text-[13px] text-text-2">
                    No commits on this branch.
                </p>
            </div>
        );
    }

    const fresh = newCommitCount(list);

    return (
        <div className={cn("flex min-w-0 flex-col gap-2", className)}>
            {list.offline && (
                <p className="text-xs text-text-3">
                    Offline, showing local commits. Anything pushed since your
                    last fetch isn't here yet.
                </p>
            )}
            <div className={cn(frame, "max-h-[300px] overflow-y-auto")}>
                {fresh > 0 && (
                    <div className="sticky top-0 z-[1] flex items-center gap-3 border-b border-line bg-paper px-4 py-2.5">
                        <span
                            aria-hidden
                            className="h-[7px] w-[7px] shrink-0 rounded-full bg-ink"
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                            {plural(fresh, "new commit")} since you last looked
                        </span>
                        <button
                            type="button"
                            disabled={pending}
                            onClick={() => onPick({ kind: "new" })}
                            className="h-7 shrink-0 rounded-md border border-ink bg-ink px-2.5 text-xs font-medium text-paper transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
                        >
                            {fresh === 1 ? "Review it" : "Review them"}
                        </button>
                    </div>
                )}
                {list.commits.map((commit, index) => {
                    const through = pickCount(list, {
                        kind: "through",
                        sha: commit.sha,
                    });
                    return (
                        <Fragment key={commit.sha}>
                            {fresh > 0 && index === fresh && (
                                <div
                                    role="separator"
                                    className="flex items-center gap-2.5 border-t border-line-soft px-4 pt-2"
                                >
                                    <span className="section-label text-[10px]">
                                        Reviewed up to here
                                    </span>
                                    <span className="h-px flex-1 bg-line" />
                                </div>
                            )}
                            <div
                                className={cn(
                                    "group flex min-w-0 items-center gap-2 pr-3 transition-colors focus-within:bg-wash hover:bg-wash",
                                    index > 0 &&
                                        index !== fresh &&
                                        "border-t border-line-soft",
                                )}
                            >
                                <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() =>
                                        onPick({
                                            kind: "single",
                                            sha: commit.sha,
                                        })
                                    }
                                    title={commit.subject}
                                    className="flex min-w-0 flex-1 flex-col gap-0.5 py-2.5 pl-4 text-left focus-visible:outline-none disabled:cursor-default disabled:opacity-60"
                                >
                                    <span className="block w-full truncate text-[13px] font-medium">
                                        {commit.subject}
                                    </span>
                                    <CommitMeta commit={commit} />
                                </button>
                                {through > 1 && (
                                    <button
                                        type="button"
                                        disabled={pending}
                                        onClick={() =>
                                            onPick({
                                                kind: "through",
                                                sha: commit.sha,
                                            })
                                        }
                                        title={`Review this commit and the ${plural(through - 1, "newer one")} together`}
                                        aria-label={`Review this commit and the ${plural(through - 1, "newer one")} together (${through} commits)`}
                                        className="h-7 shrink-0 whitespace-nowrap rounded-md border border-line bg-paper px-2 text-xs text-text-2 transition-colors hover:border-ink hover:text-ink focus-visible:border-ink focus-visible:text-ink focus-visible:outline-none disabled:opacity-60"
                                    >
                                        +{through - 1} newer
                                    </button>
                                )}
                            </div>
                        </Fragment>
                    );
                })}
            </div>
            <p className="text-xs text-text-3" aria-live="polite">
                {pending
                    ? "Opening the review…"
                    : "Pick a commit to review it on its own, or “+N newer” to review it with everything after it."}
            </p>
        </div>
    );
}
