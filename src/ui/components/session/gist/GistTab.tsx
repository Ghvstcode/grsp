import type { CodeRef, GrspSettings, ReviewSession } from "@core/types/grsp";
import {
    useCancelAnalysis,
    useRunAnalysis,
    useSetQuestionOpened,
    type SessionAnalyses,
} from "@core/api/useAnalysis";
import { AffectedList } from "./AffectedList";
import { AskPanel } from "./AskPanel";
import { AuthorCodeCards } from "./AuthorCodeCards";
import { DiscussionSection } from "./DiscussionSection";
import { MismatchCallout } from "./MismatchCallout";
import { QuestionsSection } from "./QuestionsSection";

interface GistTabProps {
    session: ReviewSession;
    analyses: SessionAnalyses | undefined;
    settings: GrspSettings;
    /** Open the walkthrough for an entry point, at the block `refs` point to. */
    onWalk: (entryPointId: string, refs?: CodeRef[]) => void;
}

/** The scrolling Gist column with the fixed Ask panel on its right. */
export function GistTab({ session, analyses, settings, onWalk }: GistTabProps) {
    const run = useRunAnalysis(session.id);
    const cancel = useCancelAnalysis(session.id);
    const setOpened = useSetQuestionOpened(session.id);
    const discovery = analyses?.discovery;
    const result = discovery?.status === "done" ? discovery.result : undefined;

    return (
        <div className="flex min-h-0 min-w-0 grow">
            <section className="min-w-0 grow overflow-auto">
                <div className="flex flex-col gap-8 px-9 pb-12 pt-7">
                    <AuthorCodeCards
                        description={session.description}
                        discovery={discovery}
                        onRetry={() => run.mutate("discovery")}
                        onCancel={() => cancel.mutate("discovery")}
                    />
                    {result?.mismatches.map((mismatch) => {
                        const entryPointId = mismatch.entryPointId;
                        return (
                            <MismatchCallout
                                key={mismatch.id}
                                mismatch={mismatch}
                                onWalk={
                                    entryPointId
                                        ? () =>
                                              onWalk(
                                                  entryPointId,
                                                  mismatch.refs,
                                              )
                                        : undefined
                                }
                            />
                        );
                    })}
                    <AffectedList
                        discovery={discovery}
                        onWalk={(entryPointId) => onWalk(entryPointId)}
                    />
                    {settings.comprehensionQuestions && (
                        <QuestionsSection
                            questions={analyses?.questions}
                            onOpened={(questionId) =>
                                setOpened.mutate(questionId)
                            }
                            onRetry={() => run.mutate("questions")}
                            onCancel={() => cancel.mutate("questions")}
                        />
                    )}
                    <DiscussionSection
                        sessionId={session.id}
                        isPr={session.source.kind === "pr"}
                        discussion={analyses?.discussion}
                        onRetry={() => run.mutate("discussion")}
                        onCancel={() => cancel.mutate("discussion")}
                    />
                </div>
            </section>
            <AskPanel
                session={session}
                suggestions={result?.askSuggestions ?? []}
            />
        </div>
    );
}
