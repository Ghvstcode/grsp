import type { Repo, RepoNotAddedError, ReviewSession } from "@core/types/grsp";

export type SessionStatusLabel =
    | "In progress"
    | "Reviewed"
    | "Merged"
    | "Closed"
    | "Stale";

/**
 * The status shown next to a session in the sidebar (SPEC §5.9).
 * GitHub's verdict on the PR wins, then staleness, then whether the user
 * has posted a review.
 */
export function sessionStatusLabel(session: ReviewSession): SessionStatusLabel {
    if (session.prState === "merged") return "Merged";
    if (session.prState === "closed" || session.status === "closed") {
        return "Closed";
    }
    if (session.status === "stale") return "Stale";
    if (session.postedReview) return "Reviewed";
    return "In progress";
}

/** `#482` for PR sessions, `head → base` for branch-pair sessions. */
export function sessionRefLabel(session: ReviewSession): string {
    if (session.source.kind === "pr") return `#${session.source.number}`;
    return `${session.source.head} → ${session.source.base}`;
}

/** Title to show; branch sessions without one fall back to the head branch. */
export function sessionTitle(session: ReviewSession): string {
    const title = session.title.trim();
    if (title) return title;
    return session.source.kind === "branches"
        ? session.source.head
        : "Untitled pull request";
}

/**
 * Milliseconds for a timestamp from Rust (ISO 8601) or SQLite
 * (`YYYY-MM-DD HH:MM:SS`, UTC). Unparseable values sort last.
 */
export function timestampMs(value: string): number {
    const trimmed = value.trim();
    const sqlite = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(
        trimmed,
    );
    const ms = Date.parse(sqlite ? `${trimmed.replace(" ", "T")}Z` : trimmed);
    return Number.isNaN(ms) ? 0 : ms;
}

/** Most recently opened first. Does not mutate the input. */
export function sortSessionsByLastOpened(
    sessions: ReviewSession[],
): ReviewSession[] {
    return [...sessions].sort(
        (a, b) =>
            timestampMs(b.lastOpenedAt) - timestampMs(a.lastOpenedAt) ||
            timestampMs(b.createdAt) - timestampMs(a.createdAt),
    );
}

export interface SessionGroup {
    /** undefined for sessions whose repo folder is no longer listed. */
    repo: Repo | undefined;
    key: string;
    name: string;
    sessions: ReviewSession[];
}

/**
 * One group per repo folder, in the order the folders were given, each
 * sorted by last opened. Sessions without a listed repo are kept in a
 * trailing "Other" group rather than hidden.
 */
export function groupSessionsByRepo(
    repos: Repo[],
    sessions: ReviewSession[],
): SessionGroup[] {
    const byRepo = new Map<string, ReviewSession[]>();
    for (const session of sessions) {
        const list = byRepo.get(session.repoId) ?? [];
        list.push(session);
        byRepo.set(session.repoId, list);
    }

    const groups: SessionGroup[] = repos.map((repo) => ({
        repo,
        key: repo.id,
        name: repo.name,
        sessions: sortSessionsByLastOpened(byRepo.get(repo.id) ?? []),
    }));

    const known = new Set(repos.map((r) => r.id));
    const orphans = sessions.filter((s) => !known.has(s.repoId));
    if (orphans.length > 0) {
        groups.push({
            repo: undefined,
            key: "__other__",
            name: "Other",
            sessions: sortSessionsByLastOpened(orphans),
        });
    }
    return groups;
}

/** Human-readable message from whatever a Tauri command rejected with. */
export function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "Something went wrong";
}

/**
 * `session_create` rejects with a JSON-encoded RepoNotAddedError when the
 * PR's repo hasn't been added. Returns it, or undefined for any other error.
 */
export function parseRepoNotAdded(
    error: unknown,
): RepoNotAddedError | undefined {
    const raw =
        typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : undefined;

    let candidate: unknown = error;
    if (raw !== undefined) {
        try {
            candidate = JSON.parse(raw);
        } catch {
            return undefined;
        }
    }

    if (
        typeof candidate === "object" &&
        candidate !== null &&
        "code" in candidate &&
        candidate.code === "repo_not_added" &&
        "owner" in candidate &&
        typeof candidate.owner === "string" &&
        "name" in candidate &&
        typeof candidate.name === "string"
    ) {
        return {
            code: "repo_not_added",
            owner: candidate.owner,
            name: candidate.name,
        };
    }
    return undefined;
}

/** Loose check used to enable the "Open" button; Rust does the real parsing. */
export function looksLikePrUrl(value: string): boolean {
    return /^https?:\/\/[^/\s]+\/[^/\s]+\/[^/\s]+\/pull\/\d+/.test(
        value.trim(),
    );
}

/** "2h ago", "3d ago"; falls back to a date after four weeks. */
export function relativeTime(value: string, now: number = Date.now()): string {
    const ms = timestampMs(value);
    if (ms === 0) return "";
    const seconds = Math.max(0, Math.round((now - ms) / 1000));
    if (seconds < 60) return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 28) return `${days}d ago`;
    return new Date(ms).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}
