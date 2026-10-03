import { useRef, useEffect, useState, useMemo } from "react";
import {
    ArrowDown,
    Wrench,
    FileText,
    Brain,
    CheckCircle2,
    AlertTriangle,
    Lightbulb,
} from "lucide-react";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import type { TaskOutputEvent, ContentBlock } from "@core/types/agent";

interface TaskLiveOutputProps {
    lines: TaskOutputEvent[];
    isStreaming: boolean;
}

function formatTime(timestamp: string): string {
    try {
        const d = new Date(timestamp);
        return d.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    } catch {
        return "";
    }
}

// ── Structured JSON detection ──────────────────────────────

interface ReviewJson {
    passed?: boolean;
    feedback?: string;
    issues?: { description: string; severity: string }[];
}

interface ImplementJson {
    files_modified?: string[];
    summary?: string;
    tests_added?: boolean;
}

/**
 * Try to extract a structured JSON object from a text block.
 * Handles plain JSON and fenced code blocks (```json ... ```).
 */
function tryParseStructured(
    text: string,
):
    | { kind: "review"; data: ReviewJson }
    | { kind: "implement"; data: ImplementJson }
    | null {
    const trimmed = text.trim();
    // Try fenced code block first
    const fencedMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    const jsonStr = fencedMatch ? fencedMatch[1] : trimmed;

    // Must look like a JSON object
    if (!jsonStr.startsWith("{")) return null;

    try {
        const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
        if ("passed" in parsed || "issues" in parsed) {
            return { kind: "review", data: parsed as ReviewJson };
        }
        if ("files_modified" in parsed || "tests_added" in parsed) {
            return { kind: "implement", data: parsed as ImplementJson };
        }
    } catch {
        // Not valid JSON
    }
    return null;
}

// ── Structured result cards ────────────────────────────────

