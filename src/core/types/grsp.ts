/**
 * grsp shared contract.
 *
 * These are the UI-ready shapes the Rust core returns from Tauri commands
 * (serde `rename_all = "camelCase"`) and the frontend renders. Everything
 * here has already been through the verification layer (SPEC §3): change
 * status, line numbers and excerpts come from git and the worktree, never
 * from agent output.
 *
 * Rust mirror: src-tauri/src/model.rs. Keep the two in sync.
 */

// ── Primitives ─────────────────────────────────────────────

export type AgentKind = "claude" | "codex";

export type ChangeStatus =
    | "new"
    | "changed"
    | "unchanged"
    | "removed"
    | "not_covered";

/** A location the agent claimed, after verification (SPEC §3.1). */
export interface CodeRef {
    file: string;
    startLine: number;
    endLine?: number;
    anchor?: string;
    /** False only for claims kept visible without a ref ("unverified"). */
    verified: boolean;
    /** The line was moved to where the anchor was actually found. */
    snapped?: boolean;
    /** Resolved at mergeBaseSha (removed code) rather than the worktree. */
    atBase?: boolean;
}

export interface ExcerptLine {
    /** 1-based line number in the head version (base version when atBase). */
    n: number;
    text: string;
    sign: "+" | "-" | " ";
    highlight?: boolean;
}

/** Code read by Rust from the worktree (SPEC §3.4). */
export interface Excerpt {
    file: string;
    startLine: number;
    endLine: number;
    lines: ExcerptLine[];
    /** Added / removed line counts for the file, from the DiffMap. */
    added: number;
    removed: number;
    /** True when a block range was capped at 40 lines ("Show all"). */
    truncated: boolean;
    /** Full length of the range before capping. */
    totalLines: number;
}

export interface VerificationReport {
    verified: number;
    dropped: number;
    unverified: number;
    notes: string[];
    /** Distinct files the agent read or searched, from tool activity. */
    filesExplored?: number;
}

// ── Agents & hosts ─────────────────────────────────────────

export interface AgentStatus {
    kind: AgentKind;
    installed: boolean;
    path?: string;
    version?: string;
    /** undefined = not checked yet (needs Re-check ping). */
    signedIn?: boolean;
    /** The command line grsp runs, for display in Settings. */
    command: string;
}

export interface GithubStatus {
    ghInstalled: boolean;
    authenticated: boolean;
    login?: string;
}

export interface OpenPr {
    number: number;
    title: string;
    author: string;
    updatedAt: string;
    url: string;
    headRef: string;
    baseRef: string;
    isDraft: boolean;
}

export interface BranchList {
    local: string[];
    remote: string[];
    defaultBranch: string;
}

// ── Repos & sessions ───────────────────────────────────────

export interface Repo {
    id: string;
    name: string;
    path: string;
    defaultBranch: string;
    remote?: { host: "github"; owner: string; name: string };
    language?: string;
    sidebarOpen: boolean;
}

/** Result of inspecting a folder before adding it (SPEC §5.8). */
export interface RepoInspection {
    isGitRepo: boolean;
    name: string;
    defaultBranch: string;
    remote?: { host: "github"; owner: string; name: string };
    language?: string;
    error?: string;
}

export type SessionSource =
    | { kind: "pr"; number: number; url: string }
    | { kind: "branches"; base: string; head: string };

export type SessionStatus =
    | "preparing"
    | "ready"
    | "stale"
    | "error"
    | "closed";

export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";

export interface PostedReview {
    id: string;
    url: string;
    event: ReviewEvent;
}

export interface CiStatus {
    state: "passing" | "failing" | "pending" | "none";
    passed: number;
    total: number;
}

export interface ReviewSession {
    id: string;
    repoId: string;
    source: SessionSource;
    title: string;
    description: string;
    author: string;
    baseRef: string;
    headRef: string;
    baseSha?: string;
    headSha?: string;
    mergeBaseSha?: string;
    status: SessionStatus;
    error?: string;
    /** From GitHub on refresh; branch sessions stay "open". */
    prState: "open" | "merged" | "closed";
    isOwnPr: boolean;
    ci?: CiStatus;
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    /** Commits on the PR head since the analysed headSha (stale bar). */
    newCommits: number;
    /** Agent passes run for this session (SPEC §4.5). */
    agentPasses: number;
    postedReview?: PostedReview;
    createdAt: string;
    lastOpenedAt: string;
}

export type NewSessionInput =
    | { kind: "url"; url: string }
    | { kind: "pr"; repoId: string; number: number }
    | { kind: "branches"; repoId: string; base: string; head: string };

/** Returned by session_create when the URL's repo hasn't been added. */
export interface RepoNotAddedError {
    code: "repo_not_added";
    owner: string;
    name: string;
}

// ── Analyses ───────────────────────────────────────────────

export type AnalysisKind =
    | "discovery"
    | "questions"
    | "discussion"
    | "review"
    | `walkthrough:${string}`;

export type AnalysisStatus = "pending" | "running" | "done" | "error";

