import { cn } from "@ui/lib/utils";

/**
 * The brand loader: three dots, each taking its turn as the large one.
 * Decorative; pair it with text that says what is happening.
 */
export function DotLoader({ className }: { className?: string }) {
    return (
        <span className={cn("grsp-dot-loader", className)} aria-hidden="true">
            <span />
            <span />
            <span />
        </span>
    );
}
