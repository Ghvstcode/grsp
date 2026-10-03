import { useState } from "react";
import { Archive, MoreHorizontal } from "lucide-react";
import type { ReviewSession } from "@core/types/grsp";
import {
    sessionRefLabel,
    sessionStatusLabel,
    sessionTitle,
} from "@core/utils/sessions";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@ui/components/ui/dropdown-menu";
import { cn } from "@ui/lib/utils";

interface SessionItemProps {
    session: ReviewSession;
    isSelected: boolean;
    onSelect: () => void;
    onArchive: () => void;
}

export function SessionItem({
    session,
    isSelected,
    onSelect,
    onArchive,
}: SessionItemProps) {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div
            className="group relative"
            onContextMenu={(e) => {
                e.preventDefault();
                setMenuOpen(true);
            }}
        >
            <button
                type="button"
                onClick={onSelect}
                aria-current={isSelected ? "true" : undefined}
                className={cn(
                    "flex w-full flex-col gap-0.5 rounded-md border px-2.5 py-2 text-left text-sidebar-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    isSelected
                        ? "border-line bg-paper"
                        : "border-transparent hover:bg-sidebar-accent",
                )}
            >
                <span className="flex min-w-0 items-baseline gap-2 pr-5">
                    <span className="truncate font-mono text-[11px]">
                        {sessionRefLabel(session)}
                    </span>
                    <span className="shrink-0 text-[11px] text-text-3">
                        {sessionStatusLabel(session)}
                    </span>
                </span>
                <span className="line-clamp-2 text-[13px] leading-[1.35]">
                    {sessionTitle(session)}
                </span>
            </button>

            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label="Review actions"
                        className={cn(
                            "absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded text-text-3 transition-opacity hover:bg-wash hover:text-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            menuOpen
                                ? "opacity-100"
                                : "opacity-0 group-hover:opacity-100",
                        )}
                    >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                    <DropdownMenuItem
                        onSelect={onArchive}
                        className="gap-2 text-[13px]"
                    >
                        <Archive className="h-3.5 w-3.5" />
                        Archive review
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