function ReviewResultCard({ data }: { data: ReviewJson }) {
    const passed = data.passed === true;
    const issues = data.issues ?? [];
    const critical = issues.filter((i) => i.severity === "critical");
    const suggestions = issues.filter((i) => i.severity !== "critical");

    return (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2.5">
            <div className="flex items-center gap-2">
                {passed ? (
                    <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-[13px] font-medium text-emerald-500">
                            Review passed
                        </span>
                    </>
                ) : (
                    <>
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <span className="text-[13px] font-medium text-amber-500">
                            Review rejected
                        </span>
                    </>
                )}
            </div>
            {data.feedback && (
                <p className="text-[12px] text-foreground/70 leading-relaxed">
                    {data.feedback}
                </p>
            )}
            {critical.length > 0 && (
                <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
                        Critical
                    </div>
                    {critical.map((issue, i) => (
                        <div
                            key={i}
                            className="flex gap-1.5 items-start rounded-md bg-destructive/5 border border-destructive/20 px-2 py-1.5"
                        >
                            <AlertTriangle className="h-3 w-3 mt-0.5 text-destructive shrink-0" />
                            <p className="text-[12px] text-foreground/80 leading-relaxed">
                                {issue.description}
                            </p>
                        </div>
                    ))}
                </div>
            )}
            {suggestions.length > 0 && (
                <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
                        Suggestions
                    </div>
                    {suggestions.map((issue, i) => (
                        <div
                            key={i}
                            className="flex gap-1.5 items-start rounded-md bg-muted/30 px-2 py-1.5"
                        >
                            <Lightbulb className="h-3 w-3 mt-0.5 text-muted-foreground/60 shrink-0" />
                            <p className="text-[12px] text-foreground/70 leading-relaxed">
                                {issue.description}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function ImplementResultCard({ data }: { data: ImplementJson }) {
    return (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-[13px] font-medium text-foreground/80">
                    Implementation
                </span>
            </div>
            {data.summary && (
                <p className="text-[12px] text-foreground/70 leading-relaxed">
                    {data.summary}
                </p>
            )}
            {data.files_modified && data.files_modified.length > 0 && (
                <div className="space-y-0.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
                        Files modified
                    </div>
                    {data.files_modified.map((f) => (
                        <div
                            key={f}
                            className="flex gap-1.5 items-center text-[12px]"
                        >
                            <FileText className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                            <span className="font-mono text-muted-foreground truncate">
                                {f}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Syntax-highlighted code ───────────────────────────────

/** Detect and render fenced code blocks with syntax highlighting. */
function CodeWithHighlighting({ text }: { text: string }) {
    const parts = useMemo(() => {
        // Split on fenced code blocks
        const regex = /```(\w+)?\n([\s\S]*?)```/g;
        const result: Array<
            | { type: "text"; value: string }
            | { type: "code"; lang: string; value: string }
        > = [];
        let lastIndex = 0;
        let match;
        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                result.push({
                    type: "text",
                    value: text.slice(lastIndex, match.index),
                });
            }
            result.push({
                type: "code",
                lang: match[1] || "plaintext",
                value: match[2],
            });
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) {
            result.push({ type: "text", value: text.slice(lastIndex) });
        }
        return result;
    }, [text]);

    return (
        <div className="space-y-2">
            {parts.map((part, i) => {
                if (part.type === "text") {
                    if (!part.value.trim()) return null;
                    return (
                        <p
                            key={i}
                            className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap break-words"
                        >
                            {part.value}
                        </p>
                    );
                }
                let highlighted: string;
                try {
                    highlighted = hljs.highlight(part.value, {
                        language: part.lang,
                        ignoreIllegals: true,
                    }).value;
                } catch {
                    highlighted = hljs.highlightAuto(part.value).value;
                }
                return (
                    <pre
                        key={i}
                        className="overflow-x-auto rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed"
                    >
                        <code
                            className={`hljs language-${part.lang} font-mono`}
                            dangerouslySetInnerHTML={{ __html: highlighted }}
                        />
                    </pre>
                );
            })}
        </div>
    );
}

// ── Content block renderer ─────────────────────────────────

function BlockView({ block }: { block: ContentBlock }) {
    if (block.kind === "text") {
        if (!block.text) return null;

        // Try to detect structured JSON output (review/implement result)
        const structured = tryParseStructured(block.text);
        if (structured?.kind === "review") {
            return <ReviewResultCard data={structured.data} />;
        }
        if (structured?.kind === "implement") {
            return <ImplementResultCard data={structured.data} />;
        }

        // Check for fenced code blocks
        if (block.text.includes("```")) {
            return <CodeWithHighlighting text={block.text} />;
        }

        return (
            <p className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap break-words">
                {block.text}
            </p>
        );
    }

    if (block.kind === "thinking") {
        if (!block.text) return null;
        return (
            <div className="flex gap-1.5 items-start py-0.5">
                <Brain className="h-3 w-3 mt-0.5 text-muted-foreground/50 shrink-0" />
                <p className="text-[12px] text-muted-foreground/70 leading-relaxed italic whitespace-pre-wrap break-words">
                    {block.text}
                </p>
            </div>
        );
    }

    if (block.kind === "tool_use") {
        return (
            <div className="flex gap-1.5 items-center">
                <Wrench className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                <span className="inline-flex items-baseline gap-1.5 text-[12px]">
                    <span className="font-medium text-foreground/70">
                        {block.toolName ?? "tool"}
                    </span>
                    {block.toolTarget && (
                        <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[500px]">
                            {block.toolTarget}
                        </span>
                    )}
                </span>
            </div>
        );
    }

    if (block.kind === "tool_result") {
        if (!block.text) return null;
        // Detect diff output for syntax highlighting
        const looksLikeDiff =
            block.text.startsWith("diff ") ||
            block.text.startsWith("---") ||
            /^@@\s/.test(block.text);
        if (looksLikeDiff) {
            let highlighted: string;
            try {
                highlighted = hljs.highlight(block.text, {
                    language: "diff",
                    ignoreIllegals: true,
                }).value;
            } catch {
                highlighted = block.text;
            }
            return (
                <div className="flex gap-1.5 items-start pl-4">
                    <FileText className="h-3 w-3 mt-0.5 text-muted-foreground/40 shrink-0" />
                    <pre className="flex-1 overflow-x-auto rounded-md bg-muted/20 px-2 py-1 text-[10px] leading-relaxed max-h-32">
                        <code
                            className="hljs language-diff font-mono"
                            dangerouslySetInnerHTML={{ __html: highlighted }}
                        />
                    </pre>
                </div>
            );
        }
        return (
            <div className="flex gap-1.5 items-start pl-4">
                <FileText className="h-3 w-3 mt-0.5 text-muted-foreground/40 shrink-0" />
                <p className="text-[11px] text-muted-foreground/60 font-mono leading-relaxed whitespace-pre-wrap break-words line-clamp-3">
                    {block.text}
                </p>
            </div>
        );
    }

    if (block.kind === "result") {
        return (
            <div className="flex gap-1.5 items-center">
                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                <span className="text-[12px] text-emerald-500 font-medium">
                    Completed
                </span>
            </div>
        );
    }

    return null;
}

function EventRow({ event }: { event: TaskOutputEvent }) {
    if (event.eventType === "system") {
        return (
            <div className="flex gap-3 py-1 text-muted-foreground/30 text-[11px] font-mono">
                <span className="shrink-0 w-[60px] tabular-nums">
                    {formatTime(event.timestamp)}
                </span>
                <span>session started</span>
            </div>
        );
    }

    if (event.blocks.length === 0) return null;

    return (
        <div className="flex gap-3 py-1.5">
            <span className="shrink-0 w-[60px] text-muted-foreground/40 text-[11px] font-mono tabular-nums pt-0.5">
                {formatTime(event.timestamp)}
            </span>
            <div className="flex-1 min-w-0 space-y-1.5">
                {event.blocks.map((block, i) => (
                    <BlockView key={i} block={block} />
                ))}
            </div>
        </div>
    );
}

export function TaskLiveOutput({ lines, isStreaming }: TaskLiveOutputProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);

    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [lines.length, autoScroll]);

    function handleScroll() {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        const atBottom = scrollHeight - scrollTop - clientHeight < 40;
        setAutoScroll(atBottom);
    }

    const meaningfulLines = lines.filter(
        (e) => e.eventType === "system" || e.blocks.length > 0,
    );

    if (meaningfulLines.length === 0) {
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-xs text-muted-foreground/40">
                    {isStreaming
                        ? "Waiting for output..."
                        : "No output yet. Start a task to see live output here."}
                </p>
            </div>
        );
    }

    return (
        <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border px-4 py-2 shrink-0">
                <div className="flex items-center gap-2">
                    {isStreaming && (
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                        {isStreaming ? "Streaming" : "Completed"} —{" "}
                        {meaningfulLines.length} event
                        {meaningfulLines.length !== 1 ? "s" : ""}
                    </span>
                </div>
            </div>

            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 py-2"
            >
                {meaningfulLines.map((line, i) => (
                    <EventRow key={i} event={line} />
                ))}
            </div>

            {!autoScroll && isStreaming && (
                <button
                    type="button"
                    onClick={() => {
                        setAutoScroll(true);
                        if (scrollRef.current) {
                            scrollRef.current.scrollTop =
                                scrollRef.current.scrollHeight;
                        }
                    }}
                    className="absolute bottom-4 right-4 flex items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-[11px] font-medium text-background shadow-md hover:opacity-90 transition-opacity"
                >
                    <ArrowDown className="h-3 w-3" />
                    Jump to bottom
                </button>
            )}
        </div>
    );
}
