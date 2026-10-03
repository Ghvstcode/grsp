import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Analysis, DiscoveryResult } from "@core/types/grsp";
import { AnalysisSection, SkeletonLine } from "../shared/AnalysisSection";
import { InlineText } from "../shared/InlineText";
import { SectionLabel } from "../shared/SectionLabel";
import { externalLinkClick } from "../lib/openExternal";
import { honestyLine } from "../lib/status";
import { descriptionPreview, wordCountLabel } from "../lib/text";

const heading = "mb-1 mt-3.5 block text-[13px] font-semibold first:mt-0";

/** PR descriptions render quietly: small headings, no colour, mono code. */
const MARKDOWN: Components = {
    h1: ({ children }) => <span className={heading}>{children}</span>,
    h2: ({ children }) => <span className={heading}>{children}</span>,
    h3: ({ children }) => <span className={heading}>{children}</span>,
    h4: ({ children }) => <span className={heading}>{children}</span>,
    p: ({ children }) => <p className="m-0 [&+p]:mt-2">{children}</p>,
    ul: ({ children }) => (
        <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px]">
            {children}
        </ul>
    ),
    ol: ({ children }) => (
        <ol className="m-0 flex list-decimal flex-col gap-1 pl-[18px]">
            {children}
        </ol>
    ),
    code: ({ children }) => (
        <code className="font-mono text-[13px]">{children}</code>
    ),
    pre: ({ children }) => (
        <pre className="grsp-bg-wash my-2 overflow-x-auto rounded-lg px-3 py-2 font-mono text-[12.5px]">
            {children}
        </pre>
    ),
    a: ({ children, href }) => (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            onClick={externalLinkClick}
            className="underline underline-offset-[3px]"
        >
            {children}
        </a>
    ),
    img: () => null,
};

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
                        <div className="grsp-text-1 min-w-0 break-words">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={MARKDOWN}
                            >
                                {description}
                            </ReactMarkdown>
                        </div>
                    ) : (
                        <p className="grsp-text-1 m-0 line-clamp-4">
                            {descriptionPreview(description)}
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
