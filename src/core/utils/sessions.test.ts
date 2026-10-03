import { describe, expect, it } from "vitest";
import type { Repo, ReviewSession } from "@core/types/grsp";
import {
    groupSessionsByRepo,
    looksLikePrUrl,
    parseRepoNotAdded,
    relativeTime,
    sessionRefLabel,
    sessionStatusLabel,
    sessionTitle,
    sortSessionsByLastOpened,
    timestampMs,
} from "./sessions";

function session(overrides: Partial<ReviewSession> = {}): ReviewSession {
    return {
        id: "s1",
        repoId: "r1",
        source: {
            kind: "pr",
            number: 482,
            url: "https://example.test/pull/482",
        },
        title: "Require second approval",
        description: "",
        author: "mira",
        baseRef: "main",
        headRef: "feat/approval",
        status: "ready",
        prState: "open",
        isOwnPr: false,
        filesChanged: 1,
        linesAdded: 1,
        linesRemoved: 0,
        newCommits: 0,
        agentPasses: 0,
        createdAt: "2026-01-01T00:00:00Z",
        lastOpenedAt: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

function repo(id: string, name: string): Repo {
    return {
        id,
        name,
        path: `/code/${name}`,
        defaultBranch: "main",
        sidebarOpen: true,
    };
}

describe("sessionStatusLabel", () => {
    it("is In progress for an open session with no posted review", () => {
        expect(sessionStatusLabel(session())).toBe("In progress");
        expect(sessionStatusLabel(session({ status: "preparing" }))).toBe(
            "In progress",
        );
    });

    it("is Reviewed once a review is posted", () => {
        const posted = { id: "1", url: "u", event: "COMMENT" as const };
        expect(sessionStatusLabel(session({ postedReview: posted }))).toBe(
            "Reviewed",
        );
    });

    it("is Stale when the head moved, even after a posted review", () => {
        const posted = { id: "1", url: "u", event: "APPROVE" as const };
        expect(
            sessionStatusLabel(
                session({ status: "stale", postedReview: posted }),
            ),
        ).toBe("Stale");
    });

    it("lets GitHub's merged/closed state win over everything else", () => {
        expect(
            sessionStatusLabel(session({ prState: "merged", status: "stale" })),
        ).toBe("Merged");
        expect(sessionStatusLabel(session({ prState: "closed" }))).toBe(
            "Closed",
        );
        expect(sessionStatusLabel(session({ status: "closed" }))).toBe(
            "Closed",
        );
    });
});

describe("sessionRefLabel / sessionTitle", () => {
    it("shows #num for PR sessions", () => {
        expect(sessionRefLabel(session())).toBe("#482");
    });

    it("shows head → base for branch-pair sessions", () => {
        const s = session({
            source: { kind: "branches", base: "main", head: "feat/x" },
            title: "  ",
        });
        expect(sessionRefLabel(s)).toBe("feat/x → main");
        expect(sessionTitle(s)).toBe("feat/x");
    });

    it("falls back when a PR has no title", () => {
        expect(sessionTitle(session({ title: "" }))).toBe(
            "Untitled pull request",
        );
    });
});

describe("timestampMs", () => {
    it("reads SQLite CURRENT_TIMESTAMP values as UTC", () => {
        expect(timestampMs("2026-03-04 05:06:07")).toBe(
            Date.parse("2026-03-04T05:06:07Z"),
        );
    });

    it("reads ISO values and returns 0 for junk", () => {
        expect(timestampMs("2026-03-04T05:06:07Z")).toBe(
            Date.parse("2026-03-04T05:06:07Z"),
        );
        expect(timestampMs("not a date")).toBe(0);
    });
});

describe("sortSessionsByLastOpened", () => {
    it("sorts most recently opened first across timestamp formats", () => {
        const a = session({ id: "a", lastOpenedAt: "2026-01-01 10:00:00" });
        const b = session({ id: "b", lastOpenedAt: "2026-01-03T09:00:00Z" });
        const c = session({ id: "c", lastOpenedAt: "2026-01-02 23:59:59" });
        const input = [a, b, c];
        expect(sortSessionsByLastOpened(input).map((s) => s.id)).toEqual([
            "b",
            "c",
            "a",
        ]);
        expect(input.map((s) => s.id)).toEqual(["a", "b", "c"]);
    });

    it("breaks ties by creation time", () => {
        const older = session({
            id: "older",
            createdAt: "2026-01-01T00:00:00Z",
        });
        const newer = session({
            id: "newer",
            createdAt: "2026-01-02T00:00:00Z",
        });
        expect(
            sortSessionsByLastOpened([older, newer]).map((s) => s.id),
        ).toEqual(["newer", "older"]);
    });
});

describe("groupSessionsByRepo", () => {
    it("keeps folder order, includes empty folders and sorts inside each", () => {
        const repos = [repo("r1", "orders-api"), repo("r2", "web")];
        const groups = groupSessionsByRepo(repos, [
            session({ id: "old", lastOpenedAt: "2026-01-01T00:00:00Z" }),
            session({ id: "new", lastOpenedAt: "2026-01-05T00:00:00Z" }),
        ]);
        expect(groups.map((g) => g.name)).toEqual(["orders-api", "web"]);
        expect(groups[0].sessions.map((s) => s.id)).toEqual(["new", "old"]);
        expect(groups[1].sessions).toEqual([]);
    });

    it("keeps sessions of unlisted folders in a trailing Other group", () => {
        const groups = groupSessionsByRepo(
            [repo("r1", "orders-api")],
            [session({ id: "x", repoId: "gone" })],
        );
        expect(groups).toHaveLength(2);
        expect(groups[1].repo).toBeUndefined();
        expect(groups[1].name).toBe("Other");
        expect(groups[1].sessions.map((s) => s.id)).toEqual(["x"]);
    });

    it("adds no Other group when every session has a folder", () => {
        expect(
            groupSessionsByRepo([repo("r1", "a")], [session()]),
        ).toHaveLength(1);
    });
});

describe("parseRepoNotAdded", () => {
    const payload = {
        code: "repo_not_added",
        owner: "acme",
        name: "orders-api",
    };

    it("parses the JSON-encoded rejection string", () => {
        expect(parseRepoNotAdded(JSON.stringify(payload))).toEqual(payload);
    });

    it("parses it from an Error message or a plain object", () => {
        expect(parseRepoNotAdded(new Error(JSON.stringify(payload)))).toEqual(
            payload,
        );
        expect(parseRepoNotAdded(payload)).toEqual(payload);
    });

    it("ignores ordinary errors and other JSON", () => {
        expect(parseRepoNotAdded("git fetch failed")).toBeUndefined();
        expect(parseRepoNotAdded(new Error("boom"))).toBeUndefined();
        expect(parseRepoNotAdded('{"code":"other"}')).toBeUndefined();
        expect(
            parseRepoNotAdded('{"code":"repo_not_added","owner":1}'),
        ).toBeUndefined();
        expect(parseRepoNotAdded(undefined)).toBeUndefined();
    });
});

describe("looksLikePrUrl", () => {
    it("accepts PR links with or without suffixes", () => {
        expect(looksLikePrUrl("https://github.com/acme/api/pull/482")).toBe(
            true,
        );
        expect(
            looksLikePrUrl(" https://github.com/acme/api/pull/482/files?w=1 "),
        ).toBe(true);
    });

    it("rejects other links", () => {
        expect(looksLikePrUrl("https://github.com/acme/api")).toBe(false);
        expect(looksLikePrUrl("https://github.com/acme/api/issues/4")).toBe(
            false,
        );
        expect(looksLikePrUrl("acme/api#482")).toBe(false);
    });
});

describe("relativeTime", () => {
    const now = Date.parse("2026-06-10T12:00:00Z");

    it("formats minutes, hours and days", () => {
        expect(relativeTime("2026-06-10T11:59:40Z", now)).toBe("just now");
        expect(relativeTime("2026-06-10T11:15:00Z", now)).toBe("45m ago");
        expect(relativeTime("2026-06-10T09:00:00Z", now)).toBe("3h ago");
        expect(relativeTime("2026-06-08T12:00:00Z", now)).toBe("2d ago");
    });

    it("is empty for an unparseable value", () => {
        expect(relativeTime("", now)).toBe("");
    });
});
