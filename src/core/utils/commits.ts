import type {
    CommitInfo,
    CommitList,
    NewSessionInput,
    Repo,
    ReviewSession,
    SessionSource,
} from "@core/types/grsp";

type CommitsSource = Extract<SessionSource, { kind: "commits" }>;
type CommitsInput = Extract<NewSessionInput, { kind: "commits" }>;

/** What the reader picked in the commit list. */
export type CommitPick =
    /** Just this commit. */
    | { kind: "single"; sha: string }
    /** This commit and everything newer on the branch. */
    | { kind: "through"; sha: string }
    /** Everything above `lastReviewedSha`. */
    | { kind: "new" };

/** `3f2a91c` from a full SHA. */
export function shortSha(sha: string): string {
    return sha.slice(0, 7);
}

/**
 * How many commits sit above the last reviewed one. 0 when nothing was
 * reviewed on this branch, the marker has scrolled out of the list, or it
 * is already the newest commit.
 */
export function newCommitCount(list: CommitList): number {
    if (!list.lastReviewedSha) return 0;
    const index = list.commits.findIndex((c) => c.sha === list.lastReviewedSha);
    return Math.max(index, 0);
}

/**
 * The `session_create` input for a pick. `from` is only sent for a real
 * range: reviewing the newest commit "and everything newer" is that commit
 * on its own. Undefined when the pick doesn't match the list.
 */
export function commitsInput(
    repoId: string,
    list: CommitList,
    pick: CommitPick,
): CommitsInput | undefined {
    const newest: CommitInfo | undefined = list.commits[0];
    if (!newest) return undefined;
    const base = { kind: "commits", repoId, branch: list.branch } as const;

    if (pick.kind === "single") {
        if (!list.commits.some((c) => c.sha === pick.sha)) return undefined;
        return { ...base, head: pick.sha };
    }

    const oldestIndex =
        pick.kind === "new"
            ? newCommitCount(list) - 1
            : list.commits.findIndex((c) => c.sha === pick.sha);
    if (oldestIndex < 0) return undefined;
    if (oldestIndex === 0) return { ...base, head: newest.sha };
    return {
        ...base,
        head: newest.sha,
        from: list.commits[oldestIndex].sha,
    };
}

/** How many commits a pick covers, for button labels. */
export function pickCount(list: CommitList, pick: CommitPick): number {
    const input = commitsInput("", list, pick);
    if (!input) return 0;
    if (!input.from) return 1;
    return list.commits.findIndex((c) => c.sha === input.from) + 1;
}

/** `3f2a91c` for one commit, `5 commits` for a run. */
export function commitsLabel(source: CommitsSource): string {
    return source.count === 1
        ? shortSha(source.head)
        : `${source.count} commits`;
}

/** `a40f7d2..3f2a91c`: the range as git would write it. */
export function commitsRange(source: CommitsSource): string {
    return `${shortSha(source.base)}..${shortSha(source.head)}`;
}

/**
 * Where a commit session lives on GitHub: the commit page for one commit,
 * the compare view for a run. Undefined without a GitHub remote, or for
 * other kinds of session.
 */
export function commitsGithubUrl(
    session: ReviewSession,
    repo: Repo | undefined,
): string | undefined {
    const source = session.source;
    if (source.kind !== "commits" || repo?.remote?.host !== "github") {
        return undefined;
    }
    const root = `https://github.com/${repo.remote.owner}/${repo.remote.name}`;
    return source.count === 1
        ? `${root}/commit/${source.head}`
        : `${root}/compare/${source.base}...${source.head}`;
}

/** A commit session small enough that the diff alone may be all it needs. */
export const TINY_DIFF_LINES = 10;

export function isTinyCommitSession(session: ReviewSession): boolean {
    return (
        session.source.kind === "commits" &&
        session.linesAdded + session.linesRemoved <= TINY_DIFF_LINES
    );
}
