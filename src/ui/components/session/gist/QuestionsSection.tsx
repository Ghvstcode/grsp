import { useState } from "react";
import type { Analysis, QuestionsResult } from "@core/types/grsp";
import { cn } from "@ui/lib/utils";
import { AnalysisSection } from "../shared/AnalysisSection";
import { refLabel } from "../lib/status";

interface QuestionsSectionProps {
    questions: Analysis<QuestionsResult> | undefined;
    /** Persist "checked" the first time a question is opened. */
    onOpened: (questionId: string) => void;
    onRetry: () => void;
    onCancel: () => void;
}

/** "Can you answer these?": comprehension questions as an accordion. */
export function QuestionsSection({
    questions,
    onOpened,
    onRetry,
    onCancel,
}: QuestionsSectionProps) {
    const [openId, setOpenId] = useState<string>();
    const items =
        questions?.status === "done" ? questions.result?.questions : undefined;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
                <h2 className="m-0 text-[15px] font-semibold">
                    Can you answer these?
                </h2>
                {items && items.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                        {items.filter((q) => q.opened).length} of {items.length}{" "}
                        checked
                    </span>
                )}
            </div>
            <AnalysisSection
                analysis={questions}
                what="questions for this change"
                waitingLabel="Questions start once the change has been read"
                onRetry={onRetry}
                onCancel={onCancel}
                skeleton={
                    <div className="flex flex-col gap-2">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className="grsp-skeleton h-12 rounded-[10px]"
                            />
                        ))}
                    </div>
                }
            >
                {(result) =>
                    result.questions.length === 0 ? (
                        <p className="m-0 text-[13px] text-muted-foreground">
                            No questions for this change.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {result.questions.map((q) => {
                                const open = openId === q.id;
                                return (
                                    <div
                                        key={q.id}
                                        className={cn(
                                            "rounded-[10px] border",
                                            open && "border-foreground",
                                        )}
                                    >
                                        <button
                                            type="button"
                                            aria-expanded={open}
                                            onClick={() => {
                                                setOpenId(
                                                    open ? undefined : q.id,
                                                );
                                                if (!q.opened) onOpened(q.id);
                                            }}
                                            className="flex min-h-12 w-full items-center justify-between gap-4 px-[18px] py-3 text-left text-sm"
                                        >
                                            <span>{q.question}</span>
                                            <span className="shrink-0 font-mono text-muted-foreground">
                                                {open ? "−" : "+"}
                                            </span>
                                        </button>
                                        {open && (
                                            <div className="flex flex-col gap-2 px-[18px] pb-4">
                                                <p className="grsp-text-soft m-0">
                                                    {q.answer}
                                                </p>
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {q.refs
                                                        .map(refLabel)
                                                        .join(" · ")}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )
                }
            </AnalysisSection>
        </div>
    );
}
