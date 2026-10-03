import { Switch } from "@ui/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@ui/components/ui/select";
import { SettingsRow } from "../SettingsRow";
import {
    useGlobalSettings,
    useUpdateGlobalSetting,
} from "@core/api/useSettings";
import { playSound } from "@core/services/notifications";

export function GeneralSection() {
    const { data: settings } = useGlobalSettings();
    const { mutate: updateSetting } = useUpdateGlobalSetting();

    if (!settings) return null;

    return (
        <div>
            <div
                className="animate-fade-in-up"
                style={{ animationDelay: "0ms" }}
            >
                <h1 className="text-lg font-semibold text-foreground">
                    General
                </h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    Configure how SUSTN notifies you and handles completed
                    tasks.
                </p>
            </div>

            <div className="mt-6">
                <div
                    className="animate-fade-in-up"
                    style={{ animationDelay: "50ms" }}
                >
                    <SettingsRow
                        label="Desktop notifications"
                        sublabel="Get notified when tasks are ready for review, scans complete, or the agent encounters an error."
                    >
                        <Switch
                            checked={settings.notificationsEnabled}
                            onCheckedChange={(checked) =>
                                updateSetting({
                                    key: "notificationsEnabled",
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
                        label="Sound effects"
                        sublabel="Play a sound when the agent completes a task."
                    >
                        <div className="flex items-center gap-3">
                            <Select
                                value={settings.soundPreset}
                                onValueChange={(value) =>
                                    updateSetting({
                                        key: "soundPreset",
                                        value,
                                    })
                                }
                                disabled={!settings.soundEnabled}
                            >
                                <SelectTrigger className="w-[100px] h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem
                                        value="chime"
                                        onPointerEnter={() =>
                                            playSound("chime")
                                        }
                                    >
                                        Chime
                                    </SelectItem>
                                    <SelectItem
                                        value="ding"
                                        onPointerEnter={() => playSound("ding")}
                                    >
                                        Ding
                                    </SelectItem>
                                    <SelectItem
                                        value="pop"
                                        onPointerEnter={() => playSound("pop")}
                                    >
                                        Pop
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <Switch
                                checked={settings.soundEnabled}
                                onCheckedChange={(checked) =>
                                    updateSetting({
                                        key: "soundEnabled",
                                        value: checked,
                                    })
                                }
                            />
                        </div>
                    </SettingsRow>
                </div>

                <div
                    className="animate-fade-in-up"
                    style={{ animationDelay: "150ms" }}
                >
                    <SettingsRow
                        label="Auto-create PRs"
                        sublabel="Automatically create a pull request when the agent completes a task. When off, completed tasks wait in Review for you to approve."
                    >
                        <Switch
                            checked={settings.autoCreatePrs}
                            onCheckedChange={(checked) =>
                                updateSetting({
                                    key: "autoCreatePrs",
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
                        label="Parallel tasks"
                        sublabel="Maximum number of tasks that can run at the same time. Higher values finish backlogs faster but consume tokens and Claude rate limit faster."
                    >
                        <Select
                            value={String(settings.concurrencyLimit ?? 5)}
                            onValueChange={(value) =>
                                updateSetting({
                                    key: "concurrencyLimit",
                                    value: parseInt(value, 10),
                                })
                            }
                        >
                            <SelectTrigger className="w-24">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                                    <SelectItem key={n} value={String(n)}>
                                        {n}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </SettingsRow>
                </div>
                {/*
                <div
                    className="animate-fade-in-up"
                    style={{ animationDelay: "200ms" }}
                >
                    <SettingsRow
                        label="Delete branch on dismiss"
                        sublabel="Delete the local branch when you dismiss a completed task without creating a PR."
                    >
                        <Switch
                            checked={settings.deleteBranchOnDismiss}
                            onCheckedChange={(checked) =>
                                updateSetting({
                                    key: "deleteBranchOnDismiss",
                                    value: checked,
                                })
                            }
                        />
                    </SettingsRow>
                </div> */}
            </div>
        </div>
    );
}
