import { useState, type FormEvent } from "react";
import type { AskMessage, ReviewSession } from "@core/types/grsp";
import { useAsk } from "@core/api/useAsk";
import { errorMessage } from "@core/api/useSession";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { cn } from "@ui/lib/utils";
import { CodeBlock } from "../shared/CodeBlock";
import { ProgressLine } from "../shared/ProgressLine";
import { RefChip } from "../shared/RefChip";
import { SectionLabel } from "../shared/SectionLabel";
import { isFromEarlierVersion, traceLine } from "../lib/status";

function Answer({
    message,
    session,
    onCancel,
    onAskAgain,
}: {
    message: AskMessage;
    session: ReviewSession;
    onCancel: () => void;
    onAskAgain: () => void;
}) {
    const answer = message.answer;
    const earlier = isFromEarlierVersion(message.headSha, session);
    return (
        <div className="flex flex-col gap-2.5">
            <div className="max-w-[88%] self-end rounded-[10px] bg-foreground px-[13px] py-[9px] text-[13px] text-background">
                {message.question}
            </div>
            {message.status === "running" && (
                <ProgressLine
                    text={message.progress ?? "Starting the agent"}
                    onCancel={onCancel}
                />
            )}
            {message.status === "error" && (
                <div className="flex flex-col gap-1.5">
                    <p className="grsp-text-2 m-0 text-[13px]">
                        {message.error === "Cancelled."
                            ? "Cancelled before an answer came back."
                            : `Couldn't answer this. ${message.error ?? ""}`}
                    </p>
                    <button
                        type="button"
                        onClick={onAskAgain}
                        className="self-start text-xs font-medium underline underline-offset-[3px]"
                    >
                        Ask again
                    </button>
                </div>
            )}
            {message.status === "done" && answer && (
                <div className="flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SectionLabel>{traceLine(message)}</SectionLabel>
                        {answer.grounded && answer.confidence === "low" && (
                            <span className="rounded-[4px] border px-1.5 py-px text-[11px] text-muted-foreground">
                                Low confidence
                            </span>
                        )}
                        {earlier && (
                            <span className="rounded-[4px] border border-dashed px-1.5 py-px text-[11px] text-muted-foreground">
                                From an earlier version
                            </span>
                        )}
                    </div>
                    <div
                        className={cn(
                            "flex flex-col gap-2.5",
                            !answer.grounded &&
                                "grsp-border-strong rounded-lg border border-dashed px-3.5 py-3",
                        )}
                    >
                        {answer.paragraphs.map((paragraph, index) => (
                            <p
                                key={index}
                                className={cn(
                                    "m-0 text-[13.5px]",
                                    answer.grounded
                                        ? "grsp-text-1"
                                        : "grsp-text-2",
                                )}
                            >
                                {paragraph}
                            </p>
                        ))}
                    </div>
                    {answer.excerpt && answer.excerpt.lines.length > 0 && (
                        <CodeBlock excerpt={answer.excerpt} />
                    )}
                    {answer.refs.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {answer.refs.map((codeRef, index) => (
                                <RefChip key={index} codeRef={codeRef} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

interface AskPanelProps {
    session: ReviewSession;
    /** From discovery's `askSuggestions`. */
    suggestions: string[];
}

/** The fixed 400px panel on the Gist: input and chips on top, answers below. */
export function AskPanel({ session, suggestions }: AskPanelProps) {
    const { messages, send, cancel } = useAsk(session.id);
    const [draft, setDraft] = useState("");

    const ask = (text: string) => {
        const question = text.trim();
        if (!question) return;
        send.mutate(question);
        setDraft("");
    };
    const onSubmit = (event: FormEvent) => {
        event.preventDefault();
        ask(draft);
    };

    return (
        <aside className="flex min-h-0 w-[400px] shrink-0 flex-col border-l">
            <div className="flex flex-col gap-2.5 border-b px-5 pb-3.5 pt-[18px]">
                <span className="text-[15px] font-semibold">
                    {session.source.kind === "pr"
                        ? "Ask about this PR"
                        : "Ask about this change"}
                </span>
                <form onSubmit={onSubmit} className="flex gap-2">
                    <label htmlFor="grsp-ask" className="sr-only">
                        Question
                    </label>
                    <Input
                        id="grsp-ask"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Ask anything about this change"
                        autoComplete="off"
                        className="grsp-border-strong h-[42px] min-w-0 grow rounded-lg bg-background px-3 text-[13px] shadow-none md:text-[13px]"
                    />
                    <Button
                        type="submit"
                        disabled={draft.trim() === ""}
                        className="h-[42px] rounded-lg bg-foreground px-4 text-[13px] text-background shadow-none hover:bg-foreground/90 disabled:opacity-100"
                    >
                        Ask
                    </Button>
                </form>
                {send.isError && (
                    <p className="grsp-text-2 m-0 text-xs" role="alert">
                        Couldn't send that. {errorMessage(send.error)}
                    </p>
                )}
                {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((text) => (
                            <button
                                key={text}
                                type="button"
                                onClick={() => ask(text)}
                                className="grsp-text-soft min-h-[30px] rounded-full border bg-background px-2.5 py-1 text-left text-xs hover:border-foreground"
                            >
                                {text}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div className="flex grow flex-col gap-[26px] overflow-auto px-5 pb-7 pt-[18px]">
                {messages.length === 0 ? (
                    <p className="m-0 text-[13px] text-muted-foreground">
                        Answers come from the code at this commit, with the
                        lines they rely on.
                    </p>
                ) : (
                    messages.map((message) => (
                        <Answer
                            key={message.id}
                            message={message}
                            session={session}
                            onCancel={() => cancel.mutate(message.id)}
                            onAskAgain={() => ask(message.question)}
                        />
                    ))
                )}
            </div>
        </aside>
    );
}
