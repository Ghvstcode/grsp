import { cn } from "@ui/lib/utils";

export interface SegmentedOption<T extends string | number> {
    value: T;
    label: string;
    disabled?: boolean;
}

interface SegmentedProps<T extends string | number> {
    value: T | undefined;
    onValueChange: (value: T) => void;
    options: SegmentedOption<T>[];
    /** Accessible name for the group. */
    label: string;
    size?: "default" | "sm";
    className?: string;
}

/**
 * Segmented control from the design: separate pills, the active one filled
 * with ink (DESIGN.md "Current/selected").
 */
export function Segmented<T extends string | number>({
    value,
    onValueChange,
    options,
    label,
    size = "default",
    className,
}: SegmentedProps<T>) {
    return (
        <div
            role="group"
            aria-label={label}
            className={cn("flex flex-wrap gap-2", className)}
        >
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={String(option.value)}
                        type="button"
                        aria-pressed={active}
                        disabled={option.disabled}
                        onClick={() => onValueChange(option.value)}
                        className={cn(
                            "rounded-md border text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
                            size === "sm" ? "h-8 px-3" : "h-[38px] px-3.5",
                            active
                                ? "border-ink bg-ink text-paper"
                                : "border-line bg-paper text-ink hover:bg-wash",
                        )}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
