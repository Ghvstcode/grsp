export type ScheduleMode = "always" | "scheduled" | "manual";

export interface AgentConfig {
    repositoryId: string;
    enabled: boolean;
    scheduleMode: ScheduleMode;
    scheduleWindowStart: string | undefined;
    scheduleWindowEnd: string | undefined;
    scheduleTimezone: string;
    scanIntervalMinutes: number;
    lastScanAt: string | undefined;
    lastWorkAt: string | undefined;
    priority: number;
    /** Whether the repo participates in task discovery via scans. */
    scanEnabled: boolean;
}

export interface BudgetConfig {
    weeklyTokenBudget: number;
    maxUsagePercent: number;
    reservePercent: number;
    billingMode: "subscription" | "api";
}

export interface BudgetStatus {
    weeklyTokenBudget: number;
    maxUsagePercent: number;
    reservePercent: number;
    tokensUsedToday: number;
    tokensUsedThisWeek: number;
    tokensAvailableForSustn: number;
    budgetExhausted: boolean;
    source: string;
}

export type TaskPhase = "planning" | "implementing" | "reviewing";

export interface CurrentTask {
    taskId: string;
    repositoryId: string;
    phase: TaskPhase;
    startedAt: string;
}

export interface EngineStatus {
    running: boolean;
    /** First running task, kept for backward compatibility. */
    currentTask: CurrentTask | undefined;
    /** All currently running tasks. */
    runningTasks: CurrentTask[];
    /** Maximum number of tasks that can run concurrently. */
    concurrencyLimit: number;
}

export interface ContentBlock {
    kind: "text" | "tool_use" | "tool_result" | "thinking" | "result";
    text: string | undefined;
    toolName: string | undefined;
    toolTarget: string | undefined;
}

export interface TaskOutputEvent {
    taskId: string;
    eventType: string | undefined;
    blocks: ContentBlock[];
    raw: string;
    timestamp: string;
}

export interface ScanResult {
    success: boolean;
    tasksFound: ScannedTask[];
    error: string | undefined;
    tokensUsed: number;
}

export interface ScannedTask {
    title: string;
    description: string;
    category: string;
    estimatedEffort: string;
    filesInvolved: string[];
    priority: number;
}

export interface WorkResult {
    success: boolean;
    phaseReached: TaskPhase;
    branchName: string | undefined;
    commitSha: string | undefined;
    filesModified: string[];
    summary: string | undefined;
    error: string | undefined;
    sessionId: string | undefined;
}

export interface AgentRun {
    id: string;
    repositoryId: string;
    taskId: string | undefined;
    runType: "scan" | "plan" | "implement" | "review";
    startedAt: string;
    completedAt: string | undefined;
    status: "running" | "success" | "failed" | "timeout";
    tokensUsed: number;
    error: string | undefined;
    output: string | undefined;
}
