import { useEffect, useState } from "react";
import { Button } from "@ui/components/ui/button";
import { Textarea } from "@ui/components/ui/textarea";
import { useSettings, useUpdateSetting } from "@core/api/useSettings";
import { DEFAULT_REVIEW_PROMPT } from "@core/types/grsp";
import { SectionHeader } from "../SectionHeader";

export function ReviewPromptSection() {
    const { data: settings } = useSettings();
    const { mutate: updateSetting } = useUpdateSetting();
    const saved = settings?.reviewPrompt;
    const [draft, setDraft] = useState<string | undefined>(undefined);

    // Start (and restart after Reset) from the saved prompt.
    useEffect(() => {
        if (saved !== undefined) setDraft(saved);
    }, [saved]);

    if (!settings || draft === undefined) return null;

    function save() {
        if (draft === undefined || draft === saved) return;
        updateSetting({ key: "reviewPrompt", value: draft });
    }

    function reset() {
        setDraft(DEFAULT_REVIEW_PROMPT);
        if (saved !== DEFAULT_REVIEW_PROMPT) {
            updateSetting({
                key: "reviewPrompt",
                value: DEFAULT_REVIEW_PROMPT,
            });
        }
    }

    const isDefault = draft === DEFAULT_REVIEW_PROMPT;

    return (
        <div>
            <SectionHeader
                title="Review prompt"
                description="Sent with every AI review. Describe what you care about in this codebase."
            />

            <div
                className="mt-6 animate-fade-in-up"
                style={{ animationDelay: "50ms" }}
            >
                <label htmlFor="review-prompt" className="sr-only">
                    Review prompt
                </label>
                <Textarea
                    id="review-prompt"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={save}
                    rows={9}
                    spellCheck={false}
                    className="select-text resize-y px-3.5 py-3 font-mono text-[12.5px] leading-[1.6]"
                />
                <div className="mt-3 flex items-center gap-3.5">
                    <Button
                        variant="outline"
                        onClick={reset}
                        disabled={isDefault}
                    >
                        Reset to default
                    </Button>
                    {draft !== saved && (
                        <span className="text-xs text-muted-foreground">
                            Saves when you click away.
                        </span>
                    )}
                </div>
            </div>

            <div
                className="mt-6 animate-fade-in-up border-t border-border pt-5"
                style={{ animationDelay: "100ms" }}
            >
                <p className="section-label mb-2">Per-repository override</p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Add a{" "}
                    <code className="select-text font-mono text-[12.5px] text-foreground">
                        .grsp/prompt.md
                    </code>{" "}
                    file to a repository and grsp appends it to this prompt for
                    reviews in that repo. The Review tab shows "Repo prompt
                    active" when one is found.
                </p>
            </div>
        </div>
    );
}
