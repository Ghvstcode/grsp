import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    ArrowUp,
    Play,
    ExternalLink,
    CheckCircle2,
    MessageSquarePlus,
    RotateCcw,
    XCircle,
    X,
    Loader2,
    AlertTriangle,
    LayoutDashboard,
    Terminal,
} from "lucide-react";
import {
    useTask,
    useUpdateTask,
    useDeleteTask,
    useSendMessage,
    useTaskMessages,
} from "@core/api/useTasks";
import { useRepositories } from "@core/api/useRepositories";
import {
    useStartTask,
    useEngineStatus,
    usePushBranch,
    useCreatePr,
    useDiffStat,
    useDiff,
    useTaskEventListeners,
} from "@core/api/useEngine";
import { useQueueStore } from "@core/store/queue-store";
import { useGlobalSettings, useProjectOverrides } from "@core/api/useSettings";
import { usePrComments } from "@core/api/usePrLifecycle";
import { generateBranchName, effectiveBaseBranch } from "@core/utils/branch";
import { useAppStore } from "@core/store/app-store";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { TaskState } from "@core/types/task";
import { Button } from "@ui/components/ui/button";
import { DropdownMenuItem } from "@ui/components/ui/dropdown-menu";
import { TaskDetailHeader } from "./TaskDetailHeader";
import { TaskOverview } from "./TaskOverview";
import { TaskChatTimeline } from "./TaskChatTimeline";
import { TaskDiffViewer } from "./TaskDiffViewer";
import type { InlineComment } from "./TaskDiffViewer";
import { TaskChangedFilesSidebar } from "./TaskChangedFilesSidebar";
import { TaskFilesInvolved } from "./TaskFilesInvolved";
import { TaskStatusBanner } from "./TaskStatusBanner";
import { queuedToast } from "@ui/lib/toast";
import { FileContentViewer } from "./FileContentViewer";
import { ErrorBoundary } from "@ui/components/ErrorBoundary";
import { useTaskOutputStream } from "@ui/hooks/useTaskOutputStream";
import { TaskLiveOutput } from "./TaskLiveOutput";

// ── Constants ───────────────────────────────────────────────

const btnClass =
    "group h-7 gap-1.5 text-xs whitespace-nowrap transition-all duration-200 hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none";

const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 500;
const SIDEBAR_DEFAULT = 350;

// ── Types ───────────────────────────────────────────────────

type TabKind = "diff" | "file";

interface FileTab {
    path: string;
    kind: TabKind;
}

// ── Helpers ─────────────────────────────────────────────────

function getFileName(path: string): string {
    return path.split("/").pop() ?? path;
}

// ── Chat input ─────────────────────────────────────────────

