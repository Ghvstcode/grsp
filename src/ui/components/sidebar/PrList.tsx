import type { OpenPr } from "@core/types/grsp";
import { errorMessage, relativeTime } from "@core/utils/sessions";
import { cn } from "@ui/lib/utils";

interface PrListProps {
    prs: OpenPr[] | undefined;
    isLoading: boolean;
    error: unknown;
    onRetry: () => void;
    onPick: (pr: OpenPr) => void;
    /** PR number currently being opened; disables the list. */
    pendingNumber?: number;
    disabled?: boolean;
    className?: string;
}

/** Open pull requests for one repo: number, title, author, updated time. */
export function PrList({
    prs,
    isLoading,
    error,
    onRetry,
    onPick,
    pendingNumber,
    disabled,
    className,
}: PrListProps) {
    if (isLoading) {
        return (
            <div className={cn("rounded-lg border border-line", className)}>
                <p className="px-4 py-3 text-[13px] text-text-2">
                    Loading open pull requests from GitHub…
                </p>
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="flex items-center gap-3 border-t border-line-soft px-4 py-3"
                    >
                        <div className="h-3 w-9 animate-pulse rounded bg-wash" />
                        <div className="h-3 flex-1 animate-pulse rounded bg-wash" />
                    </div>
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div
                className={cn(
                    "rounded-lg border border-line px-4 py-3",
                    className,
                )}
            >
                <p className="text-[13px] font-medium">
                    Couldn't load pull requests
                </p>
                <p className="mt-0.5 select-text text-xs text-text-2">
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

    if (!prs || prs.length === 0) {
        return (
            <div
                className={cn(
                    "rounded-lg border border-line px-4 py-3",
                    className,
                )}
            >
                <p className="text-[13px] text-text-2">
                    No open pull requests in this repository.
                </p>
            </div>
        );
    }

    return (
        <div
            className={cn(
                "max-h-[280px] overflow-y-auto rounded-lg border border-line",
                className,
            )}
        >
            {prs.map((pr) => {
                const pending = pendingNumber === pr.number;
                return (
                    <button
                        key={pr.number}
                        type="button"
                        onClick={() => onPick(pr)}
                        disabled={disabled || pendingNumber !== undefined}
                        className="flex w-full items-baseline gap-3 border-t border-line-soft px-4 py-2.5 text-left transition-colors first:border-t-0 hover:bg-wash focus-visible:bg-wash focus-visible:outline-none disabled:cursor-default disabled:opacity-60"
                    >
                        <span className="w-11 shrink-0 font-mono text-[12px]">
                            #{pr.number}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">
                                {pr.title}
                            </span>
                            <span className="block truncate text-xs text-text-3">
                                {pr.author}
                                {" · updated "}
                                {relativeTime(pr.updatedAt)}
                                {pr.isDraft && " · draft"}
                            </span>
                        </span>
                        {pending && (
                            <span className="shrink-0 text-xs text-text-2">
                                Opening…
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
