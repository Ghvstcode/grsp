import type { SettingsSection } from "./sections";
import { ReviewPromptSection } from "./sections/ReviewPromptSection";
import { AgentSection } from "./sections/AgentSection";
import { AnalysisSection } from "./sections/AnalysisSection";
import { GitHostsSection } from "./sections/GitHostsSection";
import { RepositoriesSection } from "./sections/RepositoriesSection";
import { GeneralSection } from "./sections/GeneralSection";
import { AccountSection } from "./sections/AccountSection";

interface SettingsContentProps {
    activeSection: SettingsSection;
}

export function SettingsContent({ activeSection }: SettingsContentProps) {
    return (
        <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl px-10 py-8">
                {activeSection === "review-prompt" && <ReviewPromptSection />}
                {activeSection === "agent" && <AgentSection />}
                {activeSection === "analysis" && <AnalysisSection />}
                {activeSection === "git-hosts" && <GitHostsSection />}
                {activeSection === "repositories" && <RepositoriesSection />}
                {activeSection === "general" && <GeneralSection />}
                {activeSection === "account" && <AccountSection />}
            </div>
        </div>
    );
}
