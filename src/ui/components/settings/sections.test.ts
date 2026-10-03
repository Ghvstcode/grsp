import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS_SECTION, parseSettingsSection } from "./sections";

describe("parseSettingsSection", () => {
    it("accepts known section ids from the URL", () => {
        expect(parseSettingsSection("review-prompt")).toBe("review-prompt");
        expect(parseSettingsSection("repositories")).toBe("repositories");
    });

    it("falls back to the default for missing or unknown values", () => {
        expect(parseSettingsSection(null)).toBe(DEFAULT_SETTINGS_SECTION);
        expect(parseSettingsSection("budget")).toBe(DEFAULT_SETTINGS_SECTION);
    });
});
