import { describe, expect, it } from "vitest";
import type { DiffFilePatch, Note, NoteAnchor } from "@core/types/grsp";
import {
    excludedNote,
    filterFiles,
    lineThreads,
    neighbourFile,
    noteCountsByFile,
    notesForFile,
    splitPath,
    unshowableReason,
} from "./code";

function file(path: string, extra: Partial<DiffFilePatch> = {}): DiffFilePatch {
    return {
        path,
        status: "modified",
        added: 1,
        removed: 1,
        binary: false,
        patch: `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,1 @@\n-a\n+b\n`,
        truncated: false,
        ...extra,
    };
}

function note(id: string, anchor?: NoteAnchor): Note {
    return {
        id,
        sessionId: "s",
        body: id,
        anchor,
        headSha: "h",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
    };
}

const line = (
    f: string,
    n: number,
    side: "old" | "new" = "new",
): NoteAnchor => ({ kind: "line", file: f, line: n, side });

const FILES = [
    file("approvals/notify.py"),
    file("orders/services.py"),
    file("tests/orders/test_create.py", {
        oldPath: "tests/test_orders.py",
        status: "renamed",
    }),
];

describe("splitPath", () => {
    it("separates the folder from the file name", () => {
        expect(splitPath("orders/api/views.py")).toEqual({
            dir: "orders/api",
            name: "views.py",
        });
        expect(splitPath("README.md")).toEqual({ dir: "", name: "README.md" });
    });
});

describe("filterFiles", () => {
    it("keeps everything for an empty query", () => {
        expect(filterFiles(FILES, "  ")).toBe(FILES);
    });

    it("matches every word, case-insensitively, old paths included", () => {
        expect(filterFiles(FILES, "ORDERS").map((f) => f.path)).toEqual([
            "orders/services.py",
            "tests/orders/test_create.py",
        ]);
        expect(filterFiles(FILES, "orders serv").map((f) => f.path)).toEqual([
            "orders/services.py",
        ]);
        expect(filterFiles(FILES, "test_orders").map((f) => f.path)).toEqual([
            "tests/orders/test_create.py",
        ]);
        expect(filterFiles(FILES, "nope")).toEqual([]);
    });
});

describe("neighbourFile", () => {
    it("steps through the list and stops at the ends", () => {
        expect(neighbourFile(FILES, "orders/services.py", 1)?.path).toBe(
            "tests/orders/test_create.py",
        );
        expect(neighbourFile(FILES, "orders/services.py", -1)?.path).toBe(
            "approvals/notify.py",
        );
        expect(neighbourFile(FILES, "approvals/notify.py", -1)?.path).toBe(
            "approvals/notify.py",
        );
        expect(
            neighbourFile(FILES, "tests/orders/test_create.py", 1)?.path,
        ).toBe("tests/orders/test_create.py");
    });

    it("starts at the top when the current file is filtered out", () => {
        expect(neighbourFile(FILES, "gone.py", 1)?.path).toBe(
            "approvals/notify.py",
        );
        expect(neighbourFile([], "gone.py", 1)).toBeUndefined();
    });
});

describe("line notes", () => {
    const notes = [
        note("general"),
        note("b", line("a.py", 9)),
        note("a", line("a.py", 3)),
        note("a2", line("a.py", 3)),
        note("old", line("a.py", 3, "old")),
        note("elsewhere", line("b.py", 1)),
        note("block", {
            kind: "block",
            entryPointId: "e",
            blockId: "x",
            label: "X",
        }),
    ];

    it("picks out one file's line notes and counts them per file", () => {
        expect(notesForFile(notes, "a.py").map((n) => n.id)).toEqual([
            "b",
            "a",
            "a2",
            "old",
        ]);
        expect([...noteCountsByFile(notes)]).toEqual([
            ["a.py", 4],
            ["b.py", 1],
        ]);
    });

    it("groups notes on the same line and side into one thread", () => {
        const threads = lineThreads(notesForFile(notes, "a.py"), undefined);
        expect(
            threads.map((t) => [
                t.line,
                t.side,
                t.notes.map((n) => n.id),
                t.composing,
            ]),
        ).toEqual([
            [3, "old", ["old"], false],
            [3, "new", ["a", "a2"], false],
            [9, "new", ["b"], false],
        ]);
    });

    it("adds the line being written on, joining a thread that exists", () => {
        const own = lineThreads([], { line: 12, side: "new" });
        expect(own).toEqual([
            { line: 12, side: "new", notes: [], composing: true },
        ]);
        const joined = lineThreads(notesForFile(notes, "a.py"), {
            line: 9,
            side: "new",
        });
        expect(joined).toHaveLength(3);
        expect(joined[2]).toMatchObject({ line: 9, composing: true });
        expect(joined[2].notes).toHaveLength(1);
    });
});

describe("unshowableReason", () => {
    it("is undefined for a file with a diff to draw", () => {
        expect(unshowableReason(file("a.py"))).toBeUndefined();
    });

    it("explains binary, truncated and content-free changes", () => {
        expect(
            unshowableReason(file("a.png", { binary: true, patch: "" })),
        ).toMatch(/Binary file/);
        expect(unshowableReason(file("big.json", { truncated: true }))).toMatch(
            /too large/,
        );
        expect(
            unshowableReason(
                file("new.py", {
                    status: "renamed",
                    oldPath: "old.py",
                    patch: "diff --git a/old.py b/new.py\nsimilarity index 100%\nrename from old.py\nrename to new.py\n",
                }),
            ),
        ).toBe("Renamed from old.py with no changes to its contents.");
        expect(
            unshowableReason(
                file("run.sh", {
                    patch: "diff --git a/run.sh b/run.sh\nold mode 100644\nnew mode 100755\n",
                }),
            ),
        ).toMatch(/mode or path/);
    });
});

describe("excludedNote", () => {
    it("counts the files left out, or says nothing", () => {
        expect(excludedNote(0)).toBe("");
        expect(excludedNote(1)).toBe(
            "1 file left out (vendored, generated, lockfiles)",
        );
        expect(excludedNote(3)).toBe(
            "3 files left out (vendored, generated, lockfiles)",
        );
    });
});
