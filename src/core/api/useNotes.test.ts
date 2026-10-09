import { describe, expect, it } from "vitest";
import type { Note } from "@core/types/grsp";
import { applyOptimisticSave, applySavedNote, isPendingNote } from "./useNotes";

function note(id: string, minute: number, body = id): Note {
    const at = `2026-10-09T10:${String(minute).padStart(2, "0")}:00Z`;
    return {
        id,
        sessionId: "s1",
        body,
        headSha: "head",
        createdAt: at,
        updatedAt: at,
    };
}

const context = {
    sessionId: "s1",
    headSha: "head",
    now: "2026-10-09T11:00:00Z",
    key: "k1",
};

describe("applyOptimisticSave", () => {
    it("appends a placeholder for a new note", () => {
        const anchor = {
            kind: "line",
            file: "a.py",
            line: 3,
            side: "new",
        } as const;
        const next = applyOptimisticSave(
            [note("n1", 1)],
            { body: "New", anchor },
            context,
        );
        expect(next).toHaveLength(2);
        expect(next[1]).toEqual({
            id: "pending:k1",
            sessionId: "s1",
            body: "New",
            anchor,
            headSha: "head",
            createdAt: context.now,
            updatedAt: context.now,
        });
        expect(isPendingNote(next[1])).toBe(true);
        expect(isPendingNote(next[0])).toBe(false);
    });

    it("rewrites the body of an edited note in place", () => {
        const before = [note("n1", 1), note("n2", 2)];
        const next = applyOptimisticSave(
            before,
            { id: "n2", body: "Edited" },
            context,
        );
        expect(next.map((n) => [n.id, n.body])).toEqual([
            ["n1", "n1"],
            ["n2", "Edited"],
        ]);
        expect(next[1].updatedAt).toBe(context.now);
        expect(next[1].createdAt).toBe(before[1].createdAt);
        expect(before[1].body).toBe("n2");
    });
});

describe("applySavedNote", () => {
    it("swaps the placeholder for the stored note", () => {
        const pending = applyOptimisticSave(
            [note("n1", 1)],
            { body: "New" },
            context,
        );
        const next = applySavedNote(
            pending,
            note("n9", 30, "New"),
            "pending:k1",
        );
        expect(next.map((n) => n.id)).toEqual(["n1", "n9"]);
    });

    it("replaces an edited note without duplicating it", () => {
        const next = applySavedNote(
            [note("n1", 1), note("n2", 2)],
            note("n1", 1, "Edited"),
            undefined,
        );
        expect(next.map((n) => [n.id, n.body])).toEqual([
            ["n1", "Edited"],
            ["n2", "n2"],
        ]);
    });
});
