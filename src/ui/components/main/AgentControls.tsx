import { Play, Pause, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@ui/components/ui/button";
import { useAgentConfig, useUpdateAgentConfig } from "@core/api/useEngine";

interface AgentControlsProps {
    repositoryId: string;
    repoPath: string;
    defaultBranch: string;
    isScanning: boolean;
    onScan: () => void;
}

export function AgentControls({
    repositoryId,
    isScanning,
    onScan,
}: AgentControlsProps) {
    const { data: agentConfig } = useAgentConfig(repositoryId);
    const updateConfig = useUpdateAgentConfig();

    const isEnabled = agentConfig?.enabled ?? true;

    function toggleAgent() {
        updateConfig.mutate({
            repositoryId,
            enabled: !isEnabled,
        });
    }

    return (
        <div className="flex items-center gap-1">
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={toggleAgent}
                disabled={updateConfig.isPending}
                title={isEnabled ? "Pause agent" : "Resume agent"}
            >
                {isEnabled ? (
                    <Pause className="h-3.5 w-3.5" />
                ) : (
                    <Play className="h-3.5 w-3.5" />
                )}
            </Button>

            <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                onClick={onScan}
                disabled={isScanning}
            >
                {isScanning ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                    <RefreshCw className="h-3 w-3" />
                )}
                <span className="text-xs">Scan</span>
            </Button>
        </div>
    );
}
