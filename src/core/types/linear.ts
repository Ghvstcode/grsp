export interface LinearTeam {
    id: string;
    name: string;
    key: string;
}

export interface LinearProject {
    id: string;
    name: string;
}

export interface LinearIssue {
    id: string;
    identifier: string;
    title: string;
    description: string | undefined;
    url: string;
    priority: number;
    state: { name: string; type: string };
    labels: { name: string }[];
    assignee: { name: string } | undefined;
}

export type LinearSyncSchedule = "manual" | "on_start" | "6h" | "12h" | "daily";

export interface LinearSyncConfig {
    id: string;
    repositoryId: string;
    linearTeamId: string;
    linearTeamName: string;
    linearProjectId: string | undefined;
    linearProjectName: string | undefined;
    autoSync: boolean;
    syncSchedule: LinearSyncSchedule;
    filterLabels: string[] | undefined;
    lastSyncAt: string | undefined;
    createdAt: string;
}
