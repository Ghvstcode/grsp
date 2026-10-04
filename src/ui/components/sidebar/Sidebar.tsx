import { useState } from "react";
import type { CSSProperties } from "react";
import { FolderPlus, Plus } from "lucide-react";
import { useAppStore } from "@core/store/app-store";
import { LogoMark } from "@ui/components/LogoMark";
import { Wordmark } from "@ui/components/Wordmark";
import { SessionList } from "./SessionList";
import { SidebarFooter } from "./SidebarFooter";
import { AddFolderDialog } from "./AddFolderDialog";

interface SidebarProps {
    style?: CSSProperties;
}

export function Sidebar({ style }: SidebarProps) {
    const setNewReviewOpen = useAppStore((s) => s.setNewReviewOpen);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

    return (
        <aside
            className="flex shrink-0 flex-col border-r border-border bg-sidebar"
            style={style}
        >
            {/* Brand */}
            <div className="flex h-[60px] shrink-0 items-center border-b border-border px-4">
                <div className="flex items-center gap-2">
                    <LogoMark size={18} className="text-sidebar-foreground" />
                    <Wordmark className="text-[16px] text-sidebar-foreground" />
                </div>
            </div>

            {/* New review */}
            <div className="px-3 pt-3 pb-1">
                <button
                    type="button"
                    onClick={() => setNewReviewOpen(true)}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
                >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    New review
                </button>
            </div>

            {/* Reviews, grouped by repo folder */}
            <div className="flex items-center justify-between pl-[22px] pr-3 pt-4 pb-1.5">
                <span className="section-label">Reviews</span>
                <button
                    type="button"
                    onClick={() => setIsAddDialogOpen(true)}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    title="Add folder"
                    aria-label="Add folder"
                >
                    <FolderPlus className="h-3.5 w-3.5" />
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
                <SessionList onAddFolder={() => setIsAddDialogOpen(true)} />
            </div>

            {/* Footer */}
            <SidebarFooter />

            {/* Add folder dialog */}
            <AddFolderDialog
                open={isAddDialogOpen}
                onOpenChange={setIsAddDialogOpen}
            />
        </aside>
    );
}
