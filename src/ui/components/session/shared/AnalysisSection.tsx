import { useState, type ReactNode } from "react";
import type { Analysis } from "@core/types/grsp";
import { Button } from "@ui/components/ui/button";
import { cn } from "@ui/lib/utils";
import { sectionState } from "../lib/status";
import { ProgressLine } from "./ProgressLine";

interface AnalysisSectionProps<T> {
    analysis: Analysis<T> | undefined;
    /** Shown in the error state: "Couldn't work out {what}." */
    what: string;
    /** Placeholder with the section's shape, shown while waiting / running. */
    skeleton: ReactNode;
    /** Progress line before the agent has reported any activity. */
    waitingLabel?: string;
    onRetry: () => void;
    onCancel?: () => void;
    children: (result: T, analysis: Analysis<T>) => ReactNode;
    /** Put the progress line above the skeleton instead of below it. */
    progressFirst?: boolean;
    className?: string;
}

/**
 * State wrapper for anything backed by one analysis: skeleton plus the
 * agent's current progress line while it runs (cancellable), the error with
 * Retry and the raw output behind "Details" when it fails, the content when
 * it's done. One section failing never blocks the others (SPEC §2.2).
 */
export function AnalysisSection<T>({
    analysis,
    what,
    skeleton,
    waitingLabel = "Waiting for the agent",
    onRetry,
    onCancel,
    children,
    progressFirst = false,
    className,
}: AnalysisSectionProps<T>) {
    const state = sectionState(analysis);

    if (state === "done" && analysis?.result !== undefined) {
        return <>{children(analysis.result, analysis)}</>;
    }

    if (state === "error") {
        return (
            <SectionError
                title={`Couldn't work out ${what}.`}
                message={analysis?.error}
                details={analysis?.errorDetails}
                onRetry={onRetry}
                className={className}
            />
        );
    }

    return (
        <div
            className={cn(
                "flex gap-3",
                progressFirst ? "flex-col-reverse" : "flex-col",
                className,
            )}
            aria-busy
        >
            {skeleton}
            <ProgressLine
                text={
                    state === "running"
                        ? (analysis?.progress ?? "Starting the agent")
                        : waitingLabel
                }
                onCancel={state === "running" ? onCancel : undefined}
            />
        </div>
    );
}

interface SectionErrorProps {
    title: string;
    message?: string;
    details?: string;
    onRetry?: () => void;
    retryLabel?: string;
    className?: string;
}

export function SectionError({
    title,
    message,
    details,
    onRetry,
    retryLabel = "Retry",
    className,
}: SectionErrorProps) {
    const [showDetails, setShowDetails] = useState(false);
    return (
        <div
            role="alert"
            className={cn(
                "flex flex-col gap-3 rounded-[10px] border border-dashed border-foreground px-[18px] py-4",
                className,
            )}
        >
            <div className="flex items-start gap-4">
                <div className="flex min-w-0 grow flex-col gap-0.5">
                    <span className="font-medium">{title}</span>
                    {message && (
                        <span className="grsp-text-2 text-[13px]">
                            {message}
                        </span>
                    )}
                </div>
                {onRetry && (
                    <Button
                        variant="outline"
                        onClick={onRetry}
                        className="h-9 shrink-0 rounded-lg px-3.5 text-[13px] font-normal shadow-none"
                    >
                        {retryLabel}
                    </Button>
                )}
            </div>
            {details && (
                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={() => setShowDetails((open) => !open)}
                        aria-expanded={showDetails}
                        className="self-start text-xs font-medium underline underline-offset-[3px]"
                    >
                        {showDetails ? "Hide details" : "Details"}
                    </button>
                    {showDetails && (
                        <pre className="grsp-bg-wash grsp-text-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg px-3 py-2.5 font-mono text-[11.5px] leading-[1.6]">
                            {details}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
}

/** A grey bar standing in for a line of text. */
export function SkeletonLine({ className }: { className?: string }) {
    return <div className={cn("grsp-skeleton h-3.5", className)} aria-hidden />;
}
