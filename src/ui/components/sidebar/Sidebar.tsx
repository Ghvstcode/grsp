import { useState, useRef } from "react";
import type { CSSProperties } from "react";
import { Plus, Search, Link } from "lucide-react";
import { useAppStore } from "@core/store/app-store";
import { useScanNow } from "@core/api/useEngine";
import { useGlobalSettings } from "@core/api/useSettings";
import { useImportPr } from "@core/api/useImportPr";
import { ProjectList } from "./ProjectList";
import { SidebarFooter } from "./SidebarFooter";
import { AddProjectDialog } from "./AddProjectDialog";
import { AiStatusCard } from "./AiStatusCard";

interface SidebarProps {
    style?: CSSProperties;
}

export function Sidebar({ style }: SidebarProps) {
    const setSelectedRepository = useAppStore((s) => s.setSelectedRepository);
    const scanNow = useScanNow();
    const { data: globalSettings } = useGlobalSettings();
    const importPr = useImportPr();
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [prUrl, setPrUrl] = useState("");
    const prInputRef = useRef<HTMLInputElement>(null);

    function handleImportPr() {
        const url = prUrl.trim();
        if (!url) return;
        // Clear input immediately — progress shows in a toast
        setPrUrl("");
        importPr.mutate(url);
    }

    return (
        <aside
            className="flex shrink-0 flex-col border-r border-border bg-sidebar"
            style={style}
        >
            {/* Brand */}
            <div className="flex h-[60px] items-center border-b border-border px-4">
                <div className="flex items-center gap-2">
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 42 42"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="shrink-0 text-sidebar-foreground"
                    >
                        <path
                            d="M24.3012 1.73511V19.0934M24.3012 36.4518V19.0934M36.5754 6.81925L12.027 31.3676M24.3012 19.0934L6.94287 19.0934M36.5754 31.3676L12.027 6.81925"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                    <span className="text-[13px] font-semibold text-sidebar-foreground tracking-tight">
                        sustn
                    </span>
                </div>
            </div>

            {/* Search + Add */}
            <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-sidebar-foreground/40" />
                    <input
                        type="text"
                        placeholder="Search projects..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-md border border-sidebar-border bg-transparent py-1.5 pl-7 pr-2 text-[12px] text-sidebar-foreground placeholder:text-sidebar-foreground/35 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => setIsAddDialogOpen(true)}
                    className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                    title="Add project"
                >
                    <Plus className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* Import PR */}
            <div className="px-3 pb-2">
                <div className="relative">
                    <Link className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-sidebar-foreground/40" />
                    <input
                        ref={prInputRef}
                        type="text"
                        placeholder="Paste a PR link..."
                        value={prUrl}
                        onChange={(e) => setPrUrl(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleImportPr();
                            if (e.key === "Escape") {
                                setPrUrl("");
                                prInputRef.current?.blur();
                            }
                        }}
                        className="w-full rounded-md border border-sidebar-border bg-transparent py-1.5 pl-7 pr-2 text-[12px] text-sidebar-foreground placeholder:text-sidebar-foreground/35 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                </div>
            </div>

            {/* Project list */}
            <div className="flex-1 overflow-hidden">
                <ProjectList search={search} />
            </div>

            {/* AI Status */}
            {globalSettings?.showBudgetInSidebar !== false && <AiStatusCard />}

            {/* Footer */}
            <SidebarFooter />

            {/* Add Project Dialog */}
            <AddProjectDialog
                open={isAddDialogOpen}
                onOpenChange={setIsAddDialogOpen}
                onSuccess={(repoId, repoPath) => {
                    setSelectedRepository(repoId);
                    scanNow.mutate({
                        repoPath,
                        repositoryId: repoId,
                        baseBranch: "main",
                    });
                }}
            />
        </aside>
    );
}
