export interface ChangelogImage {
    src: string;
    alt: string;
}

export interface ChangelogEntry {
    version: string;
    date: string; // e.g. "Feb 23rd, 2026"
    title: string;
    description?: string;
    image?: ChangelogImage;
    features?: string[];
    improvements?: string[];
    fixes?: string[];
}

export const changelog: ChangelogEntry[] = [
    {
        version: "0.6.0",
        date: "Apr 24th, 2026",
        title: "Worktree Engine — Parallel Tasks, Live Agent View & PR Import",
        description:
            "Each task now runs in its own git worktree, unlocking real parallel execution. A new Agent tab streams Claude's output live, existing PRs can be imported as tasks, and the auto-reply loop now addresses every kind of PR comment.",
        image: {
            src: "/changelog/0.6.0-agent-tab.png",
            alt: "Agent tab streaming live Claude CLI output during a task run",
        },
        features: [
            "Worktree engine — every task executes in an isolated git worktree, so concurrent runs no longer step on each other's branch state",
            "Parallel task execution — run up to 10 tasks at once (default 5), configurable in Settings → General. Scans count against the same pool so Claude CLI is never over-subscribed",
            "Agent tab with live streaming — watch Claude's text, tool uses, and structured results stream into the task detail view in real time instead of waiting on an opaque status banner",
            "PR import — pull an existing GitHub pull request into SUSTN as a task so the auto-reply + review loop can pick up a PR you opened by hand",
            "Full PR comment coverage — the watcher now addresses inline review comments, issue-level PR comments, and review-summary bodies (previously only inline comments were handled)",
            "Per-repo scan toggle — disable automatic AI scans on repos that only exist to host imported PRs, or pause scanning on a repo without removing it",
        ],
        improvements: [
            "Agent events persisted to SQLite so the streaming log survives app restarts and tab switches",
            "Structured result cards in the Agent tab render review/implement JSON (pass status, issues by severity, files modified) with syntax-highlighted diffs",
            "PR lifecycle tick processes active PRs with `Promise.allSettled` so multiple PRs sync and address concurrently instead of one-at-a-time",
            "Bot-authored replies are tagged with a hidden `<!-- sustn:task=... -->` marker so they're filtered out on the next fetch without relying on GitHub user identity",
            "Daily budget reserves estimated tokens up front when a task starts, so concurrent starts can't over-commit the day's budget",
        ],
        fixes: [
            "Resolved-thread filter is now scoped to inline comments, so issue comments sharing an ID with a resolved inline thread are no longer dropped",
            "Imported PR repos no longer get retroactively scanned — `scan_enabled` defaults off for PR-import repos",
            "Concurrency limit persists across restarts via `useStartupRecovery` syncing the stored value to the Rust engine at boot",
        ],
    },
    {
        version: "0.5.0",
        date: "Apr 3rd, 2026",
        title: "PR Lifecycle & Auto-Reply",
        description:
            "Full pull request lifecycle management with GitHub comment sync, inline review threads in the diff viewer, and automatic AI replies to PR conversations.",
        image: {
            src: "/changelog/0.5.0-pr-lifecycle.png",
            alt: "PR review with inline comments and conversation threads",
        },
        features: [
            "PR lifecycle management — track PRs from creation through review, addressing feedback, and merge, with real-time status in the activity timeline",
            "GitHub PR comments in diff viewer — review comments from GitHub are displayed inline alongside the code diff for full context",
            "Auto-reply for PR comments — SUSTN automatically responds to conversational PR comments using a unified Claude session, with a per-repo toggle to enable or disable",
            "React error boundaries — component-level crash isolation prevents a single UI failure from taking down the entire app",
        ],
        improvements: [
            "Replaced heuristic comment classifier with a unified Claude session for more accurate review vs. conversational comment handling",
            "Compact single-card design for PR review comment threads with tighter spacing",
            "PR lifecycle events now render in the activity timeline with clear status indicators",
        ],
        fixes: [
            "Fixed `null` `comment_id` in Claude review responses causing failed comment syncs",
            "Fixed comment classification so conversational comments are processed without requiring a formal review cycle",
            "PR comments now always sync correctly — removed stale filter that was hiding the bot's own replies",
            "Bypassed worker queue for `engine_address_review` to call Claude directly, preventing stuck addressing state",
        ],
    },
    {
        version: "0.4.0",
        date: "Mar 26th, 2026",
        title: "Kanban Board & Task Filtering",
        description:
            "A new Kanban board view for visualizing tasks by status, plus powerful filtering and search to find exactly what you need.",
        image: {
            src: "/changelog/kanban_board.png",
            alt: "Kanban board view with task columns",
        },
        features: [
            "Kanban board view — visualize tasks across Pending, In Progress, Review, Done, Failed, and Dismissed columns with full drag-and-drop support",
            "Task search — full-text search across task titles and descriptions, with `Cmd/Ctrl+F` keyboard shortcut",
            "Advanced filtering — filter tasks by state, category (Feature, Tech Debt, Tests, Docs, Security, Performance, DX, Observability), and source (Manual, AI Scan, Linear)",
            "View mode switcher — toggle between list view and Kanban board from the task toolbar",
            "Update dialog — persistent modal when a new version is available, with 'Later' and 'Install & Restart' buttons and download progress spinner",
            "App version display — current version (e.g. SUSTN v0.4.0) now shown in the Account section of Settings",
        ],
        improvements: [
            "New task toolbar with integrated search, filter popover, and view toggle",
            "Filter chips display dynamic counts per state for quick overview",
            "Linear tasks now recognized as a distinct task source for filtering",
        ],
        fixes: [
            "Default branch detection — repositories using `master` or non-standard default branches are now auto-detected when added, fixing branch creation failures",
            "Budget calculation switched to daily mode — heavy usage on one day no longer exhausts the budget for the rest of the week",
            "Default weekly token budget increased from 700K to 5M to match typical subscription capacity",
        ],
    },
    {
        version: "0.3.0",
        date: "Mar 23rd, 2026",
        title: "Linear Integration",
        description:
            "Import issues from Linear as SUSTN tasks, with full lifecycle support from sync through execution to PR link-back.",
        image: {
            src: "/changelog/linear_integration.png",
            alt: "Linear integration settings and task view",
        },
        features: [
            "Linear issue import — sync issues from any Linear team and project as SUSTN tasks, with automatic category inference from labels and effort from priority",
            "Configurable auto-sync schedules: manual, on launch, every 6h, 12h, or daily",
            "New Integrations tab in Settings for Linear API key management, connection testing, and per-project sync configuration",
            "Linear identifier badges on tasks (e.g. SYN-460), clickable to open the issue in Linear",
            "Automatic PR link-back — when SUSTN creates a PR for a Linear issue, it posts a comment on the Linear issue with the PR link",
        ],
        improvements: [
            "Linear-style branch names for imported issues (e.g. sustn/syn-460-improve-accounts-table)",
            "Linear tasks sort to the top of the task list for higher visibility",
            "Tauri-side scan command now returns Linear metadata (identifier, URL) for imported tasks",
        ],
    },
    {
        version: "0.2.0",
        date: "Mar 18th, 2026",
        title: "New Diff Viewer & Inline Comments",
        description:
            "A completely overhauled diff viewer powered by @pierre/diffs, with inline commenting for precise code review feedback.",
        image: {
            src: "/changelog/inline_comments_diff.png",
            alt: "New diff viewer with inline comments",
        },
        features: [
            "New diff renderer built on @pierre/diffs with Shiki-powered syntax highlighting, split and unified views, and word-level inline change detection",
            "Inline comments — click the gutter to leave comments on specific diff lines, which are sent as structured feedback when requesting changes",
            "Line selection — click and drag to highlight line ranges in the diff during review",
        ],
        improvements: [
            "Smarter review loop: critical issues (bugs, security, data loss) are distinguished from non-critical suggestions — tasks soft-pass after max retries when only style nits remain",
            "Increased max review retries from 2 to 4 for more thorough agent self-correction",
            "Cleaner error messages — removed raw Rust Debug formatting from user-facing error strings",
        ],
        fixes: [
            "Pre-flight environment checks now detect common issues (Xcode license not accepted, git not found) before starting a task, with an in-app 'Fix in Terminal' button",
            "Environment issue listener now stays active across all routes including settings",
        ],
    },
    {
        version: "0.1.1",
        date: "Feb 24th, 2026",
        title: "Preflight Fix",
        description:
            "Fixes preflight environment checks when running as a macOS app.",
        fixes: [
            "Claude Code, Git, and GitHub CLI preflight checks now resolve binaries from well-known install paths instead of relying on shell `PATH`, fixing false negatives when launched outside a terminal",
        ],
    },
    {
        version: "0.1.0",
        date: "Feb 24th, 2026",
        title: "Initial Beta Release",
        description:
            "The first release of sustn. Point it at your repos, review the backlog, and let AI do the work.",
        image: {
            src: "/changelog/sustn_screenshot.png",
            alt: "sustn screenshot",
        },
        features: [
            "Repository scanning and task discovery",
            "Drag-and-drop task prioritization",
            "One-click PR creation from completed branches",
            "macOS desktop app with native Tauri shell",
        ],
    },
];
