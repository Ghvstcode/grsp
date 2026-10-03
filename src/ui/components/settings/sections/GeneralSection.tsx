import { Segmented } from "@ui/components/ui/segmented";
import { useTheme } from "@ui/hooks/useTheme";
import type { ThemeMode } from "@ui/themes";
import { SettingsRow } from "../SettingsRow";
import { SectionHeader } from "../SectionHeader";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
];

export function GeneralSection() {
    const { mode, setMode } = useTheme();

    return (
        <div>
            <SectionHeader
                title="General"
                description="How grsp looks on this Mac."
            />

            <div className="mt-6">
                <div
                    className="animate-fade-in-up"
                    style={{ animationDelay: "50ms" }}
                >
                    <SettingsRow
                        label="Appearance"
                        sublabel="System follows your macOS light or dark setting."
                    >
                        <Segmented
                            label="Appearance"
                            size="sm"
                            value={mode}
                            onValueChange={setMode}
                            options={THEME_OPTIONS}
                            className="gap-1.5"
                        />
                    </SettingsRow>
                </div>
            </div>
        </div>
    );
}
