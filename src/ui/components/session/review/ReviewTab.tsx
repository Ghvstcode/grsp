import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import type {
    Analysis,
    Finding,
    GrspSettings,
    ReviewEvent,
    ReviewResult,
    ReviewSession,
} from "@core/types/grsp";
import { useReview } from "@core/api/useReview";
import { errorMessage } from "@core/api/useSession";
import { Button } from "@ui/components/ui/button";
import { Textarea } from "@ui/components/ui/textarea";
import { cn } from "@ui/lib/utils";
import { SectionError, SkeletonLine } from "../shared/AnalysisSection";
import { CodeBlock } from "../shared/CodeBlock";
import { ProgressLine } from "../shared/ProgressLine";
import { SectionLabel } from "../shared/SectionLabel";
import { externalLinkClick } from "../lib/openExternal";
import {
    countFindings,
    effectiveVerdict,
    isVerdictAllowed,
    severityLabel,
    VERDICTS,
    verdictLabel,
} from "../lib/review";
import {
    isFromEarlierVersion,
    prOf,
    refLabel,
    repoSlugOf,
    sourceWording,
    sectionState,
} from "../lib/status";
import { plural } from "../lib/text";

type Review = ReturnType<typeof useReview>;

const primaryButton =
    "h-11 rounded-lg bg-foreground px-[22px] text-sm text-background shadow-none hover:bg-foreground/90";
const outlineButton =
    "h-9 rounded-lg bg-background px-3.5 text-[13px] font-normal shadow-none";
const textArea =
    "grsp-border-strong min-h-0 resize-y rounded-lg bg-background px-3 py-2.5 text-[13px] leading-normal shadow-none md:text-[13px]";
const linkButton = "text-xs font-medium underline underline-offset-[3px]";

const AGENT_NAMES = { claude: "Claude Code", codex: "Codex" } as const;

function IdleCard({
    session,
    settings,
    onRun,
}: {
    session: ReviewSession;
    settings: GrspSettings;
    onRun: () => void;
}) {
    const navigate = useNavigate();
    return (
        <div className="flex flex-col gap-[18px] rounded-xl border p-7">
            <div className="flex flex-col gap-1.5">
                <h2 className="m-0 text-lg font-semibold">Run an AI review</h2>
                <p className="grsp-text-2 m-0">
                    {sourceWording(session).reviewIntro}
                </p>
            </div>
            <div className="grsp-bg-wash flex flex-col gap-1.5 rounded-lg px-4 py-3.5">
                <div className="flex items-center justify-between">
                    <SectionLabel className="grsp-text-2">
                        Your review prompt
                    </SectionLabel>
                    <button
                        type="button"
                        onClick={() =>
                            navigate("/settings?section=review-prompt")
                        }
                        className={cn(linkButton, "h-7")}
                    >
                        Edit
                    </button>
                </div>
                <p className="grsp-text-1 m-0 line-clamp-2 text-[13px]">
                    {settings.reviewPrompt}
                </p>
            </div>
            <div className="flex items-center gap-3.5">
                <Button onClick={onRun} className={primaryButton}>
                    Run review
                </Button>
                <span className="text-xs text-muted-foreground">
                    Runs on your {AGENT_NAMES[settings.agent]} subscription
                </span>
            </div>
        </div>
    );
}

function RunningCard({
    analysis,
    onCancel,
}: {
    analysis: Analysis<ReviewResult> | undefined;
    onCancel: () => void;
}) {
    return (
        <div className="flex flex-col gap-[22px]" aria-busy>
            <div className="flex flex-col gap-2">
                <h2 className="m-0 text-lg font-semibold">
                    Reviewing the change
                </h2>
                <ProgressLine
                    text={analysis?.progress ?? "Starting the agent"}
                    onCancel={onCancel}
                />
            </div>
            {[0, 1].map((i) => (
                <div
                    key={i}
                    className="flex flex-col gap-3.5 rounded-xl border px-6 py-[22px]"
                >
                    <div className="flex items-center gap-3">
                        <SkeletonLine className="h-[22px] w-[68px]" />
                        <SkeletonLine className="w-72" />
                    </div>
                    <SkeletonLine className="w-full" />
                    <SkeletonLine className="w-3/4" />
                    <div className="grsp-skeleton h-28 rounded-lg" />
                </div>
            ))}
        </div>
    );
}

