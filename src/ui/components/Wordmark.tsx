import { cn } from "@ui/lib/utils";

interface WordmarkProps {
    className?: string;
    /** The dot pops in, timed to the animated mark. */
    animated?: boolean;
}

/**
 * The grsp wordmark: the dropped "a" is a solid dot, the same dot as the
 * large one in the mark. Sized by the surrounding font-size; read aloud as
 * "grasp".
 */
export function Wordmark({ className, animated = false }: WordmarkProps) {
    return (
        <span
            role="img"
            aria-label="grsp"
            className={cn(
                "inline-flex items-baseline font-bold tracking-[-0.05em]",
                animated && "grsp-wordmark-animated",
                className,
            )}
        >
            <span aria-hidden="true">gr</span>
            <span
                aria-hidden="true"
                className="grsp-wordmark-dot mx-[0.05em] inline-block h-[0.42em] w-[0.42em] translate-y-[-0.06em] rounded-full bg-current"
            />
            <span aria-hidden="true">sp</span>
        </span>
    );
}
