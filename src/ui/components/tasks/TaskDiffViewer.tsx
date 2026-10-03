import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { PatchDiff } from "@pierre/diffs/react";
import type { DiffLineAnnotation, AnnotationSide } from "@pierre/diffs/react";
import type { SelectedLineRange } from "@pierre/diffs";
import {
    Columns2,
    Rows3,
    MessageSquare,
    X,
    Send,
    Reply,
    CheckCircle,
} from "lucide-react";
import { Button } from "@ui/components/ui/button";

// ── Types ───────────────────────────────────────────────────

export interface InlineComment {
    id: string;
    side: AnnotationSide;
    lineNumber: number;
    text: string;
    fileName?: string;
}

export interface GitHubPrComment {
    id: string;
    githubCommentId: number;
    reviewer: string;
    body: string;
    path?: string;
    line?: number;
    side?: "LEFT" | "RIGHT";
    classification?: "actionable" | "conversational" | "resolved";
    ourReply?: string;
    addressedInCommit?: string;
    createdAt: string;
}

interface TaskDiffViewerProps {
    diffText: string;
    activeFile?: string;
    singleFile?: string;
    comments?: InlineComment[];
    ghComments?: GitHubPrComment[];
    onAddComment?: (comment: Omit<InlineComment, "id">) => void;
    onRemoveComment?: (id: string) => void;
    onReplyToGhComment?: (commentId: number, body: string) => void;
}

// ── Annotation metadata type ────────────────────────────────

interface CommentAnnotation {
    commentId: string;
    text: string;
    isGitHub?: boolean;
    reviewer?: string;
    classification?: string;
    ourReply?: string;
    githubCommentId?: number;
    addressedInCommit?: string;
}

// ── Inline comment form ─────────────────────────────────────

