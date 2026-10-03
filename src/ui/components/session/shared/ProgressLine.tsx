import { cn } from "@ui/lib/utils";

/** The agent's current activity ("Reading orders/services.py"). */
export function ProgressLine({
    text,
    onCancel,
    className,
}: {
    text: string;
    onCancel?: () => void;
    className?: string;
}) {
    return (
        <div
            className={cn("flex min-h-6 items-center gap-2.5", className)}
            aria-live="polite"
        >
            <span className="grsp-progress-dot" aria-hidden />
            <span className="grsp-text-2 min-w-0 truncate font-mono text-xs">
                {text}
            </span>
            {onCancel && (
                <button
                    type="button"
                    onClick={onCancel}
                    className="ml-1 shrink-0 text-xs font-medium underline underline-offset-[3px]"
                >
                    Cancel
                </button>
            )}
        </div>
    );
}
