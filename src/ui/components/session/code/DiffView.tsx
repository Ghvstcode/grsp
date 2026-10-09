import { useEffect, useMemo, useRef } from "react";
import { getSingularPatch, setLanguageOverride } from "@pierre/diffs";
import {
    FileDiff,
    type AnnotationSide,
    type DiffLineAnnotation,
} from "@pierre/diffs/react";
import type { DiffFilePatch, Note } from "@core/types/grsp";
import {
    lineThreads,
    notesForFile,
    type DiffStyle,
    type LineSide,
    type LineTarget,
    type LineThread,
} from "../lib/code";
import { NoteCard } from "../notes/NoteCard";
import { NoteEditor } from "../notes/NoteEditor";
import { DIFF_CSS, DIFF_THEME } from "./diffTheme";

const toAnnotationSide = (side: LineSide): AnnotationSide =>
    side === "old" ? "deletions" : "additions";
const toLineSide = (side: AnnotationSide | undefined): LineSide =>
    side === "deletions" ? "old" : "new";

export interface DiffViewProps {
    file: DiffFilePatch;
    diffStyle: DiffStyle;
    dark: boolean;
    /** The session's notes; this file's line notes are drawn inline. */
    notes: Note[];
    /** The line a new note is being written on. */
    composing: LineTarget | undefined;
    /** A line to highlight and scroll to; `nonce` re-triggers the scroll. */
    focus: (LineTarget & { nonce: number }) | undefined;
    onCompose: (target: LineTarget | undefined) => void;
    onAdd: (target: LineTarget, body: string) => void;
    onEdit: (noteId: string, body: string) => void;
    onDelete: (noteId: string) => void;
}

/**
 * One file's diff, drawn by `@pierre/diffs` in grsp's black and white.
 * Clicking a line number (or the + beside it) opens a note box under that
 * line; saved line notes stay inline.
 *
 * The patch is parsed here rather than by the library's `PatchDiff` so the
 * file can be marked as plain text: grsp shows no syntax colour, so there is
 * no reason to load a grammar and tokenise every line, and a patch the
 * parser rejects becomes a quiet message instead of a crash.
 */
export default function DiffView({
    file,
    diffStyle,
    dark,
    notes,
    composing,
    focus,
    onCompose,
    onAdd,
    onEdit,
    onDelete,
}: DiffViewProps) {
    const host = useRef<HTMLDivElement>(null);

    const parsed = useMemo(() => {
        try {
            return setLanguageOverride(getSingularPatch(file.patch), "text");
        } catch (error) {
            console.warn("Couldn't parse the diff of", file.path, error);
            return undefined;
        }
    }, [file.patch, file.path]);

    const annotations = useMemo<DiffLineAnnotation<LineThread>[]>(
        () =>
            lineThreads(notesForFile(notes, file.path), composing).map(
                (thread) => ({
                    side: toAnnotationSide(thread.side),
                    lineNumber: thread.line,
                    metadata: thread,
                }),
            ),
        [notes, file.path, composing],
    );

    const options = useMemo(
        () => ({
            diffStyle,
            theme: DIFF_THEME,
            themeType: dark ? ("dark" as const) : ("light" as const),
            disableFileHeader: true,
            diffIndicators: "classic" as const,
            lineDiffType: "word-alt" as const,
            hunkSeparators: "line-info-basic" as const,
            overflow: "scroll" as const,
            unsafeCSS: DIFF_CSS,
            enableGutterUtility: true,
            onGutterUtilityClick: (range: {
                start: number;
                side?: AnnotationSide;
            }) =>
                onCompose({ line: range.start, side: toLineSide(range.side) }),
            onLineNumberClick: (line: {
                lineNumber: number;
                annotationSide: AnnotationSide;
            }) =>
                onCompose({
                    line: line.lineNumber,
                    side: toLineSide(line.annotationSide),
                }),
        }),
        [diffStyle, dark, onCompose],
    );

    const selected = useMemo(
        () =>
            focus
                ? {
                      start: focus.line,
                      end: focus.line,
                      side: toAnnotationSide(focus.side),
                  }
                : null,
        [focus],
    );

    // Bring the focused line into view once the diff has drawn it.
    useEffect(() => {
        if (!focus) return;
        let tries = 0;
        const timer = window.setInterval(() => {
            tries += 1;
            const root = host.current?.querySelector("diffs-container");
            const line = root?.shadowRoot?.querySelector(
                "[data-selected-line]",
            );
            if (line) {
                line.scrollIntoView({ block: "center" });
                window.clearInterval(timer);
            } else if (tries > 20) {
                window.clearInterval(timer);
            }
        }, 50);
        return () => window.clearInterval(timer);
    }, [focus, file.path]);

    if (!parsed) {
        return (
            <div className="grsp-border-strong m-5 rounded-[10px] border border-dashed px-[18px] py-3.5 text-[13px] text-muted-foreground">
                This file's diff couldn't be drawn.
            </div>
        );
    }

    return (
        <div ref={host} className="min-w-0">
            <FileDiff<LineThread>
                fileDiff={parsed}
                options={options}
                selectedLines={selected}
                lineAnnotations={annotations}
                renderAnnotation={(annotation) => {
                    const thread = annotation.metadata;
                    return (
                        <div className="grsp-bg-panel grsp-border-soft flex flex-col gap-3 whitespace-normal border-y py-3 pl-4 pr-5 font-sans">
                            <div className="flex max-w-[680px] flex-col gap-3">
                                {thread.notes.map((note) => (
                                    <NoteCard
                                        key={note.id}
                                        note={note}
                                        showAnchor={false}
                                        onEdit={(body) => onEdit(note.id, body)}
                                        onDelete={() => onDelete(note.id)}
                                    />
                                ))}
                                {thread.composing && (
                                    <NoteEditor
                                        label={`Note on line ${thread.line}`}
                                        placeholder={`A note on line ${thread.line}. Markdown works.`}
                                        submitLabel="Add note"
                                        autoFocus
                                        rows={2}
                                        onSave={(body) => {
                                            onAdd(thread, body);
                                            onCompose(undefined);
                                        }}
                                        onCancel={() => onCompose(undefined)}
                                    />
                                )}
                            </div>
                        </div>
                    );
                }}
            />
        </div>
    );
}