export interface Analysis<T = unknown> {
    sessionId: string;
    kind: AnalysisKind;
    headSha: string;
    status: AnalysisStatus;
    result?: T;
    verification?: VerificationReport;
    error?: string;
    /** Raw-output excerpt shown behind "Details". */
    errorDetails?: string;
    /** Latest one-line agent activity while running (SPEC §4.4). */
    progress?: string;
    startedAt?: string;
    finishedAt?: string;
}

// Discovery (SPEC §5.1)

export type EntryPointKind =
    | "http"
    | "ui"
    | "job"
    | "consumer"
    | "schedule"
    | "cli"
    | "api"
    | "other";

export type AffectedTag = "new" | "changed" | "timing" | "not_covered";

export interface EntryPoint {
    id: string;
    label: string;
    kind: EntryPointKind;
    ref: CodeRef;
    effect: string;
    risk: "high" | "medium" | "low";
    /** Derived by Rust (never by the agent). */
    tag: AffectedTag;
    hasGap: boolean;
}

export interface Mismatch {
    id: string;
    claim: string;
    reality: string;
    refs: CodeRef[];
    entryPointId?: string;
}

export interface Gap {
    ref: CodeRef;
    writeTarget: string;
    explanation: string;
    entryPointId?: string;
}

export interface DiscoveryResult {
    behaviourSummary: string;
    /** True when the PR has no description to compare against. */
    descriptionEmpty: boolean;
    mismatches: Mismatch[];
    /** Already ordered: gaps first, then by risk. Max 12. */
    entryPoints: EntryPoint[];
    gaps: Gap[];
    removed: { ref: CodeRef; name: string }[];
    askSuggestions: string[];
    /** Number of shards when the PR was analysed in parts (SPEC §4.3). */
    shards?: number;
}

// Questions (SPEC §5.2)

export interface ComprehensionQuestion {
    id: string;
    question: string;
    answer: string;
    refs: CodeRef[];
    opened: boolean;
}

export interface QuestionsResult {
    questions: ComprehensionQuestion[];
}

// Discussion (SPEC §5.3)

export interface DiscussionComment {
    id: string;
    author: string;
    body: string;
    createdAt: string;
}

export interface DiscussionThread {
    id: string;
    /** Review threads have a location; issue comments don't. */
    path?: string;
    line?: number;
    resolved: boolean;
    /** ≤12-word gist from the agent; absent until the digest has run. */
    gist?: string;
    comments: DiscussionComment[];
}

export interface DiscussionResult {
    digest: string;
    threads: DiscussionThread[];
    commentCount: number;
}

// Walkthrough (SPEC §5.5)

export type BlockKind =
    | "route"
    | "validation"
    | "service"
    | "policy"
    | "auth"
    | "data_access"
    | "db_write"
    | "event"
    | "external"
    | "job"
    | "ui"
    | "other";

export interface WalkDecision {
    condition: string;
    yes: string;
    no: string;
    ref?: CodeRef;
}

export interface WalkBlock {
    id: string;
    label: string;
    kind: BlockKind;
    ref: CodeRef;
    note: string;
    next: string[];
    decision?: WalkDecision;
    /** Computed from the DiffMap (SPEC §3.2). */
    status: ChangeStatus;
    excerpt: Excerpt;
    /** nextId → false when the edge failed the spot-check (dotted). */
    unconfirmedEdges: string[];
}

export interface WhatIfOption {
    label: string;
    /** Block ids in order. Every id exists in `blocks`. */
    path: string[];
    /** blockId → which branch this input takes at that block's decision. */
    taken?: Record<string, "yes" | "no">;
    /** blockId → note override for this input. */
    notes?: Record<string, string>;
    /** Boundary explanation, e.g. for "€10,000". */
    note?: string;
}

export interface WalkthroughResult {
    entryPointId: string;
    blocks: WalkBlock[];
    /** Default path when there is no what-if. */
    path: string[];
    whatIf?: {
        variable: string;
        options: WhatIfOption[];
    };
}

// Ask (SPEC §5.4)

export interface AskAnswer {
    paragraphs: string[];
    excerpt?: Excerpt;
    refs: CodeRef[];
    confidence: "high" | "medium" | "low";
    grounded: boolean;
}

export interface AskMessage {
    id: string;
    sessionId: string;
    question: string;
    status: "running" | "done" | "error";
    answer?: AskAnswer;
    verification?: VerificationReport;
    error?: string;
    progress?: string;
    headSha: string;
    createdAt: string;
}

// Review (SPEC §5.6)

export type Severity = "blocking" | "should_fix" | "nit";

export interface Finding {
    id: string;
    severity: Severity;
    title: string;
    why: string;
    ref: CodeRef;
    excerpt: Excerpt;
    /** Editable; starts as the agent's suggestedComment. */
    comment: string;
    included: boolean;
    /** "summary" = line is not in the PR diff; posts in the review body. */
    anchoring: "inline" | "summary";
}

