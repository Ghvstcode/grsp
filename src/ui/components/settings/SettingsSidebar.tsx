import { useNavigate } from "react-router-dom";
import {
    ArrowLeft,
    Settings,
    GitBranch,
    Clock,
    Wallet,
    Plug,
    User,
} from "lucide-react";
import { useRepositories } from "@core/api/useRepositories";
import type { SettingsSection } from "@core/types/settings";

const AVATAR_COLORS = [
    "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
    "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    "bg-pink-500/15 text-pink-600 dark:text-pink-400",
];

function getAvatarColor(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const GLOBAL_SECTIONS: {
    id: SettingsSection;
    label: string;
    icon: React.ElementType;
}[] = [
    { id: "general", label: "General", icon: Settings },
    { id: "git", label: "Git & Branches", icon: GitBranch },
    { id: "scheduling", label: "Scheduling", icon: Clock },
    { id: "budget", label: "Budget", icon: Wallet },
    { id: "integrations", label: "Integrations", icon: Plug },
    { id: "account", label: "Account", icon: User },
];

interface SettingsSidebarProps {
    activeSection: SettingsSection;
    onSectionChange: (section: SettingsSection) => void;
}

export function SettingsSidebar({
    activeSection,
    onSectionChange,
}: SettingsSidebarProps) {
    const navigate = useNavigate();
    const { data: repositories } = useRepositories();

    return (
        <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
            {/* Back link */}
            <div className="px-4 pt-4 pb-2">
                <button
                    type="button"
                    onClick={() => navigate("/")}
                    className="flex items-center gap-1.5 text-[12px] text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
                >
                    <ArrowLeft className="h-3 w-3" />
                    Back to app
                </button>
            </div>

            {/* Section title */}
            <div className="px-4 pb-3 pt-2">
                <h2 className="text-sm font-semibold text-sidebar-foreground">
                    Settings
                </h2>
            </div>

            {/* Global sections */}
            <nav className="flex flex-col gap-0.5 px-2">
                {GLOBAL_SECTIONS.map((section) => {
                    const Icon = section.icon;
                    const isActive = activeSection === section.id;
                    return (
                        <button
                            key={section.id}
                            type="button"
                            onClick={() => onSectionChange(section.id)}
                            className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors ${
                                isActive
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                            }`}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {section.label}
                        </button>
                    );
                })}
            </nav>

            {/* Separator + Projects header */}
            {repositories && repositories.length > 0 && (
                <>
                    <div className="mx-4 my-3 border-t border-sidebar-border" />
                    <p className="px-4 pb-2 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/40">
                        Projects
                    </p>
                    <nav className="flex flex-col gap-0.5 px-2 overflow-y-auto flex-1 min-h-0">
                        {repositories.map((repo) => {
                            const sectionId =
                                `project-${repo.id}` as SettingsSection;
                            const isActive = activeSection === sectionId;
                            return (
                                <button
                                    key={repo.id}
                                    type="button"
                                    onClick={() => onSectionChange(sectionId)}
                                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors text-left ${
                                        isActive
                                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                                    }`}
                                >
                                    <span
                                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold ${getAvatarColor(repo.name)}`}
                                    >
                                        {repo.name[0]?.toUpperCase()}
                                    </span>
                                    <span className="truncate">
                                        {repo.name}
                                    </span>
                                </button>
                            );
                        })}
                    </nav>
                </>
            )}
        </aside>
    );
}
