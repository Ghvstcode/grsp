import { useEffect, useRef, useState } from "react";
import type {
    Analysis,
    CodeRef,
    GrspSettings,
    ReviewSession,
    WalkthroughResult,
} from "@core/types/grsp";
import {
    useCancelAnalysis,
    useExcerpt,
    useRunAnalysis,
    walkthroughKind,
    type SessionAnalyses,
} from "@core/api/useAnalysis";
import { Button } from "@ui/components/ui/button";
import { cn } from "@ui/lib/utils";
import {
    AnalysisSection,
    SectionError,
    SkeletonLine,
} from "../shared/AnalysisSection";
import { ChangeChip } from "../shared/ChangeChip";
import { CodeBlock } from "../shared/CodeBlock";
import { InlineText } from "../shared/InlineText";
import { ProgressLine } from "../shared/ProgressLine";
import { SectionLabel } from "../shared/SectionLabel";
import { kindLabel, refLabel, sectionState } from "../lib/status";
import {
    clampStep,
    defaultOptionIndex,
    mostRelevantStep,
    noteFor,
    routeSteps,
    selectedOption,
    takenBranch,
    type WalkStep,
} from "../lib/walk";
import type { WalkController } from "./useWalkState";

const pill = "h-9 rounded-full border px-3.5 text-[13px]";
const pillOn = "border-foreground bg-foreground text-background";
const pillOff = "bg-background hover:border-foreground";
const outlineButton =
    "h-10 rounded-lg bg-background px-3.5 text-[13px] font-normal shadow-none";

function isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
    );
}

function chainTone(step: WalkStep, current: boolean): string {
    if (current) {
        return "border-[1.5px] border-foreground bg-foreground text-background";
    }
    switch (step.block.status) {
        case "unchanged":
            return "border bg-background text-muted-foreground";
        case "not_covered":
            return "grsp-bg-panel border-[1.5px] border-dashed border-foreground";
        default:
            return "border-[1.5px] border-foreground bg-background";
    }
}

