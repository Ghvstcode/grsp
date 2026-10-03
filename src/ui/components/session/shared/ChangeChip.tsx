import type { AffectedTag, ChangeStatus } from "@core/types/grsp";
import { cn } from "@ui/lib/utils";
import { changeLabel, tagLabel } from "../lib/status";

type ChipState = ChangeStatus | AffectedTag;

function chipTone(state: ChipState, inverted: boolean): string {
    if (inverted) return "border-background text-background";
    switch (state) {
        case "new":
            return "border-foreground bg-foreground text-background";
        case "unchanged":
            return "border-border text-muted-foreground";
        case "not_covered":
            return "border-dashed border-foreground text-foreground";
        default:
            return "border-foreground text-foreground";
    }
}

function chipLabel(state: ChipState): string {
    return state === "timing" ? tagLabel(state) : changeLabel(state);
}

interface ChangeChipProps {
    state: ChipState;
    /** On an ink (selected) background. */
    inverted?: boolean;
    /** `tag` is the wider fixed-width chip of the "What's affected" rows. */
    variant?: "chip" | "tag";
    className?: string;
}

/** The change state of a symbol; the same four states everywhere. */
export function ChangeChip({
    state,
    inverted = false,
    variant = "chip",
    className,
}: ChangeChipProps) {
    return (
        <span
            className={cn(
                "shrink-0 whitespace-nowrap rounded-[4px] border",
                variant === "chip"
                    ? "px-[7px] py-[2px] font-mono text-[10px] uppercase leading-[15px] tracking-[0.05em]"
                    : "w-[92px] px-2 py-[2px] text-center text-[11px] leading-[16.5px]",
                chipTone(state, inverted),
                className,
            )}
        >
            {chipLabel(state)}
        </span>
    );
}
