import type { SettingsSection } from "@core/types/settings";
import { GeneralSection } from "./sections/GeneralSection";
import { GitBranchesSection } from "./sections/GitBranchesSection";
import { SchedulingSection } from "./sections/SchedulingSection";
import { BudgetSection } from "./sections/BudgetSection";
import { IntegrationsSection } from "./sections/IntegrationsSection";
import { AccountSection } from "./sections/AccountSection";
import { ProjectSection } from "./sections/ProjectSection";

interface SettingsContentProps {
    activeSection: SettingsSection;
    onSectionChange: (section: SettingsSection) => void;
}

export function SettingsContent({
    activeSection,
    onSectionChange,
}: SettingsContentProps) {
    return (
        <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl px-10 py-8">
                {activeSection === "general" && <GeneralSection />}
                {activeSection === "git" && <GitBranchesSection />}
                {activeSection === "scheduling" && <SchedulingSection />}
                {activeSection === "budget" && <BudgetSection />}
                {activeSection === "integrations" && <IntegrationsSection />}
                {activeSection === "account" && <AccountSection />}
                {activeSection.startsWith("project-") && (
                    <ProjectSection
                        repositoryId={activeSection.replace("project-", "")}
                        onRemoved={() => onSectionChange("general")}
                    />
                )}
            </div>
        </div>
    );
}