function severityTone(severity: Finding["severity"]): string {
    if (severity === "blocking") {
        return "border-foreground bg-foreground text-background";
    }
    if (severity === "should_fix") return "border-foreground";
    return "grsp-text-2";
}

function FindingCard({
    finding,
    readOnly,
    onChange,
}: {
    finding: Finding;
    readOnly: boolean;
    onChange: (patch: { comment?: string; included?: boolean }) => void;
}) {
    const [draft, setDraft] = useState(finding.comment);
    const inputId = `grsp-finding-${finding.id}`;
    const inSummary = finding.anchoring === "summary";
    return (
        <article
            className={cn(
                "flex flex-col gap-3.5 rounded-xl border px-6 py-[22px] transition-opacity",
                !finding.included && "opacity-50",
            )}
        >
            <div className="flex items-center gap-3">
                <span
                    className={cn(
                        "shrink-0 rounded-[4px] border px-[9px] py-[3px] text-[11px] font-medium leading-[16.5px]",
                        severityTone(finding.severity),
                    )}
                >
                    {severityLabel(finding.severity)}
                </span>
                <h3 className="m-0 grow text-[15px] font-semibold">
                    {finding.title}
                </h3>
                <span className="grsp-text-2 shrink-0 font-mono text-xs">
                    {refLabel(finding.ref)}
                </span>
            </div>
            <p className="grsp-text-soft m-0">{finding.why}</p>
            {finding.excerpt.lines.length > 0 && (
                <CodeBlock excerpt={finding.excerpt} />
            )}
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2.5">
                    <label htmlFor={inputId} className="grsp-text-2 text-xs">
                        {inSummary
                            ? `Comment about line ${finding.ref.startLine}`
                            : `Comment to post on line ${finding.ref.startLine}`}
                    </label>
                    {inSummary && (
                        <span
                            className="rounded-[4px] border border-dashed border-foreground px-1.5 py-px text-[11px]"
                            title="This line isn't part of the PR diff, so GitHub can't attach a comment to it. The comment goes in the review summary with the file and line written out."
                        >
                            Posts in summary
                        </span>
                    )}
                </div>
                <Textarea
                    id={inputId}
                    rows={3}
                    value={draft}
                    readOnly={readOnly}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => {
                        if (draft !== finding.comment) {
                            onChange({ comment: draft });
                        }
                    }}
                    className={textArea}
                />
            </div>
            <label className="flex min-h-8 cursor-pointer items-center gap-2.5 self-start text-[13px]">
                <input
                    type="checkbox"
                    checked={finding.included}
                    disabled={readOnly}
                    onChange={(event) =>
                        onChange({ included: event.target.checked })
                    }
                    className="h-4 w-4 accent-foreground"
                />
                Include in review
            </label>
        </article>
    );
}

