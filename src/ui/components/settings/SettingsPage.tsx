import { useSearchParams } from "react-router-dom";
import { useAuth } from "@core/api/useAuth";
import { SettingsSidebar } from "./SettingsSidebar";
import { SettingsContent } from "./SettingsContent";
import { parseSettingsSection, type SettingsSection } from "./sections";

/**
 * Settings. The open section lives in the URL so other screens can link
 * straight to one, e.g. `/settings?section=review-prompt`.
 */
export function SettingsPage() {
    useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeSection = parseSettingsSection(searchParams.get("section"));

    function setActiveSection(section: SettingsSection) {
        setSearchParams({ section }, { replace: true });
    }

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-background">
            <SettingsSidebar
                activeSection={activeSection}
                onSectionChange={setActiveSection}
            />
            <SettingsContent activeSection={activeSection} />
        </div>
    );
}
