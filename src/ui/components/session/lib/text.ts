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

const ENTITIES: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&nbsp;": " ",
};

/**
 * GitHub bodies mix markdown with HTML: hidden `<!-- markers -->`,
 * `<details>` blocks, `<a>` links, `<sub>`, `<br>`. Turn the useful parts
 * into markdown and drop the rest, so nothing renders as raw markup. Code
 * fences and inline code are left untouched.
 */
export function cleanGithubMarkdown(body: string): string {
    // Split out code so tags inside it survive.
    const pieces = body.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
    return pieces
        .map((piece, index) => {
            if (index % 2 === 1) return piece;
            return piece
                .replace(/<!--[\s\S]*?-->/g, "")
                .replace(
                    /<summary[^>]*>([\s\S]*?)<\/summary>/gi,
                    (_m, inner: string) => `\n\n**${inner.trim()}**\n\n`,
                )
                .replace(
                    /<a\s[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
                    (_m, href: string, text: string) =>
                        `[${text.replace(/<[^>]+>/g, "").trim() || href}](${href})`,
                )
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<\/(?:p|div|details|li|tr|h[1-6])>/gi, "\n\n")
                .replace(/<li[^>]*>/gi, "- ")
                .replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/gi, "**$1**")
                .replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/gi, "*$1*")
                .replace(/<code>([\s\S]*?)<\/code>/gi, "`$1`")
                .replace(/<\/?[a-zA-Z][^>]*>/g, "")
                .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e]);
        })
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/** One-paragraph plain-text preview of a GitHub comment, for clamping. */
export function commentPreview(body: string): string {
    return descriptionPreview(cleanGithubMarkdown(body));
}

/** GitHub marks app accounts with a "[bot]" suffix. */
export function isBot(author: string): boolean {
    return author.endsWith("[bot]");
}

/** "coderabbitai[bot]" → "coderabbitai". */
export function authorName(author: string): string {
    return author.replace(/\[bot\]$/, "");
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

/**
 * Long paths keep their end, where the file name is:
 * "spa-frontend/src/views/app/cases/Detail.vue" → "…/cases/Detail.vue".
 */
export function shortPath(path: string, maxChars = 44): string {
    if (path.length <= maxChars) return path;
    const segments = path.split("/");
    let kept = segments[segments.length - 1];
    for (let i = segments.length - 2; i >= 0; i--) {
        const next = `${segments[i]}/${kept}`;
        if (next.length + 2 > maxChars) break;
        kept = next;
    }
    return kept === path ? path : `…/${kept}`;
}
