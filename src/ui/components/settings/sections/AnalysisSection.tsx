import { Switch } from "@ui/components/ui/switch";
import { Segmented } from "@ui/components/ui/segmented";
import { useSettings, useUpdateSetting } from "@core/api/useSettings";
import type { GrspSettings } from "@core/types/grsp";
import { SettingsRow } from "../SettingsRow";
import { SectionHeader } from "../SectionHeader";

const DEPTH_OPTIONS: { value: GrspSettings["traceDepth"]; label: string }[] = [
    { value: 1, label: "1 hop" },
    { value: 2, label: "2 hops" },
    { value: 3, label: "3 hops" },
];

export function AnalysisSection() {
    const { data: settings } = useSettings();
    const { mutate: updateSetting } = useUpdateSetting();

    if (!settings) return null;

    return (
        <div>
            <SectionHeader
                title="Analysis"
                description="What grsp generates for each review, and how far it follows the code."
            />

            <div className="mt-6">
                <div
                    className="animate-fade-in-up"
                    style={{ animationDelay: "50ms" }}
                >
                    <SettingsRow
                        label="Generate comprehension questions"
                        sublabel="Adds “Can you answer these?” to every Gist."
                    >
                        <Switch
                            aria-label="Generate comprehension questions"
                            checked={settings.comprehensionQuestions}
                            onCheckedChange={(checked) =>
                                updateSetting({
                                    key: "comprehensionQuestions",
                                    value: checked,
                                })
                            }
                        />
                    </SettingsRow>
                </div>

                <div
                    className="animate-fade-in-up"
                    style={{ animationDelay: "100ms" }}
                >
                    <SettingsRow
                        label="Show unchanged blocks in walkthroughs"
                        sublabel="Turn off to step only through what this PR touches."
                    >
                        <Switch
                            aria-label="Show unchanged blocks in walkthroughs"
                            checked={settings.showUnchangedBlocks}
                            onCheckedChange={(checked) =>
                                updateSetting({
                                    key: "showUnchangedBlocks",
                                    value: checked,
                                })
                            }
                        />
                    </SettingsRow>
                </div>

                <div
                    className="animate-fade-in-up"
                    style={{ animationDelay: "150ms" }}
                >
                    <SettingsRow
                        label="Run AI review when a session opens"
                        sublabel="Off by default: it uses your agent subscription on every PR you open. When off, the review runs only when you ask."
                    >
                        <Switch
                            aria-label="Run AI review when a session opens"
                            checked={settings.autoRunReview}
                            onCheckedChange={(checked) =>
                                updateSetting({
                                    key: "autoRunReview",
                                    value: checked,
                                })
                            }
                        />
                    </SettingsRow>
                </div>

                <div
                    className="animate-fade-in-up"
                    style={{ animationDelay: "200ms" }}
                >
                    <SettingsRow
                        label="Trace depth"
                        sublabel="How many calls out from a changed symbol to follow."
                    >
                        <Segmented
                            label="Trace depth"
                            size="sm"
                            value={settings.traceDepth}
                            onValueChange={(value) =>
                                updateSetting({ key: "traceDepth", value })
                            }
                            options={DEPTH_OPTIONS}
                            className="gap-1.5"
                        />
                    </SettingsRow>
                </div>
            </div>
        </div>
    );
}
