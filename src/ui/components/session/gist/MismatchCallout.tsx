import type { Mismatch } from "@core/types/grsp";
import { Button } from "@ui/components/ui/button";
import { InlineText } from "../shared/InlineText";

/** Shown when the description makes a claim the code contradicts. */
export function MismatchCallout({
    mismatch,
    onWalk,
}: {
    mismatch: Mismatch;
    /** Absent when the mismatch isn't tied to an entry point. */
    onWalk?: () => void;
}) {
    return (
        <div className="grsp-bg-panel flex items-center gap-5 rounded-[10px] border-[1.5px] border-foreground px-[22px] py-[18px]">
            <span className="shrink-0 rounded-[5px] bg-foreground px-[9px] py-1 text-[11px] font-semibold uppercase leading-[16.5px] tracking-[0.06em] text-background">
                Mismatch
            </span>
            <p className="m-0 grow">
                <InlineText text={mismatch.claim} />{" "}
                <InlineText text={mismatch.reality} />
            </p>
            {onWalk && (
                <Button
                    variant="outline"
                    onClick={onWalk}
                    className="h-10 shrink-0 rounded-lg border-foreground bg-background px-4 text-[13px] shadow-none"
                >
                    Walk through it →
                </Button>
            )}
        </div>
    );
}
