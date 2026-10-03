import type { CodeRef, Excerpt, ExcerptLine } from "@core/types/grsp";

/** One source row of a fixture excerpt: kind + text, as in the prototype. */
export type Row = readonly ["ctx" | "add" | "del", string];

/**
 * Head-side lines of the fixture "worktree", by file then line number.
 * Every excerpt registers its lines here so `excerpt_read` can serve them.
 */
const worktree = new Map<string, Map<number, ExcerptLine>>();

function register(file: string, line: ExcerptLine) {
    let lines = worktree.get(file);
    if (!lines) {
        lines = new Map();
        worktree.set(file, lines);
    }
    lines.set(line.n, { n: line.n, text: line.text, sign: line.sign });
}

interface ExcerptOptions {
    highlight?: number;
    /** Pretend the block range was capped; `totalLines` is the full length. */
    totalLines?: number;
}

/** Build an Excerpt the way Rust would: numbered head lines + diff signs. */
export function excerpt(
    file: string,
    start: number,
    rows: readonly Row[],
    options: ExcerptOptions = {},
): Excerpt {
    let n = start;
    let added = 0;
    let removed = 0;
    const lines: ExcerptLine[] = rows.map(([kind, text]) => {
        if (kind === "del") {
            removed += 1;
            // Removed lines carry the number of the head line they precede.
            return { n, text, sign: "-" };
        }
        if (kind === "add") added += 1;
        const line: ExcerptLine = {
            n,
            text,
            sign: kind === "add" ? "+" : " ",
            highlight: options.highlight === n ? true : undefined,
        };
        register(file, line);
        n += 1;
        return line;
    });
    const shown = n - start;
    return {
        file,
        startLine: start,
        endLine: n - 1,
        lines,
        added,
        removed,
        truncated:
            options.totalLines !== undefined && options.totalLines > shown,
        totalLines: options.totalLines ?? shown,
    };
}

/** Add head lines that no excerpt shows by default (behind "Show all"). */
export function registerLines(
    file: string,
    start: number,
    rows: readonly Row[],
) {
    excerpt(file, start, rows);
}

export function emptyExcerpt(file: string, line: number): Excerpt {
    return {
        file,
        startLine: line,
        endLine: line,
        lines: [],
        added: 0,
        removed: 0,
        truncated: false,
        totalLines: 0,
    };
}

/** What `excerpt_read` returns in fixture mode. */
export function readRange(
    file: string,
    startLine: number,
    endLine: number,
): Excerpt {
    const known = worktree.get(file);
    const lines: ExcerptLine[] = [];
    for (let n = startLine; n <= endLine; n += 1) {
        const line = known?.get(n);
        if (line) lines.push({ ...line });
    }
    return {
        file,
        startLine,
        endLine,
        lines,
        added: lines.filter((l) => l.sign === "+").length,
        removed: 0,
        truncated: false,
        totalLines: lines.length,
    };
}

export function ref(file: string, startLine: number, anchor?: string): CodeRef {
    return { file, startLine, anchor, verified: true };
}
