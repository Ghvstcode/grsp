import type { Finding, ReviewEvent, Severity } from "@core/types/grsp";

export const VERDICTS: { event: ReviewEvent; label: string }[] = [
    { event: "COMMENT", label: "Comment" },
    { event: "APPROVE", label: "Approve" },
    { event: "REQUEST_CHANGES", label: "Request changes" },
];

/** Past-tense verdict, for the header pill and the posted bar. */
export function verdictLabel(event: ReviewEvent): string {
    if (event === "APPROVE") return "Approved";
    if (event === "REQUEST_CHANGES") return "Changes requested";
    return "Commented";
}

export function severityLabel(severity: Severity): string {
    if (severity === "blocking") return "Blocking";
    if (severity === "should_fix") return "Should fix";
    return "Nit";
}

/** Request changes if any included finding is blocking, else Comment. */
export function defaultVerdict(findings: Finding[]): ReviewEvent {
    return findings.some((f) => f.included && f.severity === "blocking")
        ? "REQUEST_CHANGES"
        : "COMMENT";
}

/** GitHub rejects Approve / Request changes on your own PR (SPEC §5.6). */
export function isVerdictAllowed(event: ReviewEvent, isOwnPr: boolean) {
    return !isOwnPr || event === "COMMENT";
}

/** The verdict that will be posted: the user's pick if allowed, else the default. */
export function effectiveVerdict(
    chosen: ReviewEvent | undefined,
    findings: Finding[],
    isOwnPr: boolean,
): ReviewEvent {
    const verdict = chosen ?? defaultVerdict(findings);
    return isVerdictAllowed(verdict, isOwnPr) ? verdict : "COMMENT";
}

export interface FindingCounts {
    total: number;
    blocking: number;
    included: number;
    /** Included findings that post as inline comments. */
    inline: number;
    /** Included findings that go into the review body. */
    inSummary: number;
}

export function countFindings(findings: Finding[]): FindingCounts {
    const included = findings.filter((f) => f.included);
    const inline = included.filter((f) => f.anchoring === "inline").length;
    return {
        total: findings.length,
        blocking: findings.filter((f) => f.severity === "blocking").length,
        included: included.length,
        inline,
        inSummary: included.length - inline,
    };
}
