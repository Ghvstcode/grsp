import { useState } from "react";
import type { Analysis, DiscoveryResult } from "@core/types/grsp";
import { AnalysisSection, SkeletonLine } from "../shared/AnalysisSection";
import { InlineText } from "../shared/InlineText";
import { Markdown } from "../shared/Markdown";
import { SectionLabel } from "../shared/SectionLabel";
import { honestyLine } from "../lib/status";
import { commentPreview, wordCountLabel } from "../lib/text";

function AuthorSays({ description }: { description: string }) {
    const [open, setOpen] = useState(false);
    const empty = description.trim() === "";
    return (
        <div className="flex flex-col gap-3 rounded-[10px] border px-[22px] py-5">
            <div className="flex items-center justify-between">
                <SectionLabel>Author says</SectionLabel>
                {!empty && (
                    <span className="text-[11px] text-muted-foreground">
                        {wordCountLabel(description)}
                    </span>
                )}
            </div>
            {empty ? (
                <p className="m-0 text-muted-foreground">
                    No description to compare against.
                </p>
            ) : (
                <>
                    {open ? (
                        <Markdown>{description}</Markdown>
                    ) : (
                        <p className="grsp-text-1 m-0 line-clamp-4">
                            {commentPreview(description)}
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        aria-expanded={open}
                        className="h-8 self-start text-[13px] font-medium underline underline-offset-[3px]"
                    >
                        {open
                            ? "Collapse description"
                            : "Read full description"}
                    </button>
                </>
            )}
        </div>
    );
}

interface AuthorCodeCardsProps {
    description: string;
    discovery: Analysis<DiscoveryResult> | undefined;
    onRetry: () => void;
    onCancel: () => void;
}

/** "Author says" (the PR description) next to "Code does" (the agent's read). */
export function AuthorCodeCards({
    description,
    discovery,
    onRetry,
    onCancel,
}: AuthorCodeCardsProps) {
    return (
        <div className="grid grid-cols-2 items-start gap-[18px]">
            <AuthorSays description={description} />
            <div className="flex flex-col gap-3 rounded-[10px] border border-foreground px-[22px] py-5">
                <SectionLabel className="text-foreground">
                    Code does
                </SectionLabel>
                <AnalysisSection
                    analysis={discovery}
                    what="what the code does"
                    waitingLabel="Waiting to read the change"
                    onRetry={onRetry}
                    onCancel={onCancel}
                    className="border-0 p-0"
                    skeleton={
                        <div className="flex flex-col gap-2.5 py-1">
                            <SkeletonLine className="w-full" />
                            <SkeletonLine className="w-[94%]" />
                            <SkeletonLine className="w-[88%]" />
                            <SkeletonLine className="w-[56%]" />
                        </div>
                    }
                >
                    {(result, analysis) => (
                        <>
                            <p className="grsp-text-1 m-0">
                                <InlineText text={result.behaviourSummary} />
                            </p>
                            <p className="m-0 text-xs text-muted-foreground">
                                {honestyLine(
                                    analysis.verification,
                                    result.shards,
                                )}
                            </p>
                        </>
                    )}
                </AnalysisSection>
            </div>
        </div>
    );
}
