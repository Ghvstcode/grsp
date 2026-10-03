export type BranchPrefixMode = "sustn" | "custom" | "none";
export type BranchNameStyle = "slug" | "short-hash" | "task-id";
export type AgentMode = "scheduled" | "always" | "manual";
export type ScheduleDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type ScanFrequency = "on-push" | "6h" | "12h" | "daily" | "manual";

export interface GlobalSettings {
    // General
    notificationsEnabled: boolean;
    soundEnabled: boolean;
    soundPreset: string;
    autoCreatePrs: boolean;
    deleteBranchOnDismiss: boolean;

    // Git & Branches
    branchPrefixMode: BranchPrefixMode;
    branchPrefixCustom: string;
    branchNameStyle: BranchNameStyle;
    defaultBaseBranch: string;
    remoteOrigin: string;

    // Scheduling
    agentMode: AgentMode;
    scheduleDays: ScheduleDay[];
    scheduleStart: string;
    scheduleEnd: string;
    scheduleTimezone: string;
    scanFrequency: ScanFrequency;

    // Budget
    budgetCeilingPercent: number;
    showBudgetInSidebar: boolean;

    // Integrations
    linearApiKey: string;
    linearEnabled: boolean;

    // PR Lifecycle
    prLifecycleEnabled: boolean;
    maxReviewCycles: number;

    // Parallel execution
    concurrencyLimit: number;
}

export interface ProjectOverrides {
    repositoryId: string;
    overrideBaseBranch: string | undefined;
    overrideRemoteOrigin: string | undefined;
    overrideBranchPrefixMode: BranchPrefixMode | undefined;
    overrideBranchPrefixCustom: string | undefined;
    overrideBudgetCeilingPercent: number | undefined;
    overridePrAutoReply: boolean | undefined;
    agentPreferences: string | undefined;
    scanPreferences: string | undefined;
}

export type SettingsSection =
    | "general"
    | "git"
    | "scheduling"
    | "budget"
    | "integrations"
    | "account"
    | `project-${string}`;
