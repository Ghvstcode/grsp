import { Switch } from "@ui/components/ui/switch";
import { Slider } from "@ui/components/ui/slider";
import { SettingsRow } from "../SettingsRow";
import {
    useGlobalSettings,
    useUpdateGlobalSetting,
} from "@core/api/useSettings";

export function BudgetSection() {
    const { data: settings } = useGlobalSettings();
    const { mutate: updateSetting } = useUpdateGlobalSetting();

    if (!settings) return null;

    const ceiling = settings.budgetCeilingPercent;
    const reserved = 100 - ceiling;

    return (
        <div>
            <div
                className="animate-fade-in-up"
                style={{ animationDelay: "0ms" }}
            >
                <h1 className="text-lg font-semibold text-foreground">
                    Budget
                </h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    Control how much of your Claude Code subscription SUSTN is
                    allowed to use.
                </p>
            </div>

            <div className="mt-6">
                <div
                    className="animate-fade-in-up"
                    style={{ animationDelay: "50ms" }}
                >
                    <SettingsRow
                        label="Budget ceiling"
                        sublabel="SUSTN will pause automatically when this limit is reached. You'll never wake up to a maxed-out subscription."
                        vertical
                    >
                        <div className="space-y-3">
                            <Slider
                                value={[ceiling]}
                                onValueChange={([value]) =>
                                    updateSetting({
                                        key: "budgetCeilingPercent",
                                        value,
                                    })
                                }
                                min={10}
                                max={100}
                                step={5}
                                className="w-full"
                            />
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-foreground">
                                    Use up to {ceiling}% of daily budget
                                </p>
                                <p className="text-[13px] text-muted-foreground">
                                    {reserved}% reserved for manual use
                                </p>
                            </div>
                        </div>
                    </SettingsRow>
                </div>

                <div
                    className="animate-fade-in-up"
                    style={{ animationDelay: "100ms" }}
                >
                    <SettingsRow
                        label="Show budget in sidebar"
                        sublabel="Display remaining budget in the sidebar status bar."
                    >
                        <Switch
                            checked={settings.showBudgetInSidebar}
                            onCheckedChange={(checked) =>
                                updateSetting({
                                    key: "showBudgetInSidebar",
                                    value: checked,
                                })
                            }
                        />
                    </SettingsRow>
                </div>
            </div>
        </div>
    );
}
