import { AlertTriangle } from "lucide-react";
import {
    useBudgetStatus,
    useEngineStatus,
    useAgentConfig,
} from "@core/api/useEngine";
import { useAppStore } from "@core/store/app-store";

const scheduleLabels: Record<string, string> = {
    always: "Always on",
    scheduled: "Scheduled",
    manual: "Manual",
};

export function AiStatusCard() {
    const selectedRepositoryId = useAppStore((s) => s.selectedRepositoryId);
    const { data: budget } = useBudgetStatus();
    const { data: engineStatus } = useEngineStatus();
    const { data: agentConfig } = useAgentConfig(selectedRepositoryId);

    const isWorking = !!engineStatus?.currentTask;
    const isEnabled = agentConfig?.enabled ?? true;
    const isExhausted = budget?.budgetExhausted ?? false;

    // Budget bar — uses daily budget (weekly / 7) to match backend calculation
    const dailyBudget = budget
        ? ((budget.weeklyTokenBudget / 7) * budget.maxUsagePercent) / 100
        : 0;
    const available = budget?.tokensAvailableForSustn ?? 0;
    const usedPercent =
        dailyBudget > 0 ? ((dailyBudget - available) / dailyBudget) * 100 : 0;
    const remainingPercent = 100 - usedPercent;

    // Bar color
    let barColor = "bg-foreground";
    if (remainingPercent <= 10) barColor = "bg-red-500";
    else if (remainingPercent <= 30) barColor = "bg-amber-500";

    // Status display
    let icon: React.ReactNode;
    let line1: string;
    let line2: string;

    if (isExhausted) {
        icon = <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />;
        line1 = "Budget limit";
        line2 = "Resets tomorrow";
    } else if (!isEnabled) {
        icon = (
            <svg
                width="12"
                height="12"
                viewBox="0 0 42 42"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="shrink-0 text-sidebar-foreground/40"
            >
                <path
                    d="M24.3012 1.73511V19.0934M24.3012 36.4518V19.0934M36.5754 6.81925L12.027 31.3676M24.3012 19.0934L6.94287 19.0934M36.5754 31.3676L12.027 6.81925"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        );
        line1 = "Paused";
        line2 =
            scheduleLabels[agentConfig?.scheduleMode ?? "always"] ??
            "Always on";
    } else if (isWorking) {
        icon = (
            <svg
                width="12"
                height="12"
                viewBox="0 0 42 42"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="shrink-0 animate-slow-spin text-sidebar-foreground"
            >
                <path
                    d="M24.3012 1.73511V19.0934M24.3012 36.4518V19.0934M36.5754 6.81925L12.027 31.3676M24.3012 19.0934L6.94287 19.0934M36.5754 31.3676L12.027 6.81925"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        );
        line1 = "Working...";
        line2 = engineStatus?.currentTask?.taskId
            ? `Task ${engineStatus.currentTask.taskId.slice(0, 8)}`
            : "Implementing";
    } else {
        icon = (
            <svg
                width="12"
                height="12"
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
        );
        line1 = "AI active";
        line2 =
            scheduleLabels[agentConfig?.scheduleMode ?? "always"] ??
            "Always on";
    }

    return (
        <div className="px-3 pb-3">
            <div className="rounded-lg border border-sidebar-border/60 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                    {icon}
                    <div className="min-w-0">
                        <p className="text-[11px] font-medium text-sidebar-foreground leading-tight">
                            {line1}
                        </p>
                        <p className="text-[10px] text-sidebar-foreground/60 leading-tight mt-0.5">
                            {line2}
                        </p>
                    </div>
                </div>

                {/* Budget bar */}
                {budget && (
                    <div className="mt-2.5">
                        <div className="h-1 w-full rounded-full bg-sidebar-border/40 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${barColor}`}
                                style={{
                                    width: `${Math.max(0, Math.min(100, remainingPercent))}%`,
                                }}
                            />
                        </div>
                        <p className="mt-1 text-[10px] tabular-nums text-sidebar-foreground/50">
                            {Math.round(available / 1000)}k remaining
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
