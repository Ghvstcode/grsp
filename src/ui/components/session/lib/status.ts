import type {
    AffectedTag,
    Analysis,
    AskMessage,
    BlockKind,
    ChangeStatus,
    CiStatus,
    CodeRef,
    DiscussionResult,
    DiscussionThread,
    Excerpt,
    ReviewSession,
    VerificationReport,
} from "@core/types/grsp";
import { isBot, plural } from "./text";

/** What a Gist section (or any analysis-backed view) should render. */
export type SectionState = "waiting" | "running" | "error" | "done";

export function sectionState(analysis: Analysis | undefined): SectionState {
    if (!analysis) return "waiting";
    if (analysis.status === "running") return "running";
    if (analysis.status === "error") return "error";
    if (analysis.status === "done" && analysis.result !== undefined) {
        return "done";
    }
    return "waiting";
}

export function changeLabel(status: ChangeStatus): string {
    switch (status) {
        case "new":
            return "New";
        case "changed":
            return "Changed";
        case "unchanged":
            return "Unchanged";
        case "removed":
            return "Removed";
        case "not_covered":
            return "Not covered";
    }
}

export function tagLabel(tag: AffectedTag): string {
    switch (tag) {
        case "new":
            return "New";
        case "changed":
            return "Changed";
        case "timing":
            return "Timing";
        case "not_covered":
            return "Not covered";
    }
}

const KIND_LABELS: Record<BlockKind, string> = {
    route: "Route",
    validation: "Validation",
    service: "Service",
    policy: "Policy",
    auth: "Auth",
    data_access: "Data access",
    db_write: "DB write",
    event: "Event",
    external: "External",
    job: "Job",
    ui: "UI",
    other: "Step",
};

export function kindLabel(kind: BlockKind): string {
    return KIND_LABELS[kind];
}

/** "12/12 checks passing"; undefined when there is nothing to show. */
export function ciLabel(ci: CiStatus | undefined): string | undefined {
    if (!ci || ci.state === "none" || ci.total === 0) return undefined;
    const word =
        ci.state === "passing"
            ? "passing"
            : ci.state === "failing"
              ? "failing"
              : "running";
    const shown = ci.state === "failing" ? ci.total - ci.passed : ci.passed;
    return `${shown}/${ci.total} checks ${word}`;
}

/** `orders/policies.py:1`, or just the file when the ref has no real line. */
export function refLabel(ref: CodeRef): string {
    const range =
        ref.endLine !== undefined && ref.endLine > ref.startLine
            ? `${ref.startLine}–${ref.endLine}`
            : `${ref.startLine}`;
    return `${ref.file}:${range}`;
}

/** Header stat of a code block: `+5 −1` for diffs, `lines 30–35` otherwise. */
export function excerptStat(excerpt: Excerpt): string {
    const added = excerpt.lines.filter((l) => l.sign === "+").length;
    const removed = excerpt.lines.filter((l) => l.sign === "-").length;
    if (added > 0 || removed > 0) return `+${added} −${removed}`;
    if (excerpt.lines.length === 0) return "";
    const first = excerpt.lines[0].n;
    const last = excerpt.lines[excerpt.lines.length - 1].n;
    return first === last ? `line ${first}` : `lines ${first}–${last}`;
}

/** The verification honesty line under "Code does" (SPEC §3.5, §5.7). */
export function honestyLine(
    report: VerificationReport | undefined,
    shards?: number,
): string {
    const parts: string[] = [];
    if (report) {
        if (report.filesExplored !== undefined) {
            parts.push(
                `Agent explored ${plural(report.filesExplored, "file")}`,
            );
        }
        parts.push(`${plural(report.verified, "reference")} verified`);
        if (report.unverified > 0) {
            parts.push(`${report.unverified} unverified`);
        }
    }
    if (shards !== undefined && shards > 1) {
        parts.push(`Large PR: analysed in ${shards} parts`);
    }
    return parts.join(" · ");
}

/** The trace line above an Ask answer. */
export function traceLine(message: AskMessage): string {
    if (message.answer && !message.answer.grounded) return "No direct match";
    const report = message.verification;
    if (!report) return "Answer";
    const parts: string[] = [];
    if (report.filesExplored !== undefined) {
        parts.push(`Explored ${plural(report.filesExplored, "file")}`);
    }
    parts.push(`${plural(report.verified, "reference")} verified`);
    return parts.join(" · ");
}

export interface DiscussionCounts {
    open: number;
    resolved: number;
    comments: number;
    people: number;
    /** Threads made only of bot comments. */
    automated: number;
}

/**
 * A general comment thread made only of bots (CI reports, linkbacks,
 * auto-summaries). A bot's comment on a line of code is review feedback, so
 * it stays a normal thread.
 */
