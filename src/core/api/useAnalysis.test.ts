import { describe, expect, it } from "vitest";
import type { Analysis } from "@core/types/grsp";
import { applyAnalysisEvent, indexAnalyses } from "./useAnalysis";
import { applyAskEvent } from "./useAsk";
import { patchFinding } from "./useReview";
import { reviewResult } from "@core/fixtures/scenario";

const row = (
    kind: Analysis["kind"],
    extra: Partial<Analysis> = {},
): Analysis => ({
    sessionId: "s",
    kind,
    headSha: "abc",
    status: "done",
    ...extra,
});

describe("indexAnalyses", () => {
    it("maps analyses by kind and walkthroughs by entry point", () => {
        const map = indexAnalyses([
            row("discovery"),
            row("review", { status: "running" }),
            row("walkthrough:ep_bulk"),
        ]);
        expect(map.discovery?.status).toBe("done");
        expect(map.review?.status).toBe("running");
        expect(map.questions).toBeUndefined();
        expect(Object.keys(map.walkthroughs)).toEqual(["ep_bulk"]);
    });
});

describe("applyAnalysisEvent", () => {
    it("adds a row for an analysis that just started", () => {
        const patch = applyAnalysisEvent([], {
            sessionId: "s",
            kind: "review",
            status: "running",
            progress: "Reading the diff",
        });
        expect(patch.list).toHaveLength(1);
        expect(patch.list[0]).toMatchObject({
            status: "running",
            progress: "Reading the diff",
        });
        expect(patch.refetch).toBe(false);
    });

    it("updates the progress line without refetching", () => {
        const list = [row("review", { status: "running", progress: "a" })];
        const patch = applyAnalysisEvent(list, {
            sessionId: "s",
            kind: "review",
            status: "running",
            progress: "b",
        });
        expect(patch.list[0].progress).toBe("b");
        expect(patch.refetch).toBe(false);
    });

    it("refetches when a run settles, keeping the row until then", () => {
        const list = [row("review", { status: "running", progress: "a" })];
        const patch = applyAnalysisEvent(list, {
            sessionId: "s",
            kind: "review",
            status: "done",
        });
        expect(patch.list[0].status).toBe("running");
        expect(patch.refetch).toBe(true);
    });

    it("flips a failed section back to running on retry", () => {
        const list = [row("questions", { status: "error", error: "bad" })];
        const patch = applyAnalysisEvent(list, {
            sessionId: "s",
            kind: "questions",
            status: "running",
            progress: "Starting the agent",
        });
        expect(patch.list[0]).toMatchObject({
            status: "running",
            error: undefined,
        });
    });
});

describe("applyAskEvent", () => {
    const message = {
        id: "a1",
        sessionId: "s",
        question: "q",
        status: "running" as const,
        headSha: "abc",
        createdAt: "",
    };

    it("patches progress and asks for a refetch when the answer lands", () => {
        const event = { sessionId: "s", messageId: "a1" };
        const patched = applyAskEvent([message], {
            ...event,
            status: "running",
            progress: "Reading a.py",
        });
        expect(patched?.[0].progress).toBe("Reading a.py");
        expect(
            applyAskEvent([message], { ...event, status: "done" }),
        ).toBeUndefined();
        expect(
            applyAskEvent([], { ...event, status: "running" }),
        ).toBeUndefined();
    });
});

describe("patchFinding", () => {
    it("edits one finding of the review analysis", () => {
        const list = [
            row("discovery"),
            row("review", { result: reviewResult() }),
        ];
        const next = patchFinding(list, "f2", { included: false });
        const review = indexAnalyses(next).review?.result;
        expect(review?.findings.map((f) => f.included)).toEqual([
            true,
            false,
            true,
        ]);
        expect(review?.findings[1].comment).toMatch(/stuck/);
        expect(next[0]).toBe(list[0]);
    });
});