export interface ReviewResult {
    findings: Finding[];
    summary: string;
    repoPromptActive: boolean;
}

export interface PostReviewInput {
    event: ReviewEvent;
    body: string;
}

// ── Settings ───────────────────────────────────────────────

export interface GrspSettings {
    reviewPrompt: string;
    agent: AgentKind;
    comprehensionQuestions: boolean;
    showUnchangedBlocks: boolean;
    autoRunReview: boolean;
    traceDepth: 1 | 2 | 3;
}

/** Keys in the `settings` table (value is JSON-encoded). Rust reads these. */
export const SETTINGS_KEYS = {
    reviewPrompt: "review_prompt",
    agent: "agent",
    comprehensionQuestions: "comprehension_questions",
    showUnchangedBlocks: "show_unchanged_blocks",
    autoRunReview: "auto_run_review",
    traceDepth: "trace_depth",
} as const satisfies Record<keyof GrspSettings, string>;

export const DEFAULT_REVIEW_PROMPT =
    "You are reviewing a pull request. Prioritise correctness and data integrity over style. Flag any path where state changes without the checks the PR description promises. Group findings as Blocking, Should fix or Nit. Keep each comment under 80 words and say what to change, not just what is wrong.";

export const DEFAULT_SETTINGS: GrspSettings = {
    reviewPrompt: DEFAULT_REVIEW_PROMPT,
    agent: "claude",
    comprehensionQuestions: true,
    showUnchangedBlocks: true,
    autoRunReview: false,
    traceDepth: 2,
};

// ── Tauri commands ─────────────────────────────────────────

/**
 * Every grsp command: `invoke(name, args)` → result. Arg keys are camelCase
 * on both sides (Tauri converts to snake_case Rust parameters).
 * Commands reject with a string message, except session_create which may
 * reject with a JSON-encoded RepoNotAddedError.
 */
export interface GrspCommands {
    agent_detect: { args: Record<string, never>; result: AgentStatus[] };
    /** Runs the minimal sign-in ping for one agent. */
    agent_recheck: { args: { kind: AgentKind }; result: AgentStatus };

    github_status: { args: Record<string, never>; result: GithubStatus };
    github_list_open_prs: { args: { repoId: string }; result: OpenPr[] };

    repo_inspect: { args: { path: string }; result: RepoInspection };
    repo_list_branches: { args: { repoId: string }; result: BranchList };
    /** Clones owner/name from GitHub into grsp's own folder; returns its path. */
    repo_clone: {
        args: { owner: string; name: string };
        result: { path: string };
    };

    session_create: { args: { input: NewSessionInput }; result: ReviewSession };
    session_list: { args: Record<string, never>; result: ReviewSession[] };
    session_get: { args: { sessionId: string }; result: ReviewSession };
    /** Touches lastOpenedAt, recreates the worktree if needed, checks the head. */
    session_open: { args: { sessionId: string }; result: ReviewSession };
    /** New worktree + DiffMap, re-runs analyses that had already run. */
    session_refresh: { args: { sessionId: string }; result: ReviewSession };
    session_archive: { args: { sessionId: string }; result: null };

    analysis_list: { args: { sessionId: string }; result: Analysis[] };
    /** Start, retry or re-run one analysis. Returns immediately. */
    analysis_run: {
        args: { sessionId: string; kind: AnalysisKind };
        result: null;
    };
    analysis_cancel: {
        args: { sessionId: string; kind: AnalysisKind };
        result: null;
    };

    question_set_opened: {
        args: { sessionId: string; questionId: string };
        result: null;
    };

    ask_list: { args: { sessionId: string }; result: AskMessage[] };
    /** Returns the running message immediately; completion arrives by event. */
    ask_send: {
        args: { sessionId: string; question: string };
        result: AskMessage;
    };
    ask_cancel: { args: { messageId: string }; result: null };

    excerpt_read: {
        args: {
            sessionId: string;
            file: string;
            startLine: number;
            endLine: number;
        };
        result: Excerpt;
    };

    review_update_finding: {
        args: {
            sessionId: string;
            findingId: string;
            comment?: string;
            included?: boolean;
        };
        result: null;
    };
    review_post: {
        args: { sessionId: string; input: PostReviewInput };
        result: PostedReview;
    };
}

// ── Events (Rust → frontend) ───────────────────────────────

export const GRSP_EVENTS = {
    /** Payload: SessionEvent. Session row changed; refetch it. */
    session: "grsp://session",
    /** Payload: AnalysisEvent. Status or progress line changed. */
    analysis: "grsp://analysis",
    /** Payload: AskEvent. */
    ask: "grsp://ask",
} as const;

export interface SessionEvent {
    sessionId: string;
    /** Plain-language preparing step, e.g. "Fetching pull/482/head". */
    progress?: string;
}

export interface AnalysisEvent {
    sessionId: string;
    kind: AnalysisKind;
    status: AnalysisStatus;
    progress?: string;
}

export interface AskEvent {
    sessionId: string;
    messageId: string;
    status: "running" | "done" | "error";
    progress?: string;
}
