import {
    Bot,
    FileText,
    Folder,
    GitBranch,
    Settings,
    SlidersHorizontal,
    User,
} from "lucide-react";

export type SettingsSection =
    | "review-prompt"
    | "agent"
    | "analysis"
    | "git-hosts"
    | "repositories"
    | "general"
    | "account";

export const SETTINGS_SECTIONS: {
    id: SettingsSection;
    label: string;
    icon: React.ElementType;
}[] = [
    { id: "review-prompt", label: "Review prompt", icon: FileText },
    { id: "agent", label: "Agent", icon: Bot },
    { id: "analysis", label: "Analysis", icon: SlidersHorizontal },
    { id: "git-hosts", label: "Git hosts", icon: GitBranch },
    { id: "repositories", label: "Repositories", icon: Folder },
    { id: "general", label: "General", icon: Settings },
    { id: "account", label: "Account", icon: User },
];

export const DEFAULT_SETTINGS_SECTION: SettingsSection = "review-prompt";

/** `?section=` value → a known section, or the default. */
export function parseSettingsSection(
    value: string | null | undefined,
): SettingsSection {
    return (
        SETTINGS_SECTIONS.find((s) => s.id === value)?.id ??
        DEFAULT_SETTINGS_SECTION
    );
}
