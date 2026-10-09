import { describe, expect, it } from "vitest";
import type {
    CommitInfo,
    CommitList,
    Repo,
    ReviewSession,
} from "@core/types/grsp";
import {
    commitsGithubUrl,
    commitsInput,
    commitsLabel,
    commitsRange,
    isTinyCommitSession,
    newCommitCount,
    pickCount,
    shortSha,
} from "./commits";

function commit(sha: string): CommitInfo {
    return {
        sha,
        shortSha: sha.slice(0, 7),
        subject: `commit ${sha}`,
        body: "",
        author: "Mira",
        authoredAt: "2026-01-01T00:00:00Z",
        filesChanged: 1,
        added: 1,
        removed: 0,
        isMerge: false,
    };
}

// Newest first: e is the head of the branch, a its oldest listed commit.
function list(lastReviewedSha?: string): CommitList {
    return {
        branch: "main",
        commits: ["e", "d", "c", "b", "a"].map(commit),
        lastReviewedSha,
    };
}

const HEAD = "3f2a91c8d1e4b7a09c5512fe0a6d3b48c7e9f210";
const BASE = "a40f7d2c19b3e5f6a7b8c9d0e1f2a3b4c5d6e7f8";

function session(count: number, overrides: Partial<ReviewSession> = {}) {
    const value: ReviewSession = {
        id: "c1",
        repoId: "r1",
        source: {
            kind: "commits",
            branch: "main",
            base: BASE,
            head: HEAD,
            count,
        },
        title: "",
        description: "",
        author: "Mira",
        baseRef: "main",
        headRef: "main",
        status: "ready",
        prState: "open",
        isOwnPr: false,
        filesChanged: 1,
        linesAdded: 4,
        linesRemoved: 2,
        newCommits: 0,
        agentPasses: 0,
        createdAt: "2026-01-01T00:00:00Z",
        lastOpenedAt: "2026-01-01T00:00:00Z",
        ...overrides,
    };
    return value;
}

const repo: Repo = {
    id: "r1",
    name: "orders-api",
    path: "/code/orders-api",
    defaultBranch: "main",
    remote: { host: "github", owner: "acme", name: "orders-api" },
    sidebarOpen: true,
};

describe("commitsInput", () => {
    it("reviews a single commit on its own, without a range", () => {
        expect(
            commitsInput("r1", list(), { kind: "single", sha: "c" }),
        ).toEqual({ kind: "commits", repoId: "r1", branch: "main", head: "c" });
    });

    it("reviews a commit and everything newer as from..newest", () => {
        expect(
            commitsInput("r1", list(), { kind: "through", sha: "c" }),
        ).toEqual({
            kind: "commits",
            repoId: "r1",
            branch: "main",
            head: "e",
            from: "c",
        });
    });

    it("treats the newest commit 'and newer' as that commit alone", () => {
        expect(
            commitsInput("r1", list(), { kind: "through", sha: "e" }),
        ).toEqual({ kind: "commits", repoId: "r1", branch: "main", head: "e" });
    });

    it("reviews what arrived since the last review", () => {
        expect(commitsInput("r1", list("c"), { kind: "new" })).toEqual({
            kind: "commits",
            repoId: "r1",
            branch: "main",
            head: "e",
            from: "d",
        });
        // One new commit is not a range.
        expect(commitsInput("r1", list("d"), { kind: "new" })).toEqual({
            kind: "commits",
            repoId: "r1",
            branch: "main",
            head: "e",
        });
    });

    it("returns nothing when the pick doesn't match the list", () => {
        expect(
            commitsInput("r1", list(), { kind: "single", sha: "zz" }),
        ).toBeUndefined();
        expect(
            commitsInput("r1", list(), { kind: "through", sha: "zz" }),
        ).toBeUndefined();
        expect(commitsInput("r1", list(), { kind: "new" })).toBeUndefined();
        expect(commitsInput("r1", list("e"), { kind: "new" })).toBeUndefined();
        expect(
            commitsInput(
                "r1",
                { branch: "main", commits: [] },
                { kind: "new" },
            ),
        ).toBeUndefined();
    });
});

describe("newCommitCount and pickCount", () => {
    it("counts the commits above the last reviewed one", () => {
        expect(newCommitCount(list("c"))).toBe(2);
        expect(newCommitCount(list("e"))).toBe(0);
        expect(newCommitCount(list())).toBe(0);
        // The marker has scrolled out of the list.
        expect(newCommitCount(list("gone"))).toBe(0);
    });

    it("says how many commits a pick covers", () => {
        expect(pickCount(list(), { kind: "single", sha: "b" })).toBe(1);
        expect(pickCount(list(), { kind: "through", sha: "b" })).toBe(4);
        expect(pickCount(list(), { kind: "through", sha: "e" })).toBe(1);
        expect(pickCount(list("b"), { kind: "new" })).toBe(3);
        expect(pickCount(list(), { kind: "new" })).toBe(0);
    });
});

describe("commit labels", () => {
    it("shortens a SHA to seven characters", () => {
        expect(shortSha(HEAD)).toBe("3f2a91c");
    });

    it("labels one commit by SHA and a run by its size", () => {
        const one = session(1).source;
        const many = session(5).source;
        if (one.kind !== "commits" || many.kind !== "commits") {
            throw new Error("expected commit sources");
        }
        expect(commitsLabel(one)).toBe("3f2a91c");
        expect(commitsLabel(many)).toBe("5 commits");
        expect(commitsRange(many)).toBe("a40f7d2..3f2a91c");
    });
});

describe("commitsGithubUrl", () => {
    it("links one commit to its page and a run to the compare view", () => {
        expect(commitsGithubUrl(session(1), repo)).toBe(
            `https://github.com/acme/orders-api/commit/${HEAD}`,
        );
        expect(commitsGithubUrl(session(3), repo)).toBe(
            `https://github.com/acme/orders-api/compare/${BASE}...${HEAD}`,
        );
    });

    it("has no link without a GitHub remote or for other sessions", () => {
        expect(commitsGithubUrl(session(1), undefined)).toBeUndefined();
        expect(
            commitsGithubUrl(session(1), { ...repo, remote: undefined }),
        ).toBeUndefined();
        expect(
            commitsGithubUrl(
                session(1, {
                    source: { kind: "branches", base: "main", head: "x" },
                }),
                repo,
            ),
        ).toBeUndefined();
    });
});

describe("isTinyCommitSession", () => {
    it("is true for commit sessions of ten changed lines or fewer", () => {
        expect(isTinyCommitSession(session(1))).toBe(true);
        expect(
            isTinyCommitSession(
                session(1, { linesAdded: 10, linesRemoved: 0 }),
            ),
        ).toBe(true);
        expect(
            isTinyCommitSession(session(1, { linesAdded: 9, linesRemoved: 2 })),
        ).toBe(false);
    });

    it("never applies to pull requests or branch pairs", () => {
        expect(
            isTinyCommitSession(
                session(1, {
                    source: { kind: "pr", number: 1, url: "https://x/pull/1" },
                }),
            ),
        ).toBe(false);
    });
});
