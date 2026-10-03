import { describe, expect, it } from "vitest";
import {
    answerFor,
    discussionResult,
    DISCOVERY_VERIFICATION,
    HEAD_SHA,
    seedSessions,
} from "@core/fixtures/scenario";
import { excerpt } from "@core/fixtures/excerpts";
import type { Analysis, AskMessage } from "@core/types/grsp";
import {
    ciLabel,
    discussionCounts,
    discussionOneLiner,
    excerptStat,
    honestyLine,
    isFromEarlierVersion,
    refLabel,
    repoSlugOf,
    sectionState,
    traceLine,
} from "./status";

const base: Analysis = {
    sessionId: "s",
    kind: "discovery",
    headSha: HEAD_SHA,
    status: "pending",
};

describe("sectionState", () => {
    it("maps analysis status to what a section renders", () => {
        expect(sectionState(undefined)).toBe("waiting");
        expect(sectionState(base)).toBe("waiting");
        expect(sectionState({ ...base, status: "running" })).toBe("running");
        expect(sectionState({ ...base, status: "error" })).toBe("error");
        expect(sectionState({ ...base, status: "done", result: {} })).toBe(
            "done",
        );
        // "done" without a result yet (event before refetch) still waits.
        expect(sectionState({ ...base, status: "done" })).toBe("waiting");
    });
});

describe("honestyLine", () => {
    it("matches the SPEC §3.5 example", () => {
        expect(honestyLine(DISCOVERY_VERIFICATION)).toBe(
            "Agent explored 23 files · 41 references verified · 2 unverified",
        );
    });

    it("mentions sharding and omits zero unverified", () => {
        expect(
            honestyLine(
                { verified: 1, dropped: 0, unverified: 0, notes: [] },
                4,
            ),
        ).toBe("1 reference verified · Large PR: analysed in 4 parts");
    });
});

describe("ciLabel", () => {
    it("describes each CI state", () => {
        expect(ciLabel({ state: "passing", passed: 12, total: 12 })).toBe(
            "12/12 checks passing",
        );
        expect(ciLabel({ state: "failing", passed: 10, total: 12 })).toBe(
            "2/12 checks failing",
        );
        expect(ciLabel({ state: "pending", passed: 3, total: 12 })).toBe(
            "3/12 checks running",
        );
        expect(ciLabel({ state: "none", passed: 0, total: 0 })).toBeUndefined();
        expect(ciLabel(undefined)).toBeUndefined();
    });
});

describe("code labels", () => {
    it("formats refs and excerpt stats", () => {
        expect(refLabel({ file: "a.py", startLine: 3, verified: true })).toBe(
            "a.py:3",
        );
        expect(
            refLabel({
                file: "a.py",
                startLine: 3,
                endLine: 9,
                verified: true,
            }),
        ).toBe("a.py:3–9");
        expect(
            excerptStat(
                excerpt("t.py", 18, [
                    ["ctx", "a"],
                    ["del", "b"],
                    ["add", "c"],
                    ["add", "d"],
                ]),
            ),
        ).toBe("+2 −1");
        expect(
            excerptStat(
                excerpt("t.py", 30, [
                    ["ctx", "a"],
                    ["ctx", "b"],
                ]),
            ),
        ).toBe("lines 30–31");
    });
});

describe("ask trace line", () => {
    const message = (question: string): AskMessage => {
        const canned = answerFor(question);
        return {
            id: "a",
            sessionId: "s",
            question,
            status: "done",
            answer: canned.answer,
            verification: canned.verification,
            headSha: HEAD_SHA,
            createdAt: "",
        };
    };

    it("reports files explored and references verified", () => {
        expect(traceLine(message("Can bulk imports skip approval?"))).toBe(
            "Explored 2 files · 2 references verified",
        );
    });

    it("says so when nothing in the repo matches", () => {
        expect(traceLine(message("What is the airspeed of a swallow?"))).toBe(
            "No direct match",
        );
    });
});

describe("discussion", () => {
    it("counts threads, comments and people", () => {
        const result = discussionResult();
        expect(discussionCounts(result)).toEqual({
            open: 2,
            resolved: 2,
            comments: 8,
            people: 3,
        });
        expect(discussionOneLiner(result)).toMatch(
            /^2 open threads\. 2 resolved\. The author agreed/,
        );
    });
});

describe("session helpers", () => {
    const [primary] = seedSessions();

    it("reads the repo slug from the PR URL", () => {
        expect(repoSlugOf(primary)).toBe("acme/orders-api");
        expect(
            repoSlugOf({
                ...primary,
                source: { kind: "branches", base: "main", head: "x" },
            }),
        ).toBeUndefined();
    });

    it("flags answers from a different head", () => {
        expect(isFromEarlierVersion(HEAD_SHA, primary)).toBe(false);
        expect(isFromEarlierVersion("abc", primary)).toBe(true);
        expect(isFromEarlierVersion("", primary)).toBe(false);
    });
});
