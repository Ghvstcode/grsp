/** "1 comment", "3 comments". */
export function plural(count: number, one: string, many = `${one}s`): string {
    return `${count} ${count === 1 ? one : many}`;
}

/** Comments longer than this clamp to 3 lines with "Show more". */
export const LONG_COMMENT_CHARS = 200;

export function isLongComment(text: string): boolean {
    return text.trim().length > LONG_COMMENT_CHARS;
}

export interface CommentPart {
    kind: "text" | "suggestion";
    text: string;
}

const SUGGESTION = /```suggestion[^\n]*\n([\s\S]*?)```/g;

/** Split a GitHub comment into prose and ```suggestion blocks. */
export function splitSuggestions(body: string): CommentPart[] {
    const parts: CommentPart[] = [];
    let cursor = 0;
    for (const match of body.matchAll(SUGGESTION)) {
        const before = body.slice(cursor, match.index).trim();
        if (before) parts.push({ kind: "text", text: before });
        parts.push({
            kind: "suggestion",
            text: match[1].replace(/\r?\n$/, ""),
        });
        cursor = match.index + match[0].length;
    }
    const rest = body.slice(cursor).trim();
    if (rest) parts.push({ kind: "text", text: rest });
    return parts;
}

/**
 * Plain-text preview of a markdown description for the 4-line clamp:
 * headings, list markers and emphasis are dropped, paragraphs joined.
 */
export function descriptionPreview(markdown: string): string {
    return markdown
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .split(/\r?\n/)
        .filter((line) => !/^\s{0,3}#{1,6}\s/.test(line))
        .map((line) =>
            line
                .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "")
                .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
                .replace(/[*`~]/g, "")
                // Underscores only when they wrap a word (_emphasis_), so
                // identifiers like PENDING_APPROVAL survive.
                .replace(/(^|[\s(])_{1,2}(?=\S)/g, "$1")
                .replace(/(\S)_{1,2}(?=[\s).,;:!?]|$)/g, "$1"),
        )
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
}

export function wordCount(text: string): number {
    const preview = descriptionPreview(text);
    return preview === "" ? 0 : preview.split(" ").length;
}

/** "~320 words": rounded to the nearest 10 above 20 words. */
export function wordCountLabel(text: string): string {
    const count = wordCount(text);
    if (count <= 20) return plural(count, "word");
    return `~${Math.round(count / 10) * 10} words`;
}

/** "2d ago", "20h ago", "just now". */
export function relativeTime(iso: string, now: number = Date.now()): string {
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return "";
    const minutes = Math.max(0, Math.round((now - then) / 60_000));
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.round(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.round(months / 12)}y ago`;
}

export function initialOf(name: string): string {
    return name.replace(/^@/, "").charAt(0).toUpperCase() || "?";
}
