import type { CodeRef } from "@core/types/grsp";
import { cn } from "@ui/lib/utils";
import { refLabel } from "../lib/status";

/** A verified `file:line` reference. Unverified refs are dashed and say so. */
export function RefChip({
    codeRef,
    className,
}: {
    codeRef: CodeRef;
    className?: string;
}) {
    return (
        <span
            title={
                codeRef.verified
                    ? codeRef.anchor
                    : "This reference couldn't be verified against the code."
            }
            className={cn(
                "grsp-text-soft rounded-[5px] border px-2 py-[3px] font-mono text-[11px] leading-[16.5px]",
                !codeRef.verified && "border-dashed",
                className,
            )}
        >
            {refLabel(codeRef)}
            {!codeRef.verified && " · unverified"}
        </span>
    );
}
