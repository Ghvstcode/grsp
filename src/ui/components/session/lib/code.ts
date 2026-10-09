import type { DiffFilePatch, Note } from "@core/types/grsp";

export type DiffStyle = "split" | "unified";
export type LineSide = "old" | "new";

/** A line of a file in the diff: where a note is pinned or being written. */
export interface LineTarget {
    line: number;
    side: LineSide;
}

/** Everything pinned to one line: its notes and, maybe, a new one in progress. */
export interface LineThread extends LineTarget {
    notes: Note[];
    composing: boolean;
}

/** The line notes of one file. */
export function notesForFile(notes: Note[], path: string): Note[] {
    return notes.filter(
        (note) => note.anchor?.kind === "line" && note.anchor.file === path,
    );
}

/** How many line notes each file has, for the file list. */
export function noteCountsByFile(notes: Note[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const note of notes) {
        if (note.anchor?.kind !== "line") continue;
        counts.set(note.anchor.file, (counts.get(note.anchor.file) ?? 0) + 1);
    }
    return counts;
}

/**
 * One thread per annotated line, in line order (old side first on a tie).
 * The diff shows one annotation per line and side, so notes on the same
 * line share a thread.
 */
export function lineThreads(
    notes: Note[],
    composing: LineTarget | undefined,
): LineThread[] {
    const threads = new Map<string, LineThread>();
    const at = (target: LineTarget) => {
        const key = `${target.side}:${target.line}`;
        let thread = threads.get(key);
        if (!thread) {
            thread = {
                line: target.line,
                side: target.side,
                notes: [],
                composing: false,
            };
            threads.set(key, thread);
        }
        return thread;
    };
    for (const note of notes) {
        if (note.anchor?.kind !== "line") continue;
        at(note.anchor).notes.push(note);
    }
    if (composing) at(composing).composing = true;
    return [...threads.values()].sort(
        (a, b) =>
            a.line - b.line ||
            (a.side === b.side ? 0 : a.side === "old" ? -1 : 1),
    );
}

/** `orders/services.py` → folder `orders`, name `services.py`. */
export function splitPath(path: string): { dir: string; name: string } {
    const cut = path.lastIndexOf("/");
    if (cut < 0) return { dir: "", name: path };
    return { dir: path.slice(0, cut), name: path.slice(cut + 1) };
}

/**
 * Files whose path (or old path, for renames) contains every word of the
 * query, case-insensitively. An empty query keeps everything.
 */
export function filterFiles(
    files: DiffFilePatch[],
    query: string,
): DiffFilePatch[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return files;
    return files.filter((file) => {
        const haystack = `${file.path} ${file.oldPath ?? ""}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
    });
}

/** The file `step` places away from `current` in `files`, clamped to the ends. */
export function neighbourFile(
    files: DiffFilePatch[],
    current: string | undefined,
    step: 1 | -1,
): DiffFilePatch | undefined {
    if (files.length === 0) return undefined;
    const index = files.findIndex((file) => file.path === current);
    if (index < 0) return files[0];
    return files[Math.min(files.length - 1, Math.max(0, index + step))];
}

export const FILE_STATUS: Record<
    DiffFilePatch["status"],
    { mark: string; label: string }
> = {
    added: { mark: "A", label: "Added" },
    modified: { mark: "M", label: "Modified" },
    deleted: { mark: "D", label: "Deleted" },
    renamed: { mark: "R", label: "Renamed" },
};

/**
 * Why a file has no diff to draw, or undefined when it has one: binary
 * files, patches cut off for size, and renames that changed no content.
 */
export function unshowableReason(file: DiffFilePatch): string | undefined {
    if (file.binary) return "Binary file. There is nothing to show as text.";
    if (file.truncated) {
        return "This file's diff is too large to show here.";
    }
    if (!/^@@ /m.test(file.patch)) {
        return file.status === "renamed"
            ? `Renamed from ${file.oldPath ?? "another path"} with no changes to its contents.`
            : "No changes to this file's contents (its mode or path changed).";
    }
    return undefined;
}

/** "2 files left out (vendored, generated, lockfiles)"; "" when none were. */
export function excludedNote(count: number): string {
    if (count <= 0) return "";
    return `${count} ${count === 1 ? "file" : "files"} left out (vendored, generated, lockfiles)`;
}