export function isAutomatedThread(thread: DiscussionThread): boolean {
    return (
        thread.path === undefined &&
        thread.comments.length > 0 &&
        thread.comments.every((c) => isBot(c.author))
    );
}

/** Counts what people said; automated threads are tallied separately. */
export function discussionCounts(result: DiscussionResult): DiscussionCounts {
    const people = new Set<string>();
    let comments = 0;
    let botComments = 0;
    for (const thread of result.threads) {
        for (const comment of thread.comments) {
            if (isBot(comment.author)) {
                botComments += 1;
            } else {
                people.add(comment.author);
                comments += 1;
            }
        }
    }
    const human = result.threads.filter((t) => !isAutomatedThread(t));
    return {
        open: human.filter((t) => !t.resolved).length,
        resolved: human.filter((t) => t.resolved).length,
        automated: result.threads.length - human.length,
        comments: Math.max(comments, result.commentCount - botComments),
        people: people.size,
    };
}

/** The collapsed one-line digest: thread counts, then the agent's summary. */
export function discussionOneLiner(result: DiscussionResult): string {
    const counts = discussionCounts(result);
    const parts: string[] = [];
    if (counts.open > 0) parts.push(`${plural(counts.open, "open thread")}.`);
    if (counts.resolved > 0) parts.push(`${counts.resolved} resolved.`);
    if (result.digest) parts.push(result.digest);
    return parts.join(" ");
}

/** Wording that depends on what a session reviews. */
export interface SourceWording {
    /** Label of the card that holds what the author wrote. */
    authorLabel: string;
    /** Shown in that card when the author wrote nothing. */
    noDescription: string;
    expand: string;
    collapse: string;
    /** Why there is no discussion; undefined for pull requests. */
    noDiscussion?: string;
    /** Why a review can't be posted; undefined for pull requests. */
    noPosting?: string;
    /** The idle review card's explanation. */
    reviewIntro: string;
    preparing: string;
}

export function sourceWording(session: ReviewSession): SourceWording {
    const source = session.source;
    if (source.kind === "pr") {
        return {
            authorLabel: "Author says",
            noDescription: "No description to compare against.",
            expand: "Read full description",
            collapse: "Collapse description",
            reviewIntro:
                "Reads the change, the paths it touches and the existing discussion, then drafts inline comments. Nothing is posted until you choose a verdict.",
            preparing: "Getting this pull request ready",
        };
    }
    if (source.kind === "branches") {
        return {
            authorLabel: "Author says",
            noDescription: "No description to compare against.",
            expand: "Read full description",
            collapse: "Collapse description",
            noDiscussion:
                "There's no discussion for a branch comparison. Open a pull request to see its threads here.",
            noPosting:
                "Posting isn't available for a branch comparison. Open a pull request for these branches to post this review to GitHub.",
            reviewIntro:
                "Reads the change and the paths it touches, then drafts comments. A branch comparison has no pull request, so nothing can be posted.",
            preparing: "Getting these branches ready",
        };
    }
    const one = source.count === 1;
    return {
        authorLabel: one ? "Commit message" : "Commit messages",
        noDescription: one
            ? "The commit message is only its subject line."
            : "These commits have no message beyond their subject lines.",
        expand: one ? "Read full message" : "Read all messages",
        collapse: one ? "Collapse message" : "Collapse messages",
        noDiscussion: one
            ? "There's no discussion for a commit. Comments live on pull requests; your own notes are under Notes."
            : "There's no discussion for commits. Comments live on pull requests; your own notes are under Notes.",
        noPosting: one
            ? "Posting isn't available for a commit: there's no pull request to post to. The findings and your edits stay here."
            : "Posting isn't available for commits: there's no pull request to post to. The findings and your edits stay here.",
        reviewIntro: one
            ? "Reads the commit and the paths it touches, then drafts comments. A commit has no pull request, so nothing can be posted."
            : "Reads these commits and the paths they touch, then drafts comments. Commits have no pull request, so nothing can be posted.",
        preparing: one
            ? "Getting this commit ready"
            : "Getting these commits ready",
    };
}

/** A session is a PR (not a branch pair) with a number and a URL. */
export function prOf(session: ReviewSession) {
    return session.source.kind === "pr" ? session.source : undefined;
}

/** "acme/orders-api" from the PR URL; undefined for branch pairs. */
export function repoSlugOf(session: ReviewSession): string | undefined {
    const pr = prOf(session);
    if (!pr) return undefined;
    const match = /github\.com\/([^/]+\/[^/]+)\/pull\//.exec(pr.url);
    return match?.[1];
}

/** An answer or review computed for a different head than the session's. */
export function isFromEarlierVersion(
    headSha: string,
    session: ReviewSession,
): boolean {
    return (
        session.headSha !== undefined &&
        headSha !== "" &&
        headSha !== session.headSha
    );
}