function CommentForm({
    onSubmit,
    onCancel,
}: {
    onSubmit: (text: string) => void;
    onCancel: () => void;
}) {
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    function handleSubmit() {
        const trimmed = text.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
        }
    }

    return (
        <div className="flex flex-col gap-2 p-3 bg-background border border-border rounded-lg shadow-lg max-w-md w-full">
            <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Leave a comment on this line..."
                rows={2}
                className="w-full resize-none rounded-md border border-border bg-muted/30 px-3 py-2 text-xs leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground/40">
                    <kbd className="rounded border border-border/40 bg-muted/50 px-1 font-mono">
                        {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+↵
                    </kbd>{" "}
                    to submit
                </span>
                <div className="flex items-center gap-1.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={onCancel}
                    >
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        className="h-6 text-xs px-2 gap-1"
                        onClick={handleSubmit}
                        disabled={!text.trim()}
                    >
                        <Send className="h-3 w-3" />
                        Comment
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ── Rendered comment bubble ─────────────────────────────────

function CommentBubble({
    text,
    onRemove,
}: {
    text: string;
    onRemove: () => void;
}) {
    return (
        <div className="group/comment flex items-start gap-2 px-3 py-2 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-lg max-w-md w-full">
            <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="flex-1 text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                {text}
            </p>
            <button
                type="button"
                onClick={onRemove}
                className="shrink-0 rounded p-0.5 opacity-0 group-hover/comment:opacity-60 hover:!opacity-100 transition-opacity text-muted-foreground"
            >
                <X className="h-3 w-3" />
            </button>
        </div>
    );
}

// ── GitHub PR comment ────────────────────────────────────────

function GitHubCommentBubble({
    reviewer,
    text,
    ourReply,
    addressedInCommit,
    classification,
    onReply,
}: {
    reviewer: string;
    text: string;
    ourReply?: string;
    addressedInCommit?: string;
    classification?: string;
    onReply?: (body: string) => void;
}) {
    const [showReply, setShowReply] = useState(false);
    const [replyText, setReplyText] = useState("");
    const replyRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (showReply) replyRef.current?.focus();
    }, [showReply]);

    const isResolved = !!addressedInCommit || classification === "resolved";

    return (
        <div className="mx-2 my-2 max-w-[480px] rounded-md border border-border bg-background shadow-sm overflow-hidden text-[12px]">
            {/* Reviewer header */}
            <div
                className={`flex items-center gap-1.5 px-2.5 py-1.5 border-b ${
                    isResolved
                        ? "bg-green-50/80 dark:bg-green-950/30 border-green-200/50 dark:border-green-800/30"
                        : "bg-muted/50 border-border"
                }`}
            >
                <span className="font-semibold text-foreground">
                    {reviewer}
                </span>
                {isResolved && (
                    <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                        <CheckCircle className="h-3 w-3" />
                        Resolved
                    </span>
                )}
            </div>

            {/* Comment body */}
            <div className="px-2.5 py-2">
                <p className="leading-[1.55] text-foreground whitespace-pre-wrap break-words">
                    {text}
                </p>
            </div>

            {/* Reply (inline, not a separate card) */}
            {ourReply && (
                <div className="mx-2.5 mb-2 rounded border border-border/60 bg-muted/30 overflow-hidden">
                    <div className="flex items-center gap-1 px-2 py-1 border-b border-border/40 bg-muted/40">
                        <span className="font-medium text-foreground text-[11px]">
                            You
                        </span>
                        <span className="text-[10px] text-muted-foreground/50">
                            via SUSTN
                        </span>
                    </div>
                    <div className="px-2 py-1.5">
                        <p className="leading-[1.55] text-foreground/80 whitespace-pre-wrap break-words">
                            {ourReply}
                        </p>
                    </div>
                </div>
            )}

            {/* Reply button */}
            {onReply && !ourReply && !showReply && (
                <div className="border-t border-border px-2.5 py-1">
                    <button
                        type="button"
                        onClick={() => setShowReply(true)}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <Reply className="h-3 w-3" />
                        Reply
                    </button>
                </div>
            )}

            {/* Reply form */}
            {showReply && (
                <div className="border-t border-border px-2.5 py-2 space-y-1.5 bg-muted/20">
                    <textarea
                        ref={replyRef}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                if (replyText.trim() && onReply) {
                                    onReply(replyText.trim());
                                    setShowReply(false);
                                    setReplyText("");
                                }
                            }
                            if (e.key === "Escape") {
                                setShowReply(false);
                                setReplyText("");
                            }
                        }}
                        placeholder="Write a reply..."
                        rows={2}
                        className="w-full resize-none rounded border border-border bg-background px-2 py-1.5 text-[12px] leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <div className="flex justify-end gap-1.5">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[11px] px-2"
                            onClick={() => {
                                setShowReply(false);
                                setReplyText("");
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            className="h-6 text-[11px] px-2.5 gap-1"
                            onClick={() => {
                                if (replyText.trim() && onReply) {
                                    onReply(replyText.trim());
                                    setShowReply(false);
                                    setReplyText("");
                                }
                            }}
                            disabled={!replyText.trim()}
                        >
                            <Send className="h-2.5 w-2.5" />
                            Reply
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Main diff viewer ───────────────────────────────────────

export function TaskDiffViewer({
    diffText,
    singleFile,
    comments = [],
    ghComments = [],
    onAddComment,
    onRemoveComment,
    onReplyToGhComment,
}: TaskDiffViewerProps) {
    const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified");
    const [selectedLines, setSelectedLines] =
        useState<SelectedLineRange | null>(null);
    const [commentTarget, setCommentTarget] = useState<{
        side: AnnotationSide;
        lineNumber: number;
    } | null>(null);

    // Filter the patch to a single file if requested
    const patchToRender = useMemo(() => {
        if (!diffText) return "";
        if (!singleFile) return diffText;

        try {
            const lines = diffText.split("\n");
            const fileStartIndices: number[] = [];

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith("diff --git")) {
                    fileStartIndices.push(i);
                }
            }

            for (let idx = 0; idx < fileStartIndices.length; idx++) {
                const start = fileStartIndices[idx];
                const end = fileStartIndices[idx + 1] ?? lines.length;
                const section = lines.slice(start, end).join("\n");

                const diffLine = lines[start];
                if (
                    diffLine.includes(`b/${singleFile}`) ||
                    diffLine.includes(`a/${singleFile}`)
                ) {
                    return section;
                }
            }
        } catch {
            // Fall through to full diff
        }

        return diffText;
    }, [diffText, singleFile]);

    // Count files for the header
    const fileCount = useMemo(() => {
        if (!diffText) return 0;
        return (diffText.match(/^diff --git/gm) ?? []).length;
    }, [diffText]);

    // Build annotation list from local comments + GitHub PR comments
    const lineAnnotations = useMemo<
        DiffLineAnnotation<CommentAnnotation>[]
    >(() => {
        const local = comments
            .filter((c) => {
                if (!singleFile) return true;
                return !c.fileName || c.fileName === singleFile;
            })
            .map((c) => ({
                side: c.side,
                lineNumber: c.lineNumber,
                metadata: { commentId: c.id, text: c.text },
            }));

        const github = ghComments
            .filter((c) => {
                if (!c.path || !c.line) return false;
                if (!singleFile) return true;
                return c.path === singleFile;
            })
            .map((c) => ({
                side: (c.side === "LEFT"
                    ? "deletions"
                    : "additions") as AnnotationSide,
                lineNumber: c.line!,
                metadata: {
                    commentId: `gh-${c.githubCommentId}`,
                    text: c.body,
                    isGitHub: true,
                    reviewer: c.reviewer,
                    classification: c.classification,
                    ourReply: c.ourReply,
                    githubCommentId: c.githubCommentId,
                    addressedInCommit: c.addressedInCommit,
                },
            }));

        return [...local, ...github];
    }, [comments, ghComments, singleFile]);

    // Include the "new comment" form as an annotation too
    const allAnnotations = useMemo<
        DiffLineAnnotation<CommentAnnotation>[]
    >(() => {
        if (!commentTarget) return lineAnnotations;
        return [
            ...lineAnnotations,
            {
                side: commentTarget.side,
                lineNumber: commentTarget.lineNumber,
                metadata: { commentId: "__new__", text: "" },
            },
        ];
    }, [lineAnnotations, commentTarget]);

    const handleLineSelected = useCallback(
        (range: SelectedLineRange | null) => {
            setSelectedLines(range);
        },
        [],
    );

    const handleGutterClick = useCallback(
        (range: SelectedLineRange) => {
            if (!onAddComment) return;
            setCommentTarget({
                side: range.side ?? "additions",
                lineNumber: range.start,
            });
        },
        [onAddComment],
    );

    const handleCommentSubmit = useCallback(
        (text: string) => {
            if (!commentTarget || !onAddComment) return;
            onAddComment({
                side: commentTarget.side,
                lineNumber: commentTarget.lineNumber,
                text,
                fileName: singleFile,
            });
            setCommentTarget(null);
        },
        [commentTarget, onAddComment, singleFile],
    );

    const handleCommentCancel = useCallback(() => {
        setCommentTarget(null);
    }, []);

    const renderAnnotation = useCallback(
        (annotation: DiffLineAnnotation<CommentAnnotation>) => {
            if (!annotation.metadata) return null;

            if (annotation.metadata.commentId === "__new__") {
                return (
                    <CommentForm
                        onSubmit={handleCommentSubmit}
                        onCancel={handleCommentCancel}
                    />
                );
            }

            // GitHub PR comment
            if (annotation.metadata.isGitHub) {
                return (
                    <GitHubCommentBubble
                        reviewer={annotation.metadata.reviewer ?? "unknown"}
                        text={annotation.metadata.text}
                        classification={annotation.metadata.classification}
                        ourReply={annotation.metadata.ourReply}
                        addressedInCommit={
                            annotation.metadata.addressedInCommit
                        }
                        onReply={
                            onReplyToGhComment &&
                            annotation.metadata.githubCommentId
                                ? (body) =>
                                      onReplyToGhComment(
                                          annotation.metadata.githubCommentId!,
                                          body,
                                      )
                                : undefined
                        }
                    />
                );
            }

            // Local SUSTN comment
            return (
                <CommentBubble
                    text={annotation.metadata.text}
                    onRemove={() =>
                        onRemoveComment?.(annotation.metadata.commentId)
                    }
                />
            );
        },
        [
            handleCommentSubmit,
            handleCommentCancel,
            onRemoveComment,
            onReplyToGhComment,
        ],
    );

    const isInteractive = !!onAddComment;

    const options = useMemo(
        () => ({
            diffStyle,
            diffIndicators: "bars" as const,
            lineDiffType: "word-alt" as const,
            expandUnchanged: true,
            theme: {
                dark: "github-dark" as const,
                light: "github-light" as const,
            },
            themeType: "system" as const,
            overflow: "scroll" as const,
            enableLineSelection: isInteractive,
            onLineSelected: isInteractive ? handleLineSelected : undefined,
            enableGutterUtility: isInteractive,
            onGutterUtilityClick: isInteractive ? handleGutterClick : undefined,
        }),
        [diffStyle, isInteractive, handleLineSelected, handleGutterClick],
    );

    if (!patchToRender) {
        return (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground/70">
                    No changes to display.
                </p>
            </div>
        );
    }

    return (
        <div>
            {/* Controls */}
            <div className="flex items-center justify-between mb-3">
                {singleFile ? (
                    <span className="text-xs font-mono text-muted-foreground/50 truncate">
                        {singleFile}
                    </span>
                ) : (
                    <span className="text-xs text-muted-foreground/50">
                        {fileCount} {fileCount === 1 ? "file" : "files"} changed
                    </span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                    {ghComments.length > 0 && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground mr-2">
                            <MessageSquare className="h-3 w-3" />
                            {ghComments.length} GitHub{" "}
                            {ghComments.length === 1 ? "comment" : "comments"}
                        </span>
                    )}
                    <Button
                        variant={
                            diffStyle === "unified" ? "secondary" : "ghost"
                        }
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => setDiffStyle("unified")}
                    >
                        <Rows3 className="h-3 w-3" />
                        Unified
                    </Button>
                    <Button
                        variant={diffStyle === "split" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => setDiffStyle("split")}
                    >
                        <Columns2 className="h-3 w-3" />
                        Split
                    </Button>
                </div>
            </div>

            {/* Diff content */}
            <div className="rounded-lg border border-border overflow-hidden">
                <PatchDiff<CommentAnnotation>
                    patch={patchToRender}
                    options={options}
                    selectedLines={selectedLines}
                    lineAnnotations={allAnnotations}
                    renderAnnotation={renderAnnotation}
                />
            </div>
        </div>
    );
}
