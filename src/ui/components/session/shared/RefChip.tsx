import type { CodeRef } from "@core/types/grsp";
import { cn } from "@ui/lib/utils";
import { useCodeJump } from "../code/CodeJumpContext";
import { refLabel } from "../lib/status";

/**
 * A verified `file:line` reference; click it to open that file in the Code
 * tab. Unverified refs are dashed, say so, and go nowhere.
 */
export function RefChip({
    codeRef,
    className,
}: {
    codeRef: CodeRef;
    className?: string;
}) {
    const jump = useCodeJump();
    const chip = cn(
        "grsp-text-soft rounded-[5px] border px-2 py-[3px] font-mono text-[11px] leading-[16.5px]",
        !codeRef.verified && "border-dashed",
        className,
    );
    if (jump && codeRef.verified) {
        return (
            <button
                type="button"
                title={
                    codeRef.anchor
                        ? `${codeRef.anchor} · Open in Code`
                        : "Open in Code"
                }
                onClick={() =>
                    jump({
                        file: codeRef.file,
                        line: codeRef.startLine,
                        side: codeRef.atBase ? "old" : "new",
                    })
                }
                className={cn(
                    chip,
                    "bg-background text-left hover:border-foreground hover:text-foreground focus-visible:border-foreground focus-visible:outline-none",
                )}
            >
                {refLabel(codeRef)}
            </button>
        );
    }
    return (
        <span
            title={
                codeRef.verified
                    ? codeRef.anchor
                    : "This reference couldn't be verified against the code."
            }
            className={chip}
        >
            {refLabel(codeRef)}
            {!codeRef.verified && " · unverified"}
        </span>
    );
}