/** Left column: the path as a vertical chain; click a block to jump. */
function BlockChain({
    steps,
    current,
    onPick,
}: {
    steps: WalkStep[];
    current: number;
    onPick: (index: number) => void;
}) {
    return (
        <ol className="m-0 flex w-[360px] shrink-0 list-none flex-col p-0">
            {steps.map((step, index) => {
                const isCurrent = index === current;
                return (
                    <li key={step.block.id} className="flex flex-col">
                        <button
                            type="button"
                            onClick={() => onPick(index)}
                            aria-current={isCurrent ? "step" : undefined}
                            className={cn(
                                "flex min-h-14 w-full items-center justify-between gap-3 rounded-[9px] px-3.5 py-2.5 text-left",
                                chainTone(step, isCurrent),
                            )}
                        >
                            <span className="flex min-w-0 flex-col gap-0.5">
                                <span
                                    className={cn(
                                        "text-[11px]",
                                        isCurrent
                                            ? "text-background/80"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {step.number} · {kindLabel(step.block.kind)}
                                </span>
                                <span className="truncate font-mono text-[13px]">
                                    {step.block.label}
                                </span>
                            </span>
                            <ChangeChip
                                state={step.block.status}
                                inverted={isCurrent}
                            />
                        </button>
                        {index < steps.length - 1 && (
                            <div
                                className={cn(
                                    "grsp-border-strong ml-[22px] h-4 w-0 border-l",
                                    step.unconfirmedNext && "border-dotted",
                                )}
                                title={
                                    step.unconfirmedNext
                                        ? "This step couldn't be confirmed from the code."
                                        : undefined
                                }
                            />
                        )}
                    </li>
                );
            })}
        </ol>
    );
}

/** Code for a block, with "Show all" when the range was capped. */
function BlockCode({ sessionId, step }: { sessionId: string; step: WalkStep }) {
    const { excerpt } = step.block;
    const [showAll, setShowAll] = useState(false);
    const full = useExcerpt(
        sessionId,
        showAll
            ? {
                  file: excerpt.file,
                  startLine: excerpt.startLine,
                  endLine: excerpt.startLine + excerpt.totalLines - 1,
              }
            : undefined,
    );
    if (excerpt.lines.length === 0) {
        return (
            <div className="grsp-border-strong rounded-lg border border-dashed px-3.5 py-3 text-[13px] text-muted-foreground">
                No code changes in this block.
            </div>
        );
    }
    return (
        <CodeBlock
            size="md"
            excerpt={full.data ?? excerpt}
            onShowAll={full.data ? undefined : () => setShowAll(true)}
            showAllPending={showAll && full.isLoading}
        />
    );
}

interface BlockDetailProps {
    sessionId: string;
    result: WalkthroughResult;
    steps: WalkStep[];
    current: number;
    /** Length of the full path, including any hidden unchanged blocks. */
    total: number;
    optionIndex: number;
    showCode: boolean;
    onStep: (index: number) => void;
    onToggleCode: () => void;
}

/** Right column: what happens at the current block. */
function BlockDetail({
    sessionId,
    result,
    steps,
    current,
    total,
    optionIndex,
    showCode,
    onStep,
    onToggleCode,
}: BlockDetailProps) {
    const step = steps[current];
    const { block } = step;
    const option = selectedOption(result, optionIndex);
    const taken = takenBranch(block, option);
    const branch = (on: boolean) =>
        cn(
            "rounded-md border px-3 py-1.5 font-mono text-xs",
            on
                ? "border-foreground bg-foreground text-background"
                : "text-muted-foreground",
        );

    return (
        <div className="flex min-w-0 grow flex-col gap-[18px] rounded-xl border px-[26px] py-6">
            <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">
                    Step {step.number} of {total} · {kindLabel(block.kind)}
                </span>
                <ChangeChip state={block.status} />
            </div>
            <div className="flex flex-col gap-1">
                <h2 className="m-0 break-words font-mono text-xl font-medium tracking-[-0.01em]">
                    {block.label}
                </h2>
                <span className="font-mono text-xs text-muted-foreground">
                    {refLabel(block.ref)}
                </span>
            </div>
            <p className="grsp-text-1 m-0 max-w-[680px] text-[15px]">
                <InlineText text={noteFor(block, option)} />
            </p>

            {block.decision && (
                <div className="flex flex-col gap-2.5">
                    <SectionLabel>Decision</SectionLabel>
                    <div className="flex items-center gap-3.5">
                        <span className="rounded-lg border border-foreground px-3.5 py-2.5 font-mono text-[13px]">
                            {block.decision.condition}
                        </span>
                        <div className="flex flex-col items-start gap-2">
                            <span className={branch(taken === "yes")}>
                                yes → {block.decision.yes}
                            </span>
                            <span className={branch(taken === "no")}>
                                no → {block.decision.no}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {showCode && (
                <BlockCode key={block.id} sessionId={sessionId} step={step} />
            )}

            <div className="grsp-border-soft flex items-center gap-2 border-t pt-1.5">
                <Button
                    variant="outline"
                    className={outlineButton}
                    disabled={current === 0}
                    onClick={() => onStep(current - 1)}
                >
                    ← Back
                </Button>
                <Button
                    className="h-10 rounded-lg bg-foreground px-[18px] text-[13px] text-background shadow-none hover:bg-foreground/90"
                    disabled={current === steps.length - 1}
                    onClick={() => onStep(current + 1)}
                >
                    Step →
                </Button>
                <Button
                    variant="outline"
                    className={cn(outlineButton, "ml-auto")}
                    onClick={onToggleCode}
                >
                    {showCode ? "Hide code" : "Show code"}
                </Button>
            </div>
        </div>
    );
}

function WalkSkeleton() {
    return (
        <div className="flex items-start gap-8">
            <div className="flex w-[360px] shrink-0 flex-col gap-4">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="grsp-skeleton h-14 rounded-[9px]" />
                ))}
            </div>
            <div className="flex grow flex-col gap-4 rounded-xl border px-[26px] py-6">
                <SkeletonLine className="w-32" />
                <SkeletonLine className="h-6 w-72" />
                <SkeletonLine className="w-full max-w-[560px]" />
                <SkeletonLine className="w-full max-w-[420px]" />
                <div className="grsp-skeleton h-40 rounded-lg" />
            </div>
        </div>
    );
}

interface PathViewProps {
    session: ReviewSession;
    result: WalkthroughResult;
    optionIndex: number;
    showUnchanged: boolean;
    /** Refs to land on, from "Walk through it". */
    jumpRefs: CodeRef[] | undefined;
    walk: WalkController;
}

function PathView({
    session,
    result,
    optionIndex,
    showUnchanged,
    jumpRefs,
    walk,
}: PathViewProps) {
    const { state, setStep, toggleCode } = walk;
    const steps = routeSteps(result, optionIndex, showUnchanged);
    const current = clampStep(state.step, steps.length);

    // "Walk through it" lands on the block the mismatch points at.
    useEffect(() => {
        if (jumpRefs) setStep(mostRelevantStep(steps, jumpRefs));
        // Runs once per jump, when this path first renders for it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jumpRefs]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (isTyping(event.target)) return;
            const back = event.key === "ArrowLeft" || event.key === "ArrowUp";
            const forward =
                event.key === "ArrowRight" || event.key === "ArrowDown";
            if (!back && !forward) return;
            event.preventDefault();
            setStep(clampStep(current + (forward ? 1 : -1), steps.length));
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [current, steps.length, setStep]);

    if (steps.length === 0) {
        return (
            <div className="grsp-border-strong rounded-[10px] border border-dashed px-[18px] py-3.5 text-[13px] text-muted-foreground">
                Every block on this path is unchanged. Turn on “Show unchanged
                blocks in walkthroughs” in Settings to step through it.
            </div>
        );
    }
    return (
        <div className="flex items-start gap-8">
            <BlockChain steps={steps} current={current} onPick={setStep} />
            <BlockDetail
                sessionId={session.id}
                result={result}
                steps={steps}
                current={current}
                total={routeSteps(result, optionIndex, true).length}
                optionIndex={optionIndex}
                showCode={state.showCode}
                onStep={setStep}
                onToggleCode={toggleCode}
            />
        </div>
    );
}

interface WalkthroughTabProps {
    session: ReviewSession;
    analyses: SessionAnalyses | undefined;
    settings: GrspSettings;
    walk: WalkController;
}

/** A debugger for behaviour: pick an entry point and step through its path. */
export function WalkthroughTab({
    session,
    analyses,
    settings,
    walk,
}: WalkthroughTabProps) {
    const run = useRunAnalysis(session.id);
    const cancel = useCancelAnalysis(session.id);
    const requested = useRef(new Set<string>());

    const discovery = analyses?.discovery;
    const entries =
        discovery?.status === "done"
            ? (discovery.result?.entryPoints ?? [])
            : [];
    const entry =
        entries.find((e) => e.id === walk.state.entryId) ?? entries.at(0);
    const analysis: Analysis<WalkthroughResult> | undefined = entry
        ? analyses?.walkthroughs[entry.id]
        : undefined;

    // Walkthroughs run lazily, the first time an entry point is opened, and
    // never again on their own (SPEC §2.2, §4.5).
    const entryId = entry?.id;
    const missing =
        analyses !== undefined && entryId !== undefined && !analysis;
    const runWalkthrough = run.mutate;
    useEffect(() => {
        if (!missing || entryId === undefined) return;
        const key = `${session.id}:${session.headSha ?? ""}:${entryId}`;
        if (requested.current.has(key)) return;
        requested.current.add(key);
        runWalkthrough(walkthroughKind(entryId));
    }, [missing, entryId, session.id, session.headSha, runWalkthrough]);

    const result = analysis?.status === "done" ? analysis.result : undefined;
    const optionIndex =
        result && entry
            ? (walk.state.options[entry.id] ?? defaultOptionIndex(result))
            : 0;
    const option = result ? selectedOption(result, optionIndex) : undefined;
    const jump = walk.state.jump;

    const discoveryState = sectionState(discovery);
    if (discoveryState !== "done") {
        return (
            <section className="min-w-0 grow overflow-auto">
                <div className="flex flex-col gap-[22px] px-9 pb-12 pt-6">
                    {discoveryState === "error" ? (
                        <SectionError
                            title="Walkthroughs need the entry points, and finding them failed."
                            message={discovery?.error}
                            details={discovery?.errorDetails}
                            onRetry={() => run.mutate("discovery")}
                        />
                    ) : (
                        <>
                            <ProgressLine
                                text={
                                    discovery?.progress ??
                                    "Finding the entry points this change affects"
                                }
                            />
                            <WalkSkeleton />
                        </>
                    )}
                </div>
            </section>
        );
    }

    return (
        <section className="min-w-0 grow overflow-auto">
            <div className="flex flex-col gap-[22px] px-9 pb-12 pt-6">
                {!entry ? (
                    <div className="grsp-border-strong rounded-[10px] border border-dashed px-[18px] py-3.5 text-[13px] text-muted-foreground">
                        There's nothing to walk through: the agent found no
                        entry points whose behaviour this change affects.
                    </div>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="mr-1 text-xs text-muted-foreground">
                                    Entry point
                                </span>
                                {entries.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        aria-pressed={item.id === entry.id}
                                        onClick={() => walk.openEntry(item.id)}
                                        className={cn(
                                            pill,
                                            "font-mono text-xs",
                                            item.id === entry.id
                                                ? pillOn
                                                : pillOff,
                                        )}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                            {result?.whatIf &&
                                result.whatIf.options.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="mr-1 text-xs text-muted-foreground">
                                            What if the {result.whatIf.variable}{" "}
                                            is
                                        </span>
                                        {result.whatIf.options.map(
                                            (item, index) => (
                                                <button
                                                    key={item.label}
                                                    type="button"
                                                    aria-pressed={
                                                        index === optionIndex
                                                    }
                                                    onClick={() =>
                                                        walk.setOption(
                                                            entry.id,
                                                            index,
                                                        )
                                                    }
                                                    className={cn(
                                                        pill,
                                                        index === optionIndex
                                                            ? pillOn
                                                            : pillOff,
                                                    )}
                                                >
                                                    {item.label}
                                                </button>
                                            ),
                                        )}
                                        <span className="ml-1 text-xs text-muted-foreground">
                                            Based on reading the code
                                            {option?.note
                                                ? ` · ${option.note}`
                                                : ""}
                                        </span>
                                    </div>
                                )}
                        </div>
                        <AnalysisSection
                            analysis={analysis}
                            what="this path"
                            waitingLabel="Starting the agent"
                            onRetry={() =>
                                run.mutate(walkthroughKind(entry.id))
                            }
                            onCancel={() =>
                                cancel.mutate(walkthroughKind(entry.id))
                            }
                            progressFirst
                            skeleton={<WalkSkeleton />}
                        >
                            {(walkthrough) => (
                                <PathView
                                    key={entry.id}
                                    session={session}
                                    result={walkthrough}
                                    optionIndex={optionIndex}
                                    showUnchanged={settings.showUnchangedBlocks}
                                    jumpRefs={
                                        jump?.entryId === entry.id
                                            ? jump.refs
                                            : undefined
                                    }
                                    walk={walk}
                                />
                            )}
                        </AnalysisSection>
                    </>
                )}
            </div>
        </section>
    );
}
