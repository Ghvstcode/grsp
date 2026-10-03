import type { ReactNode } from "react";
import { cn } from "@ui/lib/utils";

/** 11px uppercase label used above summaries, decisions and traces. */
export function SectionLabel({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <span
            className={cn(
                "text-[11px] font-medium uppercase leading-normal tracking-[0.06em] text-muted-foreground",
                className,
            )}
        >
            {children}
        </span>
    );
}