function ChatInput({
    taskId,
    placeholder,
    feedbackMode,
    inlineCommentCount = 0,
    onFeedbackSend,
    onFeedbackCancel,
    onMessageSent,
}: {
    taskId: string;
    placeholder?: string;
    feedbackMode?: boolean;
    inlineCommentCount?: number;
    onFeedbackSend?: (content: string) => void;
    onFeedbackCancel?: () => void;
    onMessageSent?: () => void;
}) {
    const [draft, setDraft] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const sendMessage = useSendMessage();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-focus when feedback mode activates
    useEffect(() => {
        if (feedbackMode && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [feedbackMode]);

    function handleSend() {
        const trimmed = draft.trim();
        if (!trimmed) return;

        if (feedbackMode && onFeedbackSend) {
            onFeedbackSend(trimmed);
            setDraft("");
            if (textareaRef.current) {
                textareaRef.current.style.height = "auto";
            }
            return;
        }

        sendMessage.mutate(
            { taskId, role: "user", content: trimmed },
            {
                onSuccess: () => {
                    setDraft("");
                    if (textareaRef.current) {
                        textareaRef.current.style.height = "auto";
                    }
                    onMessageSent?.();
                },
            },
        );
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
        if (e.key === "Escape" && feedbackMode && onFeedbackCancel) {
            e.preventDefault();
            onFeedbackCancel();
        }
    }

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
        setDraft(e.target.value);
        const el = e.target;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }

    const hasContent = draft.trim().length > 0;

    return (
        <div
            className={`relative overflow-hidden rounded-2xl border transition-all duration-500 ease-out ${
                feedbackMode
                    ? "border-dashed border-amber-500/50 bg-amber-50/[0.03] shadow-[0_0_0_1px_hsl(40_100%_50%/0.15),0_0_16px_-4px_hsl(40_100%_50%/0.1)]"
                    : isFocused
                      ? "border-ring/50 bg-background shadow-[0_0_0_1px_hsl(var(--ring)/0.2),0_0_24px_-4px_hsl(var(--ring)/0.14),0_2px_6px_-2px_hsl(var(--foreground)/0.04)]"
                      : "border-ring/30 bg-background shadow-[0_0_0_1px_hsl(var(--ring)/0.08),0_0_12px_-4px_hsl(var(--ring)/0.06)]"
            }`}
        >
            {/* Shimmer accent line — always alive */}
            {!feedbackMode && (
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
                    <div className="h-full w-1/4 bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent animate-input-shimmer" />
                </div>
            )}

            {/* Feedback mode banner */}
            {feedbackMode && (
                <div className="flex items-center justify-between gap-2 border-b border-dashed border-amber-500/20 bg-amber-500/[0.04] px-4 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <p className="text-xs text-amber-600 dark:text-amber-400 truncate">
                            {inlineCommentCount > 0
                                ? "Your inline comments will be sent with this message."
                                : "Describe what needs to change — the agent will redo this task with your feedback."}
                        </p>
                        {inlineCommentCount > 0 && (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20">
                                <MessageSquarePlus className="h-2.5 w-2.5" />
                                {inlineCommentCount}
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onFeedbackCancel}
                        className="shrink-0 rounded p-0.5 text-amber-600/60 hover:text-amber-600 dark:text-amber-400/60 dark:hover:text-amber-400 transition-colors"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            <textarea
                ref={textareaRef}
                value={draft}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={
                    feedbackMode
                        ? "What should the agent change?"
                        : (placeholder ?? "Add context for the agent...")
                }
                rows={1}
                className="w-full resize-none bg-transparent px-4 pt-3.5 pb-1.5 text-sm leading-relaxed placeholder:text-muted-foreground/35 focus:outline-none"
                style={{ minHeight: "42px", maxHeight: "120px" }}
            />

            <div className="flex items-center justify-between px-3 pb-3">
                {/* Keyboard hint — always visible */}
                <div className="flex items-center gap-1.5">
                    <kbd className="inline-flex h-[18px] items-center rounded border border-border/40 bg-muted/50 px-1 font-mono text-[10px] text-muted-foreground/40 leading-none">
                        ↵
                    </kbd>
                    <span className="text-[10px] text-muted-foreground/30 select-none">
                        to send
                    </span>
                    {feedbackMode && (
                        <>
                            <span className="text-[10px] text-muted-foreground/20 select-none mx-0.5">
                                |
                            </span>
                            <kbd className="inline-flex h-[18px] items-center rounded border border-border/40 bg-muted/50 px-1 font-mono text-[10px] text-muted-foreground/40 leading-none">
                                esc
                            </kbd>
                            <span className="text-[10px] text-muted-foreground/30 select-none">
                                to cancel
                            </span>
                        </>
                    )}
                </div>

                {/* Send button — morphs in when content exists */}
                <button
                    type="button"
                    onClick={handleSend}
                    disabled={!hasContent || sendMessage.isPending}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-300 ease-out ${
                        hasContent
                            ? "bg-foreground text-background shadow-[0_1px_4px_hsl(var(--foreground)/0.2)] hover:scale-105 hover:shadow-[0_2px_8px_hsl(var(--foreground)/0.25)] active:scale-95 active:shadow-none"
                            : "bg-foreground/10 text-muted-foreground/60"
                    }`}
                >
                    {sendMessage.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <ArrowUp
                            className={`h-3.5 w-3.5 transition-transform duration-300 ${hasContent ? "translate-y-0" : "translate-y-0.5"}`}
                        />
                    )}
                </button>
            </div>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────

interface TaskDetailViewProps {
    taskId: string;
}

export function TaskDetailView({ taskId }: TaskDetailViewProps) {
    const { data: task, isLoading } = useTask(taskId);
    const { data: repositories } = useRepositories();
    const queryClient = useQueryClient();
    const updateTask = useUpdateTask();
    const deleteTask = useDeleteTask();
    const startTask = useStartTask();
    const pushBranch = usePushBranch();
    const createPr = useCreatePr();
    const sendMessage = useSendMessage();
    const { data: globalSettings } = useGlobalSettings();
    const { data: projectOverrides } = useProjectOverrides(task?.repositoryId);
    const setSelectedTask = useAppStore((s) => s.setSelectedTask);
    const { data: engineStatus } = useEngineStatus();
    const { data: taskMessages } = useTaskMessages(taskId);
    const enqueue = useQueueStore((s) => s.enqueue);
    const removeFromQueue = useQueueStore((s) => s.remove);
    const isQueued = useQueueStore((s) => s.isQueued(taskId));
    const queuePosition = useQueueStore((s) => s.queuePosition(taskId));

    // ── Live output streaming ──
    const { lines: outputLines, isStreaming } = useTaskOutputStream(taskId);
    const showAgentTab =
        task?.state === "in_progress" || outputLines.length > 0;

    // ── Tab state (typed) ──
    const [openTabs, setOpenTabs] = useState<FileTab[]>([]);
    const [activeTab, setActiveTab] = useState("overview");

    // Auto-switch to Agent tab when task starts running
    const prevStateRef = useRef(task?.state);
    useEffect(() => {
        if (
            prevStateRef.current !== "in_progress" &&
            task?.state === "in_progress"
        ) {
            setActiveTab("agent");
        }
        prevStateRef.current = task?.state;
    }, [task?.state]);

    // ── Feedback mode (Request Changes flow) ──
    const [feedbackMode, setFeedbackMode] = useState(false);

    // ── Inline comments on diff lines ──
    const [inlineComments, setInlineComments] = useState<InlineComment[]>([]);

    // ── Scroll ref ──
    const scrollRef = useRef<HTMLDivElement>(null);
    const scrollToBottom = useCallback(() => {
        requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth",
            });
        });
    }, []);

    // ── Sidebar resize ──
    const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
    const isDraggingSidebar = useRef(false);
    const dragStartRef = useRef({ x: 0, width: 0 });

    // Reset when switching tasks
    useEffect(() => {
        setOpenTabs([]);
        setActiveTab("overview");
        setFeedbackMode(false);
        setInlineComments([]);
    }, [taskId]);

    // Auto-cancel feedback mode if task leaves "review" state
    useEffect(() => {
        if (task?.state !== "review") {
            setFeedbackMode(false);
        }
    }, [task?.state]);

    // Listen for real-time task lifecycle events from the Rust backend
    useTaskEventListeners(taskId, task?.repositoryId);

    // Look up repository for repo path
    const repository = repositories?.find((r) => r.id === task?.repositoryId);
    const repoPath = repository?.path;
    const defaultBranch = repository?.defaultBranch ?? "main";

    // Diff data — fall back to repo defaultBranch if task.baseBranch is missing
    const baseBranch = task?.baseBranch ?? defaultBranch;
    const hasBranch = !!task?.branchName && !!baseBranch;
    const showDiff = task?.state === "review" || task?.state === "done";

    const { data: diffStat, error: diffStatError } = useDiffStat(
        showDiff && hasBranch ? repoPath : undefined,
        showDiff && hasBranch ? baseBranch : undefined,
        showDiff && hasBranch ? task?.branchName : undefined,
    );
    const { data: diffText } = useDiff(
        showDiff && hasBranch ? repoPath : undefined,
        showDiff && hasBranch ? baseBranch : undefined,
        showDiff && hasBranch ? task?.branchName : undefined,
    );

    // PR comments from GitHub
    const { data: prComments } = usePrComments(
        task?.prState ? taskId : undefined,
    );

    const ghCommentsForDiff = useMemo(
        () =>
            (prComments ?? []).map((c) => ({
                id: c.id,
                githubCommentId: c.githubCommentId,
                reviewer: c.reviewer,
                body: c.body,
                path: c.path,
                line: c.line,
                side: c.side,
                classification: c.classification,
                ourReply: c.ourReply,
                addressedInCommit: c.addressedInCommit,
                createdAt: c.createdAt,
            })),
        [prComments],
    );

    const handleReplyToGhComment = useCallback(
        async (commentId: number, body: string) => {
            if (!task?.prUrl || !repoPath) return;
            try {
                const { replyToComment, parseOwnerRepo } =
                    await import("@core/services/github");
                const parsed = parseOwnerRepo(task.prUrl);
                if (!parsed) return;
                await replyToComment(
                    repoPath,
                    parsed.owner,
                    parsed.repo,
                    parsed.number,
                    commentId,
                    body,
                );
                // Update local DB — this UI path only replies to inline
                // review comments, so the kind is always "inline".
                const { setCommentReply } =
                    await import("@core/db/pr-lifecycle");
                await setCommentReply("inline", commentId, body);
                // Invalidate to refresh
                void queryClient.invalidateQueries({
                    queryKey: ["pr-comments", taskId],
                });
            } catch (e) {
                console.error(
                    "[TaskDetailView] reply to GH comment failed:",
                    e,
                );
            }
        },
        [task?.prUrl, repoPath, taskId, queryClient],
    );

    const isReadOnly = task?.state === "done" || task?.state === "dismissed";
    const hasChanges = !!(showDiff && diffStat && diffStat.length > 0);
    const showSidebar =
        !!repoPath &&
        (task?.state === "in_progress" ||
            task?.state === "review" ||
            task?.state === "done");

    // Look up the active tab's kind
    const activeFileTab = openTabs.find((t) => t.path === activeTab);
    const isShowingDiff =
        activeTab !== "overview" && activeFileTab?.kind === "diff";
    const isShowingFile =
        activeTab !== "overview" && activeFileTab?.kind === "file";

    // ── Sidebar resize handlers ──

    const handleResizeStart = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            isDraggingSidebar.current = true;
            dragStartRef.current = { x: e.clientX, width: sidebarWidth };
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
        },
        [sidebarWidth],
    );

    useEffect(() => {
        function onMouseMove(e: MouseEvent) {
            if (!isDraggingSidebar.current) return;
            const delta = dragStartRef.current.x - e.clientX;
            setSidebarWidth(
                Math.min(
                    SIDEBAR_MAX,
                    Math.max(SIDEBAR_MIN, dragStartRef.current.width + delta),
                ),
            );
        }
        function onMouseUp() {
            if (!isDraggingSidebar.current) return;
            isDraggingSidebar.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        }
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, []);

    // ── Callbacks ──

    const handleRequestChanges = useCallback(() => {
        setFeedbackMode(true);
    }, []);

    const handleAddComment = useCallback(
        (comment: Omit<InlineComment, "id">) => {
            const id = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            setInlineComments((prev) => [...prev, { ...comment, id }]);
        },
        [],
    );

    const handleRemoveComment = useCallback((id: string) => {
        setInlineComments((prev) => prev.filter((c) => c.id !== id));
    }, []);

    const handleFeedbackSend = useCallback(
        (content: string) => {
            // Build the full feedback message including inline comments
            let fullContent = content;

            if (inlineComments.length > 0) {
                const commentLines = inlineComments.map((c) => {
                    const file = c.fileName ? `${c.fileName}` : "unknown file";
                    const side = c.side === "additions" ? "new" : "old";
                    return `- **${file}:${c.lineNumber}** (${side}): ${c.text}`;
                });
                fullContent += `\n\n**Inline comments:**\n${commentLines.join("\n")}`;
            }

            sendMessage.mutate({
                taskId,
                role: "user",
                content: fullContent,
            });
            updateTask.mutate({ id: taskId, state: "pending" as TaskState });
            setFeedbackMode(false);
            setInlineComments([]);
            scrollToBottom();
        },
        [taskId, sendMessage, updateTask, scrollToBottom, inlineComments],
    );

    const handleFeedbackCancel = useCallback(() => {
        setFeedbackMode(false);
    }, []);

    if (isLoading || !task) {
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
        );
    }

    function handleUpdateState(state: TaskState) {
        updateTask.mutate({ id: taskId, state });
    }

    function handleUpdateTitle(title: string) {
        updateTask.mutate({ id: taskId, title });
    }

    function handleDelete() {
        deleteTask.mutate(
            { id: taskId, repositoryId: task!.repositoryId },
            { onSuccess: () => setSelectedTask(undefined) },
        );
    }

    function handleStartWork() {
        if (!repoPath || !task || !globalSettings) return;
        const base = effectiveBaseBranch(
            task.baseBranch,
            globalSettings,
            projectOverrides,
            defaultBranch,
        );
        // Reuse existing branch when restarting after "Request Changes"
        const branch =
            task.branchName ??
            generateBranchName(
                task.title,
                task.id,
                globalSettings,
                projectOverrides,
                task,
            );

        // Collect all user messages as context for the agent
        const allUserMessages = taskMessages?.filter((m) => m.role === "user");
        const userMessages =
            allUserMessages && allUserMessages.length > 0
                ? allUserMessages.map((m) => m.content).join("\n\n")
                : undefined;

        // Resume session if task was previously executed and has user feedback
        const resumeSessionId =
            userMessages && task.sessionId ? task.sessionId : undefined;

        const params = {
            taskId: task.id,
            repositoryId: task.repositoryId,
            repoPath,
            taskTitle: task.title,
            taskDescription: task.description ?? "",
            filesInvolved: task.filesInvolved ?? [],
            baseBranch: base,
            branchName: branch,
            userMessages,
            resumeSessionId,
        };

        // If at concurrency capacity, queue this one instead
        const runningCount = engineStatus?.runningTasks?.length ?? 0;
        const limit = engineStatus?.concurrencyLimit ?? 1;
        if (runningCount >= limit) {
            enqueue(params);
            queuedToast();
            return;
        }

        // useStartTask handles persisting in_progress state to DB before
        // invoking the long-running Rust command (ensures cache invalidations
        // from deep scan or other sources always refetch the correct state).
        startTask.mutate(params);
    }

    function handleCancelQueue() {
        removeFromQueue(taskId);
    }

    function handleApproveAndCreatePr() {
        if (!task) return;
        if (task.branchName && !task.prUrl && repoPath) {
            pushBranch.mutate(
                { repoPath, branchName: task.branchName },
                {
                    onSuccess: (pushResult) => {
                        if (!pushResult.success) {
                            sendMessage.mutate({
                                taskId,
                                role: "system",
                                content: `Failed to push branch ${task.branchName}: ${pushResult.error ?? "Unknown error"}`,
                            });
                            return;
                        }

                        // Create PR via gh CLI
                        createPr.mutate(
                            {
                                repoPath: repoPath,
                                branchName: task.branchName!,
                                baseBranch,
                                title: task.title,
                                body: `## Summary\n\n${task.description || task.title}\n\nBranch: \`${task.branchName}\``,
                            },
                            {
                                onSuccess: (pr) => {
                                    const prMatch =
                                        pr.url.match(/\/pull\/(\d+)/);
                                    const prNumber = prMatch
                                        ? parseInt(prMatch[1], 10)
                                        : undefined;
                                    updateTask.mutate({
                                        id: taskId,
                                        prUrl: pr.url,
                                        ...(prNumber
                                            ? {
                                                  prState: "opened" as const,
                                                  prNumber,
                                              }
                                            : {}),
                                    });
                                    sendMessage.mutate({
                                        taskId,
                                        role: "system",
                                        content: `Branch pushed and PR created: ${pr.url}`,
                                    });
                                    // Link PR to Linear issue if applicable
                                    if (
                                        task.linearIssueId &&
                                        globalSettings?.linearApiKey
                                    ) {
                                        void import("@core/services/linear")
                                            .then((m) =>
                                                m.addComment(
                                                    globalSettings.linearApiKey,
                                                    task.linearIssueId!,
                                                    `PR created by [SUSTN](https://sustn.app): ${pr.url}`,
                                                ),
                                            )
                                            .catch((err) =>
                                                console.error(
                                                    "[TaskDetailView] Linear link-back failed:",
                                                    err,
                                                ),
                                            );
                                    }
                                    // Task stays in "review" — PR lifecycle drives transition to "done"
                                },
                                onError: (err) => {
                                    sendMessage.mutate({
                                        taskId,
                                        role: "system",
                                        content: `Branch ${task.branchName} pushed to remote. PR creation failed: ${err instanceof Error ? err.message : String(err)}. Create it manually.`,
                                    });
                                    // Task stays in "review" even on PR failure
                                },
                            },
                        );
                    },
                    onError: (err) => {
                        sendMessage.mutate({
                            taskId,
                            role: "system",
                            content: `Failed to push branch ${task.branchName}: ${err instanceof Error ? err.message : String(err)}`,
                        });
                    },
                },
            );
        } else {
            handleUpdateState("done");
        }
    }

    // ── Tab handlers ──

    function openTab(path: string, kind: TabKind) {
        setOpenTabs((prev) => {
            // If a tab for this path already exists (any kind), just activate it
            if (prev.find((t) => t.path === path)) return prev;
            return [...prev, { path, kind }];
        });
        setActiveTab(path);
    }

    function handleDiffFileSelect(file: string) {
        openTab(file, "diff");
    }

    function handleBrowseFileSelect(file: string) {
        openTab(file, "file");
    }

    function handleCloseTab(path: string) {
        setOpenTabs((prev) => prev.filter((t) => t.path !== path));
        if (activeTab === path) setActiveTab("overview");
    }

    // ── Build primary action for header ──

    let primaryAction: React.ReactNode = null;
    const state = task.state;

    if (state === "pending" && repoPath && isQueued) {
        primaryAction = (
            <Button
                size="sm"
                variant="outline"
                className={btnClass}
                onClick={handleCancelQueue}
            >
                <X className="h-3.5 w-3.5" />
                {queuePosition === 0
                    ? "Up Next"
                    : `Queued #${queuePosition + 1}`}
            </Button>
        );
    } else if (state === "pending" && repoPath) {
        primaryAction = (
            <Button
                size="sm"
                className={btnClass}
                onClick={handleStartWork}
                disabled={startTask.isPending}
            >
                {startTask.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                    <Play className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110" />
                )}
                Start Work
            </Button>
        );
    } else if (state === "done" && task.prUrl) {
        primaryAction = (
            <Button
                size="sm"
                variant="outline"
                className={btnClass}
                onClick={() => void openUrl(task.prUrl!)}
            >
                <ExternalLink className="h-3.5 w-3.5" />
                View PR
            </Button>
        );
    } else if (state === "failed") {
        primaryAction = (
            <Button
                size="sm"
                className={btnClass}
                onClick={() => handleUpdateState("pending")}
            >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
            </Button>
        );
    }

    // ── Build overflow items for header ⋮ menu ──

    let overflowItems: React.ReactNode = null;

    if (state === "review") {
        overflowItems = (
            <DropdownMenuItem onClick={() => handleUpdateState("dismissed")}>
                <XCircle className="h-4 w-4 mr-2" />
                Dismiss
            </DropdownMenuItem>
        );
    } else if (state === "pending") {
        overflowItems = (
            <DropdownMenuItem onClick={() => handleUpdateState("dismissed")}>
                <XCircle className="h-4 w-4 mr-2" />
                Dismiss
            </DropdownMenuItem>
        );
    } else if (state === "done") {
        overflowItems = (
            <DropdownMenuItem onClick={() => handleUpdateState("pending")}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reopen
            </DropdownMenuItem>
        );
    }

    // ── Build sidebar actions (review state) ──

    let sidebarActions: React.ReactNode = null;

    if (state === "review") {
        const hasPr = !!task.prUrl;
        sidebarActions = (
            <>
                {!hasPr && (
                    <Button
                        variant="outline"
                        size="sm"
                        className={btnClass}
                        onClick={handleRequestChanges}
                    >
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                        Request Changes
                    </Button>
                )}
                {task.branchName && !hasPr ? (
                    <Button
                        size="sm"
                        className={btnClass}
                        onClick={handleApproveAndCreatePr}
                        disabled={pushBranch.isPending}
                    >
                        {pushBranch.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Approve & Create PR
                    </Button>
                ) : hasPr ? (
                    <>
                        <Button
                            size="sm"
                            variant="outline"
                            className={btnClass}
                            onClick={() => void openUrl(task.prUrl!)}
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                            View PR
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className={btnClass}
                            onClick={() => handleUpdateState("done")}
                        >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Mark Done
                        </Button>
                    </>
                ) : (
                    <Button
                        size="sm"
                        className={btnClass}
                        onClick={() => handleUpdateState("done")}
                    >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                    </Button>
                )}
            </>
        );
    }

    // ── Determine content to show ──

    const showTabBar = openTabs.length > 0 || hasChanges || showAgentTab;

    return (
        <div className="flex h-full">
            {/* ── Left: content column ── */}
            <div className="flex flex-1 flex-col overflow-hidden">
                <TaskDetailHeader
                    task={task}
                    repoPath={repoPath}
                    primaryAction={primaryAction}
                    overflowItems={overflowItems}
                    onBack={() => setSelectedTask(undefined)}
                    onUpdateTitle={handleUpdateTitle}
                    onDelete={handleDelete}
                />

                {/* Tab bar */}
                {showTabBar && (
                    <div className="flex items-center h-9 border-b border-border shrink-0 px-1">
                        <button
                            type="button"
                            onClick={() => setActiveTab("overview")}
                            className={`relative flex items-center gap-1.5 px-3 h-full text-xs shrink-0 transition-colors ${
                                activeTab === "overview"
                                    ? "text-foreground font-medium"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <LayoutDashboard className="h-3 w-3" />
                            Overview
                            {activeTab === "overview" && (
                                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-foreground rounded-full" />
                            )}
                        </button>

                        {showAgentTab && (
                            <button
                                type="button"
                                onClick={() => setActiveTab("agent")}
                                className={`relative flex items-center gap-1.5 px-3 h-full text-xs shrink-0 transition-colors ${
                                    activeTab === "agent"
                                        ? "text-foreground font-medium"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {isStreaming && (
                                    <span className="relative flex h-1.5 w-1.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    </span>
                                )}
                                <Terminal className="h-3 w-3" />
                                Agent
                                {activeTab === "agent" && (
                                    <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-foreground rounded-full" />
                                )}
                            </button>
                        )}

                        {openTabs.map((tab) => {
                            const isActive = activeTab === tab.path;
                            return (
                                <div
                                    key={tab.path}
                                    className={`group relative flex items-center h-full shrink-0 ${
                                        isActive
                                            ? "text-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab(tab.path)}
                                        className="flex items-center gap-1.5 px-3 h-full text-xs"
                                    >
                                        {tab.kind === "diff" && (
                                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500/60 shrink-0" />
                                        )}
                                        <span
                                            className={`truncate max-w-[140px] font-mono ${isActive ? "font-medium" : ""}`}
                                        >
                                            {getFileName(tab.path)}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleCloseTab(tab.path);
                                        }}
                                        className={`mr-1.5 rounded p-0.5 transition-opacity hover:bg-muted ${
                                            isActive
                                                ? "opacity-50 hover:opacity-100"
                                                : "opacity-0 group-hover:opacity-50 hover:!opacity-100"
                                        }`}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                    {isActive && (
                                        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-foreground rounded-full" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Scrollable content */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto">
                    {isShowingDiff ? (
                        diffText ? (
                            <div className="px-6 pt-4 pb-8">
                                <ErrorBoundary
                                    level="widget"
                                    heading="Diff viewer crashed"
                                >
                                    <TaskDiffViewer
                                        diffText={diffText}
                                        singleFile={activeTab}
                                        comments={inlineComments}
                                        ghComments={ghCommentsForDiff}
                                        onAddComment={
                                            task.state === "review"
                                                ? handleAddComment
                                                : undefined
                                        }
                                        onRemoveComment={handleRemoveComment}
                                        onReplyToGhComment={
                                            handleReplyToGhComment
                                        }
                                    />
                                </ErrorBoundary>
                            </div>
                        ) : (
                            <div className="flex h-32 items-center justify-center">
                                <p className="text-xs text-muted-foreground/40">
                                    Loading changes...
                                </p>
                            </div>
                        )
                    ) : isShowingFile && repoPath ? (
                        <div className="px-6 pt-4 pb-8">
                            <FileContentViewer
                                repoPath={repoPath}
                                relativePath={activeTab}
                            />
                        </div>
                    ) : activeTab === "agent" ? (
                        <TaskLiveOutput
                            lines={outputLines}
                            isStreaming={isStreaming}
                        />
                    ) : (
                        <div className="mx-auto w-full max-w-2xl px-6 pt-6 pb-8">
                            {task.state === "in_progress" && (
                                <div className="mb-5">
                                    <TaskStatusBanner taskId={taskId} />
                                </div>
                            )}

                            {task.state === "failed" && task.lastError && (
                                <div className="mb-5 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive mt-0.5" />
                                    <p className="text-xs text-destructive leading-relaxed">
                                        {task.lastError}
                                    </p>
                                </div>
                            )}

                            <TaskOverview task={task} />

                            {(task.state === "pending" ||
                                task.state === "in_progress") &&
                                task.filesInvolved &&
                                task.filesInvolved.length > 0 && (
                                    <div className="mt-3">
                                        <TaskFilesInvolved
                                            files={task.filesInvolved}
                                        />
                                    </div>
                                )}

                            <div className="mt-8 border-t border-border/50 pt-5">
                                <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/40">
                                    Activity
                                </p>
                                <TaskChatTimeline taskId={taskId} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Chat input */}
                {!isReadOnly && (
                    <div className="shrink-0 bg-background px-6 py-3">
                        <div
                            className={
                                isShowingDiff || isShowingFile
                                    ? "w-full"
                                    : "mx-auto w-full max-w-2xl"
                            }
                        >
                            <ChatInput
                                taskId={taskId}
                                placeholder={
                                    feedbackMode && inlineComments.length > 0
                                        ? `${inlineComments.length} inline comment${inlineComments.length === 1 ? "" : "s"} will be included — add a summary...`
                                        : isShowingDiff
                                          ? "Leave feedback on the changes..."
                                          : "Add context for the agent..."
                                }
                                feedbackMode={feedbackMode}
                                inlineCommentCount={inlineComments.length}
                                onFeedbackSend={handleFeedbackSend}
                                onFeedbackCancel={handleFeedbackCancel}
                                onMessageSent={scrollToBottom}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* ── Resize handle (true full height) ── */}
            {showSidebar && (
                <div
                    onMouseDown={handleResizeStart}
                    className="relative z-10 w-0 cursor-col-resize before:absolute before:-left-1 before:top-0 before:h-full before:w-2 before:content-[''] hover:before:bg-ring/20 active:before:bg-ring/30"
                />
            )}

            {/* ── Right: sidebar (true full height) ── */}
            {showSidebar && (
                <div
                    className="shrink-0 h-full"
                    style={{ width: sidebarWidth }}
                >
                    <TaskChangedFilesSidebar
                        repoPath={repoPath}
                        files={diffStat ?? []}
                        activeFile={
                            activeTab !== "overview" ? activeTab : undefined
                        }
                        onDiffFileSelect={handleDiffFileSelect}
                        onBrowseFileSelect={handleBrowseFileSelect}
                        actions={sidebarActions}
                        hasChanges={hasChanges}
                        diffError={diffStatError ? String(diffStatError) : null}
                    />
                </div>
            )}
        </div>
    );
}
