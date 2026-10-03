import { useMemo } from "react";
import {
    Plus,
    ArrowDownToLine,
    Loader2,
    RefreshCw,
    Pause,
    Play,
} from "lucide-react";
import { Button } from "@ui/components/ui/button";
import { useGitPull, useUpdateDefaultBranch } from "@core/api/useRepositories";
import { useAgentConfig, useUpdateAgentConfig } from "@core/api/useEngine";
import { BranchSelector } from "@ui/components/main/BranchSelector";

interface TaskListHeaderProps {
    projectName: string;
    repositoryId: string;
    repositoryPath: string;
    lastPulledAt: string | undefined;
    defaultBranch: string;
    isScanning: boolean;
    onAddTask: () => void;
    onScan: () => void;
}

function formatRelativeTime(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr + "Z").getTime();
    const diffMs = now - then;

    if (diffMs < 0) return "just now";

    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return "just now";

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;

    const weeks = Math.floor(days / 7);
    return `${weeks}w`;
}

export function TaskListHeader({
    projectName,
    repositoryId,
    repositoryPath,
    lastPulledAt,
    defaultBranch,
    isScanning,
    onAddTask,
    onScan,
}: TaskListHeaderProps) {
    const gitPull = useGitPull();
    const updateBranch = useUpdateDefaultBranch();
    const { data: agentConfig } = useAgentConfig(repositoryId);
    const updateConfig = useUpdateAgentConfig();

    const isAgentEnabled = agentConfig?.enabled ?? true;

    const relativeTime = useMemo(
        () => (lastPulledAt ? formatRelativeTime(lastPulledAt) : null),
        [lastPulledAt],
    );

    function handleBranchChange(branch: string) {
        updateBranch.mutate({ repositoryId, branch });
    }

    function toggleAgent() {
        updateConfig.mutate({ repositoryId, enabled: !isAgentEnabled });
    }

    return (
        <div className="flex h-[60px] items-center justify-between border-b border-border px-4">
            {/* Left: identity */}
            <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium text-foreground">
                    {projectName}
                </h2>
                <span className="text-muted-foreground/25">/</span>
                <BranchSelector
                    repositoryId={repositoryId}
                    repoPath={repositoryPath}
                    currentBranch={defaultBranch}
                    onBranchChange={handleBranchChange}
                />
            </div>

            {/* Right: all actions */}
            <div className="flex items-center gap-1.5">
                <Button
                    variant="outline"
                    size="sm"
                    className="group h-7 gap-1.5 text-xs transition-all duration-200 hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none"
                    onClick={() =>
                        gitPull.mutate({
                            path: repositoryPath,
                            repositoryId,
                        })
                    }
                    disabled={gitPull.isPending}
                    title={
                        gitPull.isError
                            ? `Pull failed: ${gitPull.error.message}`
                            : "Pull latest changes"
                    }
                >
                    {gitPull.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <ArrowDownToLine className="h-3 w-3 transition-transform duration-300 group-hover:translate-y-0.5" />
                    )}
                    Get Latest
                    {relativeTime && (
                        <span className="text-[10px] tabular-nums opacity-50">
                            · {relativeTime}
                        </span>
                    )}
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="group h-7 gap-1.5 text-xs transition-all duration-200 hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none"
                    onClick={toggleAgent}
                    disabled={updateConfig.isPending}
                >
                    {isAgentEnabled ? (
                        <Pause className="h-3 w-3 transition-transform duration-200 group-hover:scale-125" />
                    ) : (
                        <Play className="h-3 w-3 transition-transform duration-200 group-hover:scale-125" />
                    )}
                    {isAgentEnabled ? "Pause" : "Resume"}
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="group h-7 gap-1.5 text-xs transition-all duration-200 hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none"
                    onClick={onScan}
                    disabled={isScanning}
                >
                    {isScanning ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <RefreshCw className="h-3 w-3 transition-transform duration-500 group-hover:rotate-180" />
                    )}
                    Scan
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="group h-7 gap-1.5 text-xs transition-all duration-200 hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none"
                    onClick={onAddTask}
                >
                    <Plus className="h-3 w-3 transition-transform duration-300 group-hover:rotate-90" />
                    Add Task
                </Button>
            </div>
        </div>
    );
}
