import type { Note, NoteAnchor, ReviewSession } from "@core/types/grsp";
import { commitsRange, shortSha } from "./commits";
import { sessionTitle, timestampMs } from "./sessions";

/** Oldest first, the order notes were written in. Does not mutate. */
export function sortNotes(notes: Note[]): Note[] {
    return [...notes].sort(
        (a, b) =>
            timestampMs(a.createdAt) - timestampMs(b.createdAt) ||
            a.id.localeCompare(b.id),
    );
}

/** `orders/services.py:21`, the block's label, or nothing for a general note. */
export function noteAnchorLabel(anchor: NoteAnchor | undefined): string {
    if (!anchor) return "";
    if (anchor.kind === "block") return anchor.label;
    return `${anchor.file}:${anchor.line}`;
}

/** A note written against a head the session has since moved on from. */
export function isNoteOutdated(note: Note, session: ReviewSession): boolean {
    return (
        session.headSha !== undefined &&
        note.headSha !== "" &&
        note.headSha !== session.headSha
    );
}

/** One line saying what was reviewed, for the top of an export. */
export function sessionIdentity(
    session: ReviewSession,
    repoName?: string,
): string {
    const source = session.source;
    const where = repoName ? ` in ${repoName}` : "";
    switch (source.kind) {
        case "pr":
            return `Pull request #${source.number}${where}`;
        case "branches":
            return `Branches \`${source.head}\` → \`${source.base}\`${where}`;
        case "commits": {
            const on = source.branch ? ` on \`${source.branch}\`` : "";
            return source.count === 1
                ? `Commit \`${shortSha(source.head)}\`${on}${where}`
                : `${source.count} commits \`${commitsRange(source)}\`${on}${where}`;
        }
    }
}

function isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** Groups that keep the order their first member appeared in. */
function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
    const groups = new Map<string, T[]>();
    for (const item of items) {
        const k = key(item);
        const list = groups.get(k);
        if (list) list.push(item);
        else groups.set(k, [item]);
    }
    return [...groups.entries()];
}

export interface NotesExportOptions {
    /** `owner/name` or the folder name, when known. */
    repoName?: string;
    /** The export date; defaults to now. */
    now?: Date;
}

/**
 * The notes of a session as one Markdown document: what was reviewed, then
 * general notes, then notes by file (by line) and by walkthrough block.
 * Bodies are kept exactly as written.
 */
export function notesMarkdown(
    session: ReviewSession,
    notes: Note[],
    options: NotesExportOptions = {},
): string {
    const sorted = sortNotes(notes).filter((n) => n.body.trim() !== "");
    const out: string[] = [];
    const push = (...lines: string[]) => out.push(...lines, "");
    const body = (note: Note) =>
        isNoteOutdated(note, session)
            ? `${note.body.trim()}\n\n_Written at \`${shortSha(note.headSha)}\`, an earlier version._`
            : note.body.trim();

    push(`# Notes: ${sessionTitle(session)}`);
    const facts = [`- ${sessionIdentity(session, options.repoName)}`];
    if (session.headSha) facts.push(`- Head \`${shortSha(session.headSha)}\``);
    facts.push(`- Exported ${isoDate(options.now ?? new Date())}`);
    push(...facts);

    if (sorted.length === 0) {
        push("No notes yet.");
        return `${out.join("\n").trimEnd()}\n`;
    }

    const general = sorted.filter((n) => !n.anchor);
    if (general.length > 0) {
        push("## General");
        for (const note of general) push(body(note));
    }

    const lines = sorted.flatMap((note) =>
        note.anchor?.kind === "line" ? [{ note, anchor: note.anchor }] : [],
    );
    if (lines.length > 0) {
        push("## Files");
        for (const [file, items] of groupBy(lines, (i) => i.anchor.file)) {
            push(`### \`${file}\``);
            const ordered = [...items].sort(
                (a, b) => a.anchor.line - b.anchor.line,
            );
            for (const { note, anchor } of ordered) {
                push(
                    anchor.side === "old"
                        ? `**Line ${anchor.line}** (before the change)`
                        : `**Line ${anchor.line}**`,
                );
                push(body(note));
            }
        }
    }

    const blocks = sorted.flatMap((note) =>
        note.anchor?.kind === "block" ? [{ note, anchor: note.anchor }] : [],
    );
    if (blocks.length > 0) {
        push("## Walkthrough");
        const groups = groupBy(
            blocks,
            (i) => `${i.anchor.entryPointId}\u0000${i.anchor.blockId}`,
        );
        for (const [, items] of groups) {
            push(`### ${items[0].anchor.label}`);
            for (const { note } of items) push(body(note));
        }
    }

    return `${out.join("\n").trimEnd()}\n`;
}

/** `grsp-notes-482.md`, `grsp-notes-3f2a91c.md`: a safe default file name. */
export function notesFileName(session: ReviewSession): string {
    const source = session.source;
    const id =
        source.kind === "pr"
            ? String(source.number)
            : source.kind === "commits"
              ? shortSha(source.head)
              : source.head;
    const safe = id.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return `grsp-notes-${safe || "review"}.md`;
}
