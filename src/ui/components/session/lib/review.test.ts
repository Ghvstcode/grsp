import { describe, expect, it } from "vitest";
import { reviewResult } from "@core/fixtures/scenario";
import {
    countFindings,
    defaultVerdict,
    effectiveVerdict,
    isVerdictAllowed,
    verdictLabel,
} from "./review";

const findings = () => reviewResult().findings;

describe("defaultVerdict", () => {
    it("requests changes when an included finding is blocking", () => {
        expect(defaultVerdict(findings())).toBe("REQUEST_CHANGES");
    });

    it("falls back to Comment once the blocking finding is excluded", () => {
        const list = findings().map((f) =>
            f.severity === "blocking" ? { ...f, included: false } : f,
        );
        expect(defaultVerdict(list)).toBe("COMMENT");
    });

    it("is Comment with no findings", () => {
        expect(defaultVerdict([])).toBe("COMMENT");
    });
});

describe("effectiveVerdict", () => {
    it("keeps the user's choice when it's allowed", () => {
        expect(effectiveVerdict("APPROVE", findings(), false)).toBe("APPROVE");
    });

    it("only allows Comment on your own PR", () => {
        expect(isVerdictAllowed("APPROVE", true)).toBe(false);
        expect(isVerdictAllowed("REQUEST_CHANGES", true)).toBe(false);
        expect(isVerdictAllowed("COMMENT", true)).toBe(true);
        expect(effectiveVerdict(undefined, findings(), true)).toBe("COMMENT");
        expect(effectiveVerdict("APPROVE", findings(), true)).toBe("COMMENT");
    });
});

describe("countFindings", () => {
    it("counts included findings and where they post", () => {
        expect(countFindings(findings())).toEqual({
            total: 3,
            blocking: 1,
            included: 3,
            inline: 2,
            inSummary: 1,
        });
        const list = findings().map((f, i) =>
            i === 1 ? { ...f, included: false } : f,
        );
        expect(countFindings(list)).toMatchObject({ included: 2, inline: 1 });
    });
});

describe("verdictLabel", () => {
    it("is past tense", () => {
        expect(verdictLabel("COMMENT")).toBe("Commented");
        expect(verdictLabel("APPROVE")).toBe("Approved");
        expect(verdictLabel("REQUEST_CHANGES")).toBe("Changes requested");
    });
});
