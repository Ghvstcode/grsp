import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Note, NoteAnchor } from "@core/types/grsp";
import { isPendingNote } from "@core/api/useNotes";
import { noteAnchorLabel } from "@core/utils/notes";
import { relativeTime, timestampMs } from "@core/utils/sessions";
import { cn } from "@ui/lib/utils";
import { shortPath } from "../lib/text";
import { Markdown } from "../shared/Markdown";
import { NoteEditor } from "./NoteEditor";

const iconButton =
    "flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-[var(--g-wash)] hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40";

/** The clickable "where this note is pinned" chip. */
export function AnchorChip({
    anchor,
    onJump,
}: {
    anchor: NoteAnchor;
    onJump?: (anchor: NoteAnchor) => void;
}) {
    const label =
        anchor.kind === "line"
            ? `${shortPath(anchor.file, 34)}:${anchor.line}`
            : anchor.label;
    const className =
        "grsp-text-soft max-w-full truncate rounded-[5px] border bg-background px-2 py-[3px] text-left font-mono text-[11px] leading-[16.5px]";
    const title =
        anchor.kind === "line"
            ? `${noteAnchorLabel(anchor)}${anchor.side === "old" ? " (before the change)" : ""} · Open in Code`
            : `${anchor.label} · Open in Walkthrough`;
    if (!onJump) return <span className={className}>{label}</span>;
    return (
        <button
            type="button"
            title={title}
            onClick={() => onJump(anchor)}
            className={cn(
                className,
                "hover:border-foreground hover:text-foreground focus-visible:border-foreground focus-visible:outline-none",
            )}
        >
            {anchor.kind === "block" && (
                <span className="font-sans text-muted-foreground">Step · </span>
            )}
            {label}
        </button>
    );
}

interface NoteCardProps {
    note: Note;
    /** The note was written against an earlier head. */
    outdated?: boolean;
    /** Hidden inside the diff, where the line itself is the anchor. */
    showAnchor?: boolean;
    onJump?: (anchor: NoteAnchor) => void;
    onEdit: (body: string) => void;
    onDelete: () => void;
    className?: string;
}

/** One note: where it is pinned, its text, and edit / delete. */
export function NoteCard({
    note,
    outdated = false,
    showAnchor = true,
    onJump,
    onEdit,
    onDelete,
    className,
}: NoteCardProps) {
    const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
    const pending = isPendingNote(note);
    const edited =
        timestampMs(note.updatedAt) - timestampMs(note.createdAt) > 1000;

    return (
        <article
            className={cn(
                "group/note flex min-w-0 flex-col gap-1.5 font-sans",
                pending && "opacity-70",
                className,
            )}
        >
            <div className="flex min-h-6 min-w-0 items-center gap-2">
                {showAnchor &&
                    (note.anchor ? (
                        <AnchorChip anchor={note.anchor} onJump={onJump} />
                    ) : (
                        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                            General
                        </span>
                    ))}
                <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                    {pending ? "Saving" : relativeTime(note.createdAt)}
                    {edited && " · edited"}
                    {outdated && " · earlier version"}
                </span>
                {mode === "view" && (
                    <span className="ml-auto flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/note:opacity-100">
                        <button
                            type="button"
                            aria-label="Edit note"
                            title="Edit"
                            disabled={pending}
                            onClick={() => setMode("edit")}
                            className={iconButton}
                        >
                            <Pencil size={12} strokeWidth={2} />
                        </button>
                        <button
                            type="button"
                            aria-label="Delete note"
                            title="Delete"
                            disabled={pending}
                            onClick={() => setMode("delete")}
                            className={iconButton}
                        >
                            <Trash2 size={12} strokeWidth={2} />
                        </button>
                    </span>
                )}
            </div>
            {mode === "edit" ? (
                <NoteEditor
                    label="Edit note"
                    initial={note.body}
                    submitLabel="Save"
                    autoFocus
                    onSave={(body) => {
                        onEdit(body);
                        setMode("view");
                    }}
                    onCancel={() => setMode("view")}
                />
            ) : (
                <Markdown className="select-text text-[13px]">
                    {note.body}
                </Markdown>
            )}
            {mode === "delete" && (
                <div className="flex items-center gap-3 text-xs">
                    <span className="grsp-text-2">Delete this note?</span>
                    <button
                        type="button"
                        autoFocus
                        onClick={onDelete}
                        className="font-medium underline underline-offset-[3px]"
                    >
                        Delete
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode("view")}
                        className="font-medium underline underline-offset-[3px]"
                    >
                        Keep
                    </button>
                </div>
            )}
        </article>
    );
}
