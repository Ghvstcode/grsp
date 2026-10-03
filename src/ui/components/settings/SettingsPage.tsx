import { useState } from "react";
import type { SettingsSection } from "@core/types/settings";
import { SettingsSidebar } from "./SettingsSidebar";
import { SettingsContent } from "./SettingsContent";

export function SettingsPage() {
    const [activeSection, setActiveSection] =
        useState<SettingsSection>("general");

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-background">
            <SettingsSidebar
                activeSection={activeSection}
                onSectionChange={setActiveSection}
            />
            <SettingsContent
                activeSection={activeSection}
                onSectionChange={setActiveSection}
            />
        </div>
    );
}
