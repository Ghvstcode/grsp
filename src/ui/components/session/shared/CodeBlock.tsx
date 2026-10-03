import type { Excerpt } from "@core/types/grsp";
import { cn } from "@ui/lib/utils";
import { excerptStat } from "../lib/status";

interface CodeBlockProps {
    excerpt: Excerpt;
    /** `md` is the walkthrough card; `sm` is used in answers and findings. */
    size?: "sm" | "md";
    /** Replaces the file path in the header, e.g. "Suggested change · file". */
    label?: string;
    /** Shown when the excerpt was capped ("Show all"). */
    onShowAll?: () => void;
    showAllPending?: boolean;
    className?: string;
}

/**
 * Code read from the worktree: file header (path left, `+n −m` or line range
 * right), line-number gutter, sign column, no syntax colour.
 */
export function CodeBlock({
    excerpt,
    size = "sm",
    label,
    onShowAll,
    showAllPending = false,
    className,
}: CodeBlockProps) {
    const md = size === "md";
    const hidden = excerpt.totalLines - excerpt.lines.length;
    return (
        <div className={cn("overflow-hidden rounded-lg border", className)}>
            <div
                className={cn(
                    "grsp-bg-panel grsp-text-2 flex justify-between gap-4 border-b font-mono",
                    md ? "px-[14px] py-2 text-xs" : "px-3 py-[7px] text-[11px]",
                )}
            >
                <span className="truncate">{label ?? excerpt.file}</span>
                <span className="shrink-0">{excerptStat(excerpt)}</span>
            </div>
            <div
                className={cn(
                    "overflow-x-auto font-mono",
                    md ? "py-2" : "py-1.5",
                )}
            >
                <div className="min-w-max">
                    {excerpt.lines.map((line, index) => (
                        <div
                            key={`${line.sign}${line.n}:${index}`}
                            className="grsp-code-line"
                            data-sign={line.sign}
                            data-highlight={line.highlight ? "true" : undefined}
                        >
                            <span className="grsp-code-gutter">
                                {line.sign === "-" ? "" : line.n}
                            </span>
                            <span className="grsp-code-sign">
                                {line.sign === "+"
                                    ? "+"
                                    : line.sign === "-"
                                      ? "−"
                                      : ""}
                            </span>
                            <span>{line.text}</span>
                        </div>
                    ))}
                </div>
            </div>
            {excerpt.truncated && onShowAll && (
                <button
                    type="button"
                    onClick={onShowAll}
                    disabled={showAllPending}
                    className="grsp-bg-panel grsp-text-2 flex h-8 w-full items-center justify-center border-t text-xs font-medium hover:text-foreground disabled:opacity-60"
                >
                    {showAllPending
                        ? "Reading the rest"
                        : hidden > 0
                          ? `Show all · ${hidden} more lines`
                          : "Show all"}
                </button>
            )}
        </div>
    );
}
