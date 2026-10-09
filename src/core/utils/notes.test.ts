import { describe, expect, it } from "vitest";
import type { Note, ReviewSession } from "@core/types/grsp";
import {
    isNoteOutdated,
    noteAnchorLabel,
    notesFileName,
    notesMarkdown,
    sessionIdentity,
    sortNotes,
} from "./notes";

const HEAD = "3f2a91c8d1e4b7a09c5512fe0a6d3b48c7e9f210";
const BASE = "a40f7d2c19b3e5f6a7b8c9d0e1f2a3b4c5d6e7f8";
const NOW = new Date("2026-10-09T12:00:00Z");

function session(overrides: Partial<ReviewSession> = {}): ReviewSession {
    return {
        id: "s482",
        repoId: "orders",
        source: {
            kind: "pr",
            number: 482,
            url: "https://github.com/acme/orders-api/pull/482",
        },
        title: "Require second approval for orders over €10k",
        description: "",
        author: "kemi.a",
        baseRef: "main",
        headRef: "feat/order-approval",
        headSha: HEAD,
        status: "ready",
        prState: "open",
        isOwnPr: false,
        filesChanged: 9,
        linesAdded: 212,
        linesRemoved: 38,
        newCommits: 0,
        agentPasses: 0,
        createdAt: "2026-10-08T00:00:00Z",
        lastOpenedAt: "2026-10-08T00:00:00Z",
        ...overrides,
    };
}

function note(id: string, minute: number, extra: Partial<Note> = {}): Note {
    const at = `2026-10-09T10:${String(minute).padStart(2, "0")}:00Z`;
    return {
        id,
        sessionId: "s482",
        body: `Body of ${id}.`,
        headSha: HEAD,
        createdAt: at,
        updatedAt: at,
        ...extra,
    };
}

const commitSource = (count: number, branch?: string) =>
    ({ kind: "commits", branch, base: BASE, head: HEAD, count }) as const;

describe("sortNotes", () => {
    it("puts the oldest first without mutating the input", () => {
        const input = [note("b", 5), note("c", 9), note("a", 1)];
        expect(sortNotes(input).map((n) => n.id)).toEqual(["a", "b", "c"]);
        expect(input.map((n) => n.id)).toEqual(["b", "c", "a"]);
    });
});

describe("noteAnchorLabel", () => {
    it("labels lines, blocks and general notes", () => {
        expect(
            noteAnchorLabel({
                kind: "line",
                file: "orders/policies.py",
                line: 6,
                side: "new",
            }),
        ).toBe("orders/policies.py:6");
        expect(
            noteAnchorLabel({
                kind: "block",
                entryPointId: "ep_orders",
                blockId: "policy",
                label: "ApprovalPolicy.check",
            }),
        ).toBe("ApprovalPolicy.check");
        expect(noteAnchorLabel(undefined)).toBe("");
    });
});

describe("isNoteOutdated", () => {
    it("flags notes written against another head", () => {
        expect(isNoteOutdated(note("a", 1), session())).toBe(false);
        expect(isNoteOutdated(note("a", 1, { headSha: BASE }), session())).toBe(
            true,
        );
        expect(
            isNoteOutdated(
                note("a", 1, { headSha: BASE }),
                session({ headSha: undefined }),
            ),
        ).toBe(false);
    });
});

describe("sessionIdentity", () => {
    it("names a pull request, a branch pair, a commit and a run", () => {
        expect(sessionIdentity(session(), "acme/orders-api")).toBe(
            "Pull request #482 in acme/orders-api",
        );
        expect(
            sessionIdentity(
                session({
                    source: { kind: "branches", base: "main", head: "feat/x" },
                }),
            ),
        ).toBe("Branches `feat/x` → `main`");
        expect(
            sessionIdentity(session({ source: commitSource(1, "main") })),
        ).toBe("Commit `3f2a91c` on `main`");
        expect(
            sessionIdentity(session({ source: commitSource(4) }), "orders-api"),
        ).toBe("4 commits `a40f7d2..3f2a91c` in orders-api");
    });
});

describe("notesMarkdown", () => {
    it("writes a tidy document grouped by file and walkthrough block", () => {
        const notes = [
            note("line-late", 4, {
                body: "Second file note.",
                anchor: {
                    kind: "line",
                    file: "orders/services.py",
                    line: 30,
                    side: "new",
                },
            }),
            note("general", 1, { body: "Ask Kemi about the import.\n" }),
            note("block", 3, {
                body: "Why static?",
                anchor: {
                    kind: "block",
                    entryPointId: "ep_orders",
                    blockId: "policy",
                    label: "ApprovalPolicy.check",
                },
            }),
            note("line-early", 5, {
                body: "Removed capture here.",
                anchor: {
                    kind: "line",
                    file: "orders/services.py",
                    line: 23,
                    side: "old",
                },
            }),
            note("other-file", 2, {
                body: "`>` not `>=`.",
                anchor: {
                    kind: "line",
                    file: "orders/policies.py",
                    line: 6,
                    side: "new",
                },
            }),
            note("blank", 6, { body: "   " }),
        ];
        expect(
            notesMarkdown(session(), notes, {
                repoName: "acme/orders-api",
                now: NOW,
            }),
        ).toBe(
            [
                "# Notes: Require second approval for orders over €10k",
                "",
                "- Pull request #482 in acme/orders-api",
                "- Head `3f2a91c`",
                "- Exported 2026-10-09",
                "",
                "## General",
                "",
                "Ask Kemi about the import.",
                "",
                "## Files",
                "",
                "### `orders/policies.py`",
                "",
                "**Line 6**",
                "",
                "`>` not `>=`.",
                "",
                "### `orders/services.py`",
                "",
                "**Line 23** (before the change)",
                "",
                "Removed capture here.",
                "",
                "**Line 30**",
                "",
                "Second file note.",
                "",
                "## Walkthrough",
                "",
                "### ApprovalPolicy.check",
                "",
                "Why static?",
                "",
            ].join("\n"),
        );
    });

    it("identifies a commit session and marks notes from an earlier head", () => {
        const text = notesMarkdown(
            session({
                source: commitSource(1, "feat/order-approval"),
                title: "Fix typo in approval email subject",
            }),
            [note("old", 1, { headSha: BASE, body: "Still true?" })],
            { now: NOW },
        );
        expect(text).toContain("# Notes: Fix typo in approval email subject");
        expect(text).toContain("- Commit `3f2a91c` on `feat/order-approval`");
        expect(text).toContain(
            "Still true?\n\n_Written at `a40f7d2`, an earlier version._",
        );
        expect(text).not.toContain("## Files");
        expect(text.endsWith("\n")).toBe(true);
    });

    it("says so when there is nothing to export", () => {
        expect(notesMarkdown(session(), [], { now: NOW })).toBe(
            [
                "# Notes: Require second approval for orders over €10k",
                "",
                "- Pull request #482",
                "- Head `3f2a91c`",
                "- Exported 2026-10-09",
                "",
                "No notes yet.",
                "",
            ].join("\n"),
        );
    });
});

describe("notesFileName", () => {
    it("is a safe .md name for each kind of session", () => {
        expect(notesFileName(session())).toBe("grsp-notes-482.md");
        expect(notesFileName(session({ source: commitSource(3) }))).toBe(
            "grsp-notes-3f2a91c.md",
        );
        expect(
            notesFileName(
                session({
                    source: {
                        kind: "branches",
                        base: "main",
                        head: "feat/order approval",
                    },
                }),
            ),
        ).toBe("grsp-notes-feat-order-approval.md");
    });
});