function SubmitPanel({
    session,
    result,
    stale,
    review,
    onPosted,
}: {
    session: ReviewSession;
    result: ReviewResult;
    stale: boolean;
    review: Review;
    onPosted: () => void;
}) {
    const [chosen, setChosen] = useState<ReviewEvent>();
    const [summary, setSummary] = useState(result.summary);
    const counts = countFindings(result.findings);
    const verdict = effectiveVerdict(chosen, result.findings, session.isOwnPr);
    const { post, githubLogin } = review;
    const nothingToPost =
        verdict === "COMMENT" && counts.included === 0 && summary.trim() === "";

    return (
        <div className="flex flex-col gap-4 rounded-xl border-[1.5px] border-foreground px-6 py-[22px]">
            <h3 className="m-0 text-[15px] font-semibold">Submit to GitHub</h3>
            {stale && (
                <div
                    role="alert"
                    className="flex items-center gap-3 rounded-lg border border-dashed border-foreground px-3.5 py-2.5 text-[13px]"
                >
                    <span className="grow">
                        Findings were generated for an older commit.
                    </span>
                    <Button
                        variant="outline"
                        className={cn(outlineButton, "h-8")}
                        onClick={review.run}
                    >
                        Re-run
                    </Button>
                </div>
            )}
            <div className="flex flex-col gap-2">
                <div className="flex gap-2" role="group" aria-label="Verdict">
                    {VERDICTS.map(({ event, label }) => {
                        const allowed = isVerdictAllowed(
                            event,
                            session.isOwnPr,
                        );
                        return (
                            <button
                                key={event}
                                type="button"
                                aria-pressed={verdict === event}
                                disabled={!allowed}
                                onClick={() => setChosen(event)}
                                className={cn(
                                    "h-[38px] rounded-lg border px-3.5 text-[13px]",
                                    verdict === event
                                        ? "border-foreground bg-foreground text-background"
                                        : "bg-background",
                                    !allowed &&
                                        "cursor-not-allowed text-muted-foreground opacity-50",
                                )}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
                {session.isOwnPr && (
                    <p className="grsp-text-2 m-0 text-xs">
                        This is your own pull request. GitHub only lets you
                        comment on it, not approve or request changes.
                    </p>
                )}
            </div>
            <div className="flex flex-col gap-1.5">
                <label htmlFor="grsp-summary" className="grsp-text-2 text-xs">
                    Summary comment
                </label>
                <Textarea
                    id="grsp-summary"
                    rows={2}
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                    className={textArea}
                />
                {counts.inSummary > 0 && (
                    <p className="m-0 text-xs text-muted-foreground">
                        {counts.inSummary === 1
                            ? "1 comment is on a line outside this diff, so it's added to the summary with its file and line."
                            : `${counts.inSummary} comments are on lines outside this diff, so they're added to the summary with their file and line.`}
                    </p>
                )}
            </div>
            <div className="flex items-center gap-3.5">
                <Button
                    className={primaryButton}
                    disabled={post.isPending || !githubLogin || nothingToPost}
                    onClick={() =>
                        post.mutate(
                            { event: verdict, body: summary },
                            { onSuccess: onPosted },
                        )
                    }
                >
                    {post.isPending
                        ? "Posting to GitHub"
                        : `Post review · ${plural(counts.included, "comment")}`}
                </Button>
                <span className="text-xs text-muted-foreground">
                    {githubLogin
                        ? `Posts as @${githubLogin} via your GitHub connection`
                        : "Connect GitHub in Settings to post this review"}
                </span>
            </div>
            {post.isError && (
                <p className="m-0 text-[13px]" role="alert">
                    The review wasn't posted. {errorMessage(post.error)}
                </p>
            )}
        </div>
    );
}

function PostedBar({
    session,
    inlineCount,
}: {
    session: ReviewSession;
    /** Unknown when the findings aren't loaded. */
    inlineCount?: number;
}) {
    const posted = session.postedReview;
    const pr = prOf(session);
    if (!posted || !pr) return null;
    const where = [repoSlugOf(session), `#${pr.number}`]
        .filter(Boolean)
        .join(" ");
    return (
        <div className="flex items-center gap-4 rounded-xl bg-foreground px-6 py-5 text-background">
            <Check size={20} strokeWidth={2} className="shrink-0" />
            <span className="grow">
                Review posted to {where} · {verdictLabel(posted.event)}
                {inlineCount !== undefined &&
                    ` · ${plural(inlineCount, "inline comment")}`}
            </span>
            <a
                href={posted.url}
                target="_blank"
                rel="noreferrer"
                onClick={externalLinkClick}
                className="shrink-0 text-[13px] font-medium underline underline-offset-[3px]"
            >
                View on GitHub
            </a>
        </div>
    );
}

interface ReviewTabProps {
    session: ReviewSession;
    settings: GrspSettings;
}

/** Run an AI review, edit its findings, pick a verdict and post it. */
export function ReviewTab({ session, settings }: ReviewTabProps) {
    const review = useReview(session.id);
    // After a posted review, Re-run opens a new draft that can be posted.
    const [redrafting, setRedrafting] = useState(false);
    const { analysis } = review;
    const state = sectionState(analysis);
    const isPr = session.source.kind === "pr";
    const posted = session.postedReview !== undefined && !redrafting;

    const rerun = () => {
        if (session.postedReview) setRedrafting(true);
        review.run();
    };

    let body;
    if (state === "running") {
        body = <RunningCard analysis={analysis} onCancel={review.cancel} />;
    } else if (state === "done" && analysis?.result) {
        const result = analysis.result;
        const counts = countFindings(result.findings);
        const stale =
            session.status === "stale" ||
            isFromEarlierVersion(analysis.headSha, session);
        body = (
            <div className="flex flex-col gap-[22px]">
                <div className="flex items-center gap-3.5">
                    <h2 className="m-0 grow text-lg font-semibold">
                        {counts.total === 0
                            ? "No findings"
                            : plural(counts.total, "finding")}
                        {counts.blocking > 0 && (
                            <span className="font-normal text-muted-foreground">
                                {" "}
                                · {counts.blocking} blocking
                            </span>
                        )}
                    </h2>
                    {result.repoPromptActive && (
                        <span
                            className="rounded-[4px] border px-2 py-[2px] text-[11px] text-muted-foreground"
                            title="This repository's .grsp/prompt.md was added to your review prompt."
                        >
                            Repo prompt active
                        </span>
                    )}
                    <Button
                        variant="outline"
                        className={outlineButton}
                        onClick={rerun}
                    >
                        Re-run
                    </Button>
                </div>
                {counts.total === 0 && (
                    <p className="grsp-text-2 m-0">
                        The review found nothing to flag with your prompt.
                        {isPr && " You can still post a verdict and a summary."}
                    </p>
                )}
                {result.findings.map((finding) => (
                    <FindingCard
                        key={`${finding.id}:${analysis.finishedAt ?? ""}`}
                        finding={finding}
                        readOnly={posted}
                        onChange={(patch) =>
                            review.updateFinding.mutate({
                                findingId: finding.id,
                                ...patch,
                            })
                        }
                    />
                ))}
                {!isPr ? (
                    <div className="grsp-border-strong rounded-xl border border-dashed px-6 py-[18px] text-[13px] text-muted-foreground">
                        {sourceWording(session).noPosting}
                    </div>
                ) : posted ? (
                    <PostedBar session={session} inlineCount={counts.inline} />
                ) : (
                    <SubmitPanel
                        key={analysis.finishedAt ?? "draft"}
                        session={session}
                        result={result}
                        stale={stale}
                        review={review}
                        onPosted={() => setRedrafting(false)}
                    />
                )}
            </div>
        );
    } else {
        const cancelled = analysis?.error === "Cancelled.";
        body = (
            <>
                {state === "error" && !cancelled && (
                    <SectionError
                        title="The review didn't finish."
                        message={analysis?.error}
                        details={analysis?.errorDetails}
                    />
                )}
                <IdleCard session={session} settings={settings} onRun={rerun} />
                {posted && <PostedBar session={session} />}
            </>
        );
    }

    return (
        <section className="min-w-0 grow overflow-auto">
            <div className="flex max-w-[980px] flex-col gap-[22px] px-9 pb-12 pt-7">
                {body}
            </div>
        </section>
    );
}
