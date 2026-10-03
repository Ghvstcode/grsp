import {
    DEFAULT_SETTINGS,
    SETTINGS_KEYS,
    type GrspSettings,
} from "@core/types/grsp";

export interface SettingRow {
    key: string;
    value: string;
}

type Validators = {
    [K in keyof GrspSettings]: (value: unknown) => value is GrspSettings[K];
};

const isBoolean = (value: unknown): value is boolean =>
    typeof value === "boolean";

const VALIDATORS: Validators = {
    reviewPrompt: (value): value is string => typeof value === "string",
    agent: (value): value is GrspSettings["agent"] =>
        value === "claude" || value === "codex",
    comprehensionQuestions: isBoolean,
    showUnchangedBlocks: isBoolean,
    autoRunReview: isBoolean,
    traceDepth: (value): value is GrspSettings["traceDepth"] =>
        value === 1 || value === 2 || value === 3,
};

function decodeOne<K extends keyof GrspSettings>(
    name: K,
    raw: string | undefined,
): GrspSettings[K] {
    if (raw === undefined) return DEFAULT_SETTINGS[name];
    try {
        const parsed: unknown = JSON.parse(raw);
        const validate = VALIDATORS[name];
        return validate(parsed) ? parsed : DEFAULT_SETTINGS[name];
    } catch {
        return DEFAULT_SETTINGS[name];
    }
}

/**
 * Rows of the `settings` table → settings. Missing, malformed or
 * out-of-range values fall back to the default for that key.
 */
export function decodeSettings(rows: SettingRow[]): GrspSettings {
    const byKey = new Map(rows.map((row) => [row.key, row.value]));
    return {
        reviewPrompt: decodeOne(
            "reviewPrompt",
            byKey.get(SETTINGS_KEYS.reviewPrompt),
        ),
        agent: decodeOne("agent", byKey.get(SETTINGS_KEYS.agent)),
        comprehensionQuestions: decodeOne(
            "comprehensionQuestions",
            byKey.get(SETTINGS_KEYS.comprehensionQuestions),
        ),
        showUnchangedBlocks: decodeOne(
            "showUnchangedBlocks",
            byKey.get(SETTINGS_KEYS.showUnchangedBlocks),
        ),
        autoRunReview: decodeOne(
            "autoRunReview",
            byKey.get(SETTINGS_KEYS.autoRunReview),
        ),
        traceDepth: decodeOne(
            "traceDepth",
            byKey.get(SETTINGS_KEYS.traceDepth),
        ),
    };
}

/** A change to one setting, with the value type tied to the key. */
export type SettingUpdate = {
    [K in keyof GrspSettings]: { key: K; value: GrspSettings[K] };
}[keyof GrspSettings];

/** One setting → the row stored for it (value is JSON-encoded). */
export function encodeSetting(update: SettingUpdate): SettingRow {
    return {
        key: SETTINGS_KEYS[update.key],
        value: JSON.stringify(update.value),
    };
}
