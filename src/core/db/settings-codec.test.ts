import { describe, expect, it } from "vitest";
import {
    DEFAULT_SETTINGS,
    SETTINGS_KEYS,
    type GrspSettings,
} from "@core/types/grsp";
import {
    decodeSettings,
    encodeSetting,
    type SettingUpdate,
} from "./settings-codec";

describe("decodeSettings", () => {
    it("returns the defaults for an empty table", () => {
        expect(decodeSettings([])).toEqual(DEFAULT_SETTINGS);
    });

    it("reads JSON-encoded values by their table keys", () => {
        const settings = decodeSettings([
            { key: "review_prompt", value: '"Be strict."' },
            { key: "agent", value: '"codex"' },
            { key: "comprehension_questions", value: "false" },
            { key: "show_unchanged_blocks", value: "false" },
            { key: "auto_run_review", value: "true" },
            { key: "trace_depth", value: "3" },
        ]);
        expect(settings).toEqual({
            reviewPrompt: "Be strict.",
            agent: "codex",
            comprehensionQuestions: false,
            showUnchangedBlocks: false,
            autoRunReview: true,
            traceDepth: 3,
        });
    });

    it("falls back per key on malformed or out-of-range values", () => {
        const settings = decodeSettings([
            { key: "agent", value: '"gemini"' },
            { key: "trace_depth", value: "7" },
            { key: "auto_run_review", value: '"yes"' },
            { key: "review_prompt", value: "not json" },
            { key: "comprehension_questions", value: "false" },
        ]);
        expect(settings.agent).toBe(DEFAULT_SETTINGS.agent);
        expect(settings.traceDepth).toBe(DEFAULT_SETTINGS.traceDepth);
        expect(settings.autoRunReview).toBe(false);
        expect(settings.reviewPrompt).toBe(DEFAULT_SETTINGS.reviewPrompt);
        expect(settings.comprehensionQuestions).toBe(false);
    });

    it("keeps an intentionally empty review prompt", () => {
        expect(
            decodeSettings([{ key: "review_prompt", value: '""' }])
                .reviewPrompt,
        ).toBe("");
    });

    it("ignores unknown keys", () => {
        expect(decodeSettings([{ key: "budget", value: "1" }])).toEqual(
            DEFAULT_SETTINGS,
        );
    });
});

describe("encodeSetting", () => {
    it("uses the table key and JSON-encodes the value", () => {
        expect(encodeSetting({ key: "agent", value: "codex" })).toEqual({
            key: "agent",
            value: '"codex"',
        });
        expect(encodeSetting({ key: "traceDepth", value: 1 })).toEqual({
            key: "trace_depth",
            value: "1",
        });
        expect(encodeSetting({ key: "autoRunReview", value: true })).toEqual({
            key: "auto_run_review",
            value: "true",
        });
    });

    it("round-trips every setting through decodeSettings", () => {
        const changed: GrspSettings = {
            reviewPrompt: 'Line one\nLine "two"',
            agent: "codex",
            comprehensionQuestions: false,
            showUnchangedBlocks: false,
            autoRunReview: true,
            traceDepth: 1,
        };
        const updates: SettingUpdate[] = [
            { key: "reviewPrompt", value: changed.reviewPrompt },
            { key: "agent", value: changed.agent },
            {
                key: "comprehensionQuestions",
                value: changed.comprehensionQuestions,
            },
            { key: "showUnchangedBlocks", value: changed.showUnchangedBlocks },
            { key: "autoRunReview", value: changed.autoRunReview },
            { key: "traceDepth", value: changed.traceDepth },
        ];
        const rows = updates.map(encodeSetting);
        expect(rows.map((r) => r.key).sort()).toEqual(
            Object.values(SETTINGS_KEYS).sort(),
        );
        expect(decodeSettings(rows)).toEqual(changed);
    });
});
