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
import type {
    AgentMode,
    ScheduleDay,
    ScanFrequency,
} from "@core/types/settings";
import { Clock, Zap, Hand } from "lucide-react";

const AGENT_MODES: {
    value: AgentMode;
    label: string;
    description: string;
    icon: React.ElementType;
}[] = [
    {
        value: "scheduled",
        label: "Scheduled",
        description: "Works during specific time windows",
        icon: Clock,
    },
    {
        value: "always",
        label: "Always on",
        description: "Works whenever budget is available",
        icon: Zap,
    },
    {
        value: "manual",
        label: "Manual",
        description: "Only when you trigger it",
        icon: Hand,
    },
];

const DAYS: { value: ScheduleDay; label: string }[] = [
    { value: "mon", label: "Mon" },
    { value: "tue", label: "Tue" },
    { value: "wed", label: "Wed" },
    { value: "thu", label: "Thu" },
    { value: "fri", label: "Fri" },
    { value: "sat", label: "Sat" },
    { value: "sun", label: "Sun" },
];

const SCAN_OPTIONS: { value: ScanFrequency; label: string }[] = [
    { value: "on-push", label: "On every push to base branch" },
    { value: "6h", label: "Every 6 hours" },
    { value: "12h", label: "Every 12 hours" },
    { value: "daily", label: "Daily" },
    { value: "manual", label: "Manual only" },
];

export function SchedulingSection() {
    const { data: settings } = useGlobalSettings();
    const { mutate: updateSetting } = useUpdateGlobalSetting();

    if (!settings) return null;

    function toggleDay(day: ScheduleDay) {
        if (!settings) return;
        const days = settings.scheduleDays.includes(day)
            ? settings.scheduleDays.filter((d) => d !== day)
            : [...settings.scheduleDays, day];
        updateSetting({ key: "scheduleDays", value: days });
    }

    const detectedTimezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    return (
        <div>
            <div
                className="animate-fade-in-up"
                style={{ animationDelay: "0ms" }}
            >
                <h1 className="text-lg font-semibold text-foreground">
                    Scheduling
                </h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    Control when the agent works on tasks.
                </p>
            </div>

            <div className="mt-6">
                {/* Agent mode */}
                <div
                    className="animate-fade-in-up"
                    style={{ animationDelay: "50ms" }}
                >
                    <SettingsRow
                        label="Agent mode"
                        sublabel="Choose how the agent decides when to work."
                        vertical
                    >
                        <div className="flex gap-2">
                            {AGENT_MODES.map((mode) => {
                                const Icon = mode.icon;
                                const isSelected =
                                    settings.agentMode === mode.value;
                                return (
                                    <button
                                        key={mode.value}
                                        type="button"
                                        onClick={() =>
                                            updateSetting({
                                                key: "agentMode",
                                                value: mode.value,
                                            })
                                        }
                                        className={`group flex flex-1 flex-col items-start gap-1.5 rounded-md px-3 py-2.5 text-left transition-all duration-200 ${
                                            isSelected
                                                ? "bg-foreground text-background shadow-sm"
                                                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <Icon className="h-3.5 w-3.5" />
                                            <span className="text-xs font-medium">
                                                {mode.label}
                                            </span>
                                        </div>
                                        <span
                                            className={`text-[11px] leading-snug ${
                                                isSelected
                                                    ? "text-background/60"
                                                    : "text-muted-foreground/50"
                                            }`}
                                        >
                                            {mode.description}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </SettingsRow>
                </div>

                {/* Schedule config — only visible when scheduled */}
                {settings.agentMode === "scheduled" && (
                    <>
                        <div
                            className="animate-fade-in-up"
                            style={{ animationDelay: "100ms" }}
                        >
                            <SettingsRow
                                label="Active days"
                                sublabel="Which days the agent is allowed to work."
                                vertical
                            >
                                <div className="flex gap-1.5">
                                    {DAYS.map((day) => {
                                        const isSelected =
                                            settings.scheduleDays.includes(
                                                day.value,
                                            );
                                        return (
                                            <button
                                                key={day.value}
                                                type="button"
                                                onClick={() =>
                                                    toggleDay(day.value)
                                                }
                                                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                                                    isSelected
                                                        ? "bg-foreground text-background shadow-sm"
                                                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                                                }`}
                                            >
                                                {day.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </SettingsRow>
                        </div>

                        <div
                            className="animate-fade-in-up"
                            style={{ animationDelay: "150ms" }}
                        >
                            <SettingsRow
                                label="Work window"
                                sublabel={`The agent will work between ${settings.scheduleStart} and ${settings.scheduleEnd}. Times are in ${settings.scheduleTimezone || detectedTimezone}.`}
                            >
                                <div className="flex items-center gap-2">
                                    <input
                                        type="time"
                                        value={settings.scheduleStart}
                                        onChange={(e) =>
                                            updateSetting({
                                                key: "scheduleStart",
                                                value: e.target.value,
                                            })
                                        }
                                        className="rounded-md border border-input bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                                    />
                                    <span className="text-xs text-muted-foreground">
                                        to
                                    </span>
                                    <input
                                        type="time"
                                        value={settings.scheduleEnd}
                                        onChange={(e) =>
                                            updateSetting({
                                                key: "scheduleEnd",
                                                value: e.target.value,
                                            })
                                        }
                                        className="rounded-md border border-input bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                                    />
                                </div>
                            </SettingsRow>
                        </div>
                    </>
                )}

                {/* Scan frequency */}
                <div
                    className="animate-fade-in-up"
                    style={{ animationDelay: "200ms" }}
                >
                    <SettingsRow
                        label="Scan frequency"
                        sublabel="How often SUSTN re-scans your codebases for new tasks. Scans are lightweight and don't consume much token budget."
                    >
                        <Select
                            value={settings.scanFrequency}
                            onValueChange={(value) =>
                                updateSetting({
                                    key: "scanFrequency",
                                    value: value as ScanFrequency,
                                })
                            }
                        >
                            <SelectTrigger className="w-[220px] h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {SCAN_OPTIONS.map((opt) => (
                                    <SelectItem
                                        key={opt.value}
                                        value={opt.value}
                                    >
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </SettingsRow>
                </div>
            </div>
        </div>
    );
}
