import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SETTINGS_SECTIONS, type SettingsSection } from "./sections";

interface SettingsSidebarProps {
    activeSection: SettingsSection;
    onSectionChange: (section: SettingsSection) => void;
}

export function SettingsSidebar({
    activeSection,
    onSectionChange,
}: SettingsSidebarProps) {
    const navigate = useNavigate();

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

            {/* Sections */}
            <nav className="flex flex-col gap-0.5 px-2">
                {SETTINGS_SECTIONS.map((section) => {
                    const Icon = section.icon;
                    const isActive = activeSection === section.id;
                    return (
                        <button
                            key={section.id}
                            type="button"
                            onClick={() => onSectionChange(section.id)}
                            aria-current={isActive ? "page" : undefined}
                            className={`flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-[13px] transition-colors ${
                                isActive
                                    ? "border-line bg-paper text-sidebar-accent-foreground font-medium"
                                    : "border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                            }`}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {section.label}
                        </button>
                    );
                })}
            </nav>
        </aside>
    );
}
