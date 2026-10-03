export type TaskCategory =
    | "tech_debt"
    | "tests"
    | "docs"
    | "security"
    | "feature"
    | "performance"
    | "dx"
    | "observability"
    | "general";

export type TaskState =
    | "pending"
    | "in_progress"
    | "review"
    | "done"
    | "dismissed"
    | "failed";

export type TaskSource = "manual" | "scan" | "linear" | "imported";
export type EstimatedEffort = "low" | "medium" | "high";

export type PrState =
    | "opened"
    | "in_review"
    | "changes_requested"
    | "addressing"
    | "re_review_requested"
    | "approved"
    | "merged"
    | "needs_human_attention";

export interface Task {
    id: string;
    repositoryId: string;
    title: string;
    description: string | undefined;
    category: TaskCategory;
    state: TaskState;
    sortOrder: number;
    notes: string | undefined;
    prUrl: string | undefined;
    linesAdded: number | undefined;
    linesRemoved: number | undefined;
    source: TaskSource;
    estimatedEffort: EstimatedEffort | undefined;
    filesInvolved: string[] | undefined;
    baseBranch: string | undefined;
    branchName: string | undefined;
    worktreePath: string | undefined;
    commitSha: string | undefined;
    sessionId: string | undefined;
    tokensUsed: number;
    retryCount: number;
    lastError: string | undefined;
    startedAt: string | undefined;
    completedAt: string | undefined;
    linearIssueId: string | undefined;
    linearIdentifier: string | undefined;
    linearUrl: string | undefined;
    prState: PrState | undefined;
    prNumber: number | undefined;
    prReviewCycles: number;
    createdAt: string;
    updatedAt: string;
}

export interface PrReview {
    id: string;
    taskId: string;
    githubReviewId: number;
    reviewer: string;
    state: "approved" | "changes_requested" | "commented" | "dismissed";
    body: string | undefined;
    submittedAt: string;
    createdAt: string;
}

export type PrCommentKind = "inline" | "issue" | "review_summary";

export interface PrComment {
    id: string;
    taskId: string;
    githubCommentId: number;
    kind: PrCommentKind;
    inReplyToId: number | undefined;
    reviewer: string;
    body: string;
    path: string | undefined;
    line: number | undefined;
    side: "LEFT" | "RIGHT" | undefined;
    commitId: string | undefined;
    classification: "actionable" | "conversational" | "resolved" | undefined;
    ourReply: string | undefined;
    addressedInCommit: string | undefined;
    createdAt: string;
    updatedAt: string;
}

export interface TaskEvent {
    id: string;
    taskId: string;
    eventType: string;
    field: string | undefined;
    oldValue: string | undefined;
    newValue: string | undefined;
    comment: string | undefined;
    createdAt: string;
}

export type MessageRole = "user" | "agent" | "system";

export interface TaskMessage {
    id: string;
    taskId: string;
    role: MessageRole;
    content: string;
    metadata: Record<string, unknown> | undefined;
    createdAt: string;
}
