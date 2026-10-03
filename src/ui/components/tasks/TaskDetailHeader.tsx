import { useState } from "react";
import {
    ArrowLeft,
    Trash2,
    GitBranch,
    Copy,
    Check,
    ExternalLink,
    MonitorDot,
    Terminal,
    FolderOpen,
    MoreHorizontal,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    TooltipProvider,
} from "@ui/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@ui/components/ui/dropdown-menu";
import { GitPullRequest } from "lucide-react";
import type { Task, PrState } from "@core/types/task";

function prStateDisplayLabel(state: PrState): string {
    switch (state) {
        case "opened":
            return "PR Opened";
        case "in_review":
            return "In Review";
        case "changes_requested":
            return "Changes Requested";
        case "addressing":
            return "Addressing Feedback";
        case "re_review_requested":
            return "Re-review Requested";
        case "approved":
            return "Approved";
        case "merged":
            return "Merged";
        case "needs_human_attention":
            return "Needs Your Attention";
        default:
            return state;
    }
}

function prStateChipStyle(state: PrState): string {
    switch (state) {
        case "opened":
        case "in_review":
        case "re_review_requested":
            return "border-blue-400/40 bg-blue-500/10 text-blue-500";
        case "changes_requested":
            return "border-amber-400/40 bg-amber-500/10 text-amber-500";
        case "addressing":
            return "border-violet-400/40 bg-violet-500/10 text-violet-500";
        case "approved":
            return "border-green-400/40 bg-green-500/10 text-green-500";
        case "needs_human_attention":
            return "border-red-400/40 bg-red-500/10 text-red-500";
        default:
            return "border-border text-muted-foreground";
    }
}

interface TaskDetailHeaderProps {
    task: Task;
    repoPath: string | undefined;
    primaryAction?: React.ReactNode;
    overflowItems?: React.ReactNode;
    onBack: () => void;
    onUpdateTitle: (title: string) => void;
    onDelete: () => void;
}

export function TaskDetailHeader({
    task,
    repoPath,
    primaryAction,
    overflowItems,
    onBack,
    onUpdateTitle,
    onDelete,
}: TaskDetailHeaderProps) {
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState(task.title);
    const [copied, setCopied] = useState(false);

    function handleTitleSubmit() {
        const trimmed = titleDraft.trim();
        if (trimmed && trimmed !== task.title) {
            onUpdateTitle(trimmed);
        } else {
            setTitleDraft(task.title);
        }
        setIsEditingTitle(false);
    }

    function handleCopyBranch() {
        if (!task.branchName) return;
        void navigator.clipboard.writeText(task.branchName).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    async function handleOpenIn(
        app: "vscode" | "cursor" | "terminal" | "finder",
    ) {
        if (!repoPath) return;
        const appNames: Record<string, string> = {
            vscode: "Visual Studio Code",
            cursor: "Cursor",
            terminal: "Terminal",
        };
        try {
            if (app === "finder") {
                await openPath(repoPath);
            } else {
                await invoke("open_in_app", {
                    path: repoPath,
                    app: appNames[app],
                });
            }
        } catch (err) {
            console.error(`Failed to open in ${app}:`, err);
        }
    }

    return (
        <div className="flex h-[60px] items-center gap-2 border-b border-border px-4">
            {/* Back */}
            <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0"
                onClick={onBack}
            >
                <ArrowLeft className="h-3.5 w-3.5" />
            </Button>

            <div className="h-4 w-px bg-border shrink-0" />

            {/* Title */}
            <div className="min-w-0 flex-1">
                {isEditingTitle ? (
                    <Input
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onBlur={handleTitleSubmit}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleTitleSubmit();
                            if (e.key === "Escape") {
                                setTitleDraft(task.title);
                                setIsEditingTitle(false);
                            }
                        }}
                        autoFocus
                        className="h-7 text-sm font-medium"
                    />
                ) : (
                    <TooltipProvider>
                        <Tooltip delayDuration={400}>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTitleDraft(task.title);
                                        setIsEditingTitle(true);
                                    }}
                                    className="block w-full truncate text-left text-sm font-medium text-foreground hover:text-foreground/70 transition-colors"
                                >
                                    {task.title}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent
                                side="bottom"
                                align="start"
                                className="max-w-sm"
                            >
                                <p>{task.title}</p>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                    Click to edit
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>

            {/* Linear badge */}
            {task.source === "linear" && task.linearIdentifier && (
                <TooltipProvider>
                    <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                onClick={() => {
                                    if (task.linearUrl) {
                                        void openUrl(task.linearUrl);
                                    }
                                }}
                                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-mono text-muted-foreground hover:bg-muted transition-colors shrink-0"
                            >
                                <ExternalLink className="h-3 w-3 shrink-0 opacity-40" />
                                {task.linearIdentifier}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="text-xs">Open in Linear</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}

            {/* Branch chip */}
            {task.branchName && (
                <TooltipProvider>
                    <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                onClick={handleCopyBranch}
                                className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-mono text-muted-foreground hover:bg-muted transition-colors shrink-0"
                            >
                                <GitBranch className="h-3 w-3 shrink-0" />
                                <span className="truncate max-w-[160px]">
                                    {task.branchName}
                                </span>
                                {copied ? (
                                    <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                                ) : (
                                    <Copy className="h-3 w-3 shrink-0 opacity-40" />
                                )}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="font-mono text-xs">
                                {task.branchName}
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                                {copied ? "Copied!" : "Click to copy"}
                            </p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}

            {/* PR lifecycle state */}
            {task.prState && task.prState !== "merged" && (
                <div
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium shrink-0 ${prStateChipStyle(task.prState)}`}
                >
                    <GitPullRequest className="h-3 w-3 shrink-0" />
                    {prStateDisplayLabel(task.prState)}
                    {task.prReviewCycles > 0 && (
                        <span className="text-[10px] opacity-60">
                            ({task.prReviewCycles})
                        </span>
                    )}
                </div>
            )}

            {/* Primary action */}
            {primaryAction}

            {/* Open in… */}
            {repoPath && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className="group h-7 gap-1.5 text-xs shrink-0 transition-all duration-200 hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none"
                        >
                            <ExternalLink className="h-3 w-3" />
                            Open in…
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                            Editor
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                            onClick={() => void handleOpenIn("vscode")}
                        >
                            <MonitorDot className="h-4 w-4 mr-2" />
                            VS Code
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => void handleOpenIn("cursor")}
                        >
                            <MonitorDot className="h-4 w-4 mr-2" />
                            Cursor
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => void handleOpenIn("terminal")}
                        >
                            <Terminal className="h-4 w-4 mr-2" />
                            Terminal
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => void handleOpenIn("finder")}
                        >
                            <FolderOpen className="h-4 w-4 mr-2" />
                            Finder
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            {/* Overflow menu */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
                    >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {overflowItems}
                    {overflowItems && <DropdownMenuSeparator />}
                    <DropdownMenuItem
                        onClick={onDelete}
                        className="text-destructive focus:text-destructive"
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete task
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
