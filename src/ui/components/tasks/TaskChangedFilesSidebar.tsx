import { useState } from "react";
import { ScrollArea } from "@ui/components/ui/scroll-area";
import type { DiffFileStat } from "@core/api/useEngine";
import { FileTreePanel } from "./FileTreePanel";

interface TaskChangedFilesSidebarProps {
    repoPath: string | undefined;
    files: DiffFileStat[];
    activeFile: string | undefined;
    onDiffFileSelect: (file: string) => void;
    onBrowseFileSelect: (file: string) => void;
    actions?: React.ReactNode;
    hasChanges: boolean;
    diffError?: string | null;
}

function getFileName(path: string): string {
    return path.split("/").pop() ?? path;
}

function getDirPath(path: string): string {
    const parts = path.split("/");
    if (parts.length <= 1) return "";
    return parts.slice(0, -1).join("/") + "/";
}

export function TaskChangedFilesSidebar({
    repoPath,
    files,
    activeFile,
    onDiffFileSelect,
    onBrowseFileSelect,
    actions,
    hasChanges,
    diffError,
}: TaskChangedFilesSidebarProps) {
    const [tab, setTab] = useState<"all_files" | "changes">("all_files");

    return (
        <div className="flex flex-col h-full border-l border-border">
            {/* Actions area — matches header height so borders align */}
            <div className="flex items-center justify-end gap-2 h-[60px] border-b border-border shrink-0 px-3 overflow-hidden">
                {actions}
            </div>

            {/* Tab bar — h-9 to match content tab bar */}
            <div className="flex items-center h-9 shrink-0 px-3 gap-1">
                <button
                    type="button"
                    onClick={() => setTab("all_files")}
                    className={`relative flex items-center h-full px-2 text-sm transition-colors ${
                        tab === "all_files"
                            ? "text-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                    All files
                    {tab === "all_files" && (
                        <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-foreground rounded-full" />
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => setTab("changes")}
                    className={`relative flex items-center h-full px-2 text-sm transition-colors ${
                        tab === "changes"
                            ? "text-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                    Changes
                    {hasChanges && (
                        <span className="ml-1.5 text-xs opacity-50">
                            {files.length}
                        </span>
                    )}
                    {tab === "changes" && (
                        <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-foreground rounded-full" />
                    )}
                </button>
            </div>

            {/* Content */}
            {tab === "all_files" && repoPath ? (
                <ScrollArea className="flex-1">
                    <FileTreePanel
                        repoPath={repoPath}
                        onFileSelect={onBrowseFileSelect}
                        activeFile={activeFile}
                    />
                </ScrollArea>
            ) : tab === "all_files" ? (
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs text-muted-foreground/40">
                        No repository selected
                    </p>
                </div>
            ) : hasChanges ? (
                <ScrollArea className="flex-1">
                    <div className="py-1">
                        {files.map((file) => {
                            const isActive = activeFile === file.file;
                            const dir = getDirPath(file.file);
                            const name = getFileName(file.file);

                            return (
                                <button
                                    key={file.file}
                                    type="button"
                                    onClick={() => onDiffFileSelect(file.file)}
                                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                                        isActive
                                            ? "bg-muted text-foreground"
                                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="truncate">
                                            {dir && (
                                                <span className="text-xs text-muted-foreground/50">
                                                    {dir}
                                                </span>
                                            )}
                                            <span
                                                className={`text-sm ${isActive ? "font-medium" : ""}`}
                                            >
                                                {name}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0 text-xs font-mono">
                                        {file.additions > 0 && (
                                            <span className="text-green-500/70">
                                                +{file.additions}
                                            </span>
                                        )}
                                        {file.deletions > 0 && (
                                            <span className="text-red-500/70">
                                                -{file.deletions}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </ScrollArea>
            ) : diffError ? (
                <div className="flex-1 flex items-center justify-center px-4">
                    <p className="text-xs text-destructive/70 text-center">
                        Failed to load diff: {diffError}
                    </p>
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs text-muted-foreground/40">
                        No changes to display
                    </p>
                </div>
            )}
        </div>
    );
}
