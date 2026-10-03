import Database from "@tauri-apps/plugin-sql";
import { config } from "@core/config";
import type {
    GlobalSettings,
    ProjectOverrides,
    BranchPrefixMode,
    ScheduleDay,
} from "@core/types/settings";

interface SettingRow {
    key: string;
    value: string;
}

interface ProjectOverrideRow {
    repository_id: string;
    override_base_branch: string | null;
    override_remote_origin: string | null;
    override_branch_prefix_mode: string | null;
    override_branch_prefix_custom: string | null;
    override_budget_ceiling_percent: number | null;
    override_pr_auto_reply: number | null;
    agent_preferences: string | null;
    scan_preferences: string | null;
}

async function getDb() {
    return await Database.load(config.dbUrl);
}

// ── Key → camelCase mapping ────────────────────────────────

const KEY_MAP: Record<string, keyof GlobalSettings> = {
    notifications_enabled: "notificationsEnabled",
    sound_enabled: "soundEnabled",
    sound_preset: "soundPreset",
    auto_create_prs: "autoCreatePrs",
    delete_branch_on_dismiss: "deleteBranchOnDismiss",
    branch_prefix_mode: "branchPrefixMode",
    branch_prefix_custom: "branchPrefixCustom",
    branch_name_style: "branchNameStyle",
    default_base_branch: "defaultBaseBranch",
    remote_origin: "remoteOrigin",
    agent_mode: "agentMode",
    schedule_days: "scheduleDays",
    schedule_start: "scheduleStart",
    schedule_end: "scheduleEnd",
    schedule_timezone: "scheduleTimezone",
    scan_frequency: "scanFrequency",
    budget_ceiling_percent: "budgetCeilingPercent",
    show_budget_in_sidebar: "showBudgetInSidebar",
    linear_api_key: "linearApiKey",
    linear_enabled: "linearEnabled",
    pr_lifecycle_enabled: "prLifecycleEnabled",
    max_review_cycles: "maxReviewCycles",
    concurrency_limit: "concurrencyLimit",
};

const REVERSE_KEY_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(KEY_MAP).map(([k, v]) => [v, k]),
);

const BOOLEAN_KEYS = new Set([
    "notificationsEnabled",
    "soundEnabled",
    "autoCreatePrs",
    "deleteBranchOnDismiss",
    "showBudgetInSidebar",
    "linearEnabled",
    "prLifecycleEnabled",
]);

function parseValue(camelKey: string, raw: string): unknown {
    if (BOOLEAN_KEYS.has(camelKey)) return raw === "true";
    if (camelKey === "scheduleDays")
        return raw ? (raw.split(",") as ScheduleDay[]) : [];
    if (camelKey === "budgetCeilingPercent") return parseInt(raw, 10);
    if (camelKey === "maxReviewCycles") return parseInt(raw, 10);
    if (camelKey === "concurrencyLimit") return parseInt(raw, 10);
    return raw;
}

function serializeValue(camelKey: string, value: unknown): string {
    if (BOOLEAN_KEYS.has(camelKey)) return value ? "true" : "false";
    if (camelKey === "scheduleDays") return (value as string[]).join(",");
    return String(value);
}

// ── Global Settings ────────────────────────────────────────

const DEFAULTS: GlobalSettings = {
    notificationsEnabled: true,
    soundEnabled: false,
    soundPreset: "chime",
    autoCreatePrs: false,
    deleteBranchOnDismiss: false,
    branchPrefixMode: "sustn",
    branchPrefixCustom: "",
    branchNameStyle: "slug",
    defaultBaseBranch: "main",
    remoteOrigin: "origin",
    agentMode: "scheduled",
    scheduleDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    scheduleStart: "00:00",
    scheduleEnd: "06:00",
    scheduleTimezone: "",
    scanFrequency: "daily",
    budgetCeilingPercent: 75,
    showBudgetInSidebar: true,
    linearApiKey: "",
    linearEnabled: false,
    prLifecycleEnabled: true,
    maxReviewCycles: 5,
    concurrencyLimit: 5,
};

export async function getGlobalSettings(): Promise<GlobalSettings> {
    const db = await getDb();
    const rows = await db.select<SettingRow[]>(
        "SELECT key, value FROM global_settings",
    );

    const settings = { ...DEFAULTS };

    for (const row of rows) {
        const camelKey = KEY_MAP[row.key];
        if (camelKey) {
            (settings as Record<string, unknown>)[camelKey] = parseValue(
                camelKey,
                row.value,
            );
        }
    }

    return settings;
}

export async function updateGlobalSetting(
    camelKey: keyof GlobalSettings,
    value: unknown,
): Promise<void> {
    const db = await getDb();
    const snakeKey = REVERSE_KEY_MAP[camelKey];
    if (!snakeKey) return;

    const serialized = serializeValue(camelKey, value);
    await db.execute(
        "INSERT INTO global_settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP",
        [snakeKey, serialized],
    );
}

// ── Project Overrides ──────────────────────────────────────

function rowToProjectOverrides(row: ProjectOverrideRow): ProjectOverrides {
    return {
        repositoryId: row.repository_id,
        overrideBaseBranch: row.override_base_branch ?? undefined,
        overrideRemoteOrigin: row.override_remote_origin ?? undefined,
        overrideBranchPrefixMode:
            (row.override_branch_prefix_mode as BranchPrefixMode) ?? undefined,
        overrideBranchPrefixCustom:
            row.override_branch_prefix_custom ?? undefined,
        overrideBudgetCeilingPercent:
            row.override_budget_ceiling_percent ?? undefined,
        overridePrAutoReply:
            row.override_pr_auto_reply != null
                ? row.override_pr_auto_reply === 1
                : undefined,
        agentPreferences: row.agent_preferences ?? undefined,
        scanPreferences: row.scan_preferences ?? undefined,
    };
}

export async function getProjectOverrides(
    repositoryId: string,
): Promise<ProjectOverrides> {
    const db = await getDb();

    // Ensure agent_config row exists
    await db.execute(
        "INSERT OR IGNORE INTO agent_config (repository_id) VALUES ($1)",
        [repositoryId],
    );

    const rows = await db.select<ProjectOverrideRow[]>(
        `SELECT repository_id, override_base_branch, override_remote_origin,
                override_branch_prefix_mode, override_branch_prefix_custom,
                override_budget_ceiling_percent, override_pr_auto_reply,
                agent_preferences, scan_preferences
         FROM agent_config WHERE repository_id = $1`,
        [repositoryId],
    );

    if (rows[0]) return rowToProjectOverrides(rows[0]);

    return {
        repositoryId,
        overrideBaseBranch: undefined,
        overrideRemoteOrigin: undefined,
        overrideBranchPrefixMode: undefined,
        overrideBranchPrefixCustom: undefined,
        overrideBudgetCeilingPercent: undefined,
        overridePrAutoReply: undefined,
        agentPreferences: undefined,
        scanPreferences: undefined,
    };
}

const OVERRIDE_COLUMN_MAP: Record<string, string> = {
    overrideBaseBranch: "override_base_branch",
    overrideRemoteOrigin: "override_remote_origin",
    overrideBranchPrefixMode: "override_branch_prefix_mode",
    overrideBranchPrefixCustom: "override_branch_prefix_custom",
    overrideBudgetCeilingPercent: "override_budget_ceiling_percent",
    overridePrAutoReply: "override_pr_auto_reply",
    agentPreferences: "agent_preferences",
    scanPreferences: "scan_preferences",
};

const BOOLEAN_OVERRIDE_FIELDS = new Set(["overridePrAutoReply"]);

export async function updateProjectOverride(
    repositoryId: string,
    field: keyof Omit<ProjectOverrides, "repositoryId">,
    value: unknown,
): Promise<void> {
    const db = await getDb();
    const column = OVERRIDE_COLUMN_MAP[field];
    if (!column) return;

    await db.execute(
        "INSERT OR IGNORE INTO agent_config (repository_id) VALUES ($1)",
        [repositoryId],
    );

    // SQLite stores booleans as INTEGER (0/1)
    const dbValue =
        BOOLEAN_OVERRIDE_FIELDS.has(field) && typeof value === "boolean"
            ? value
                ? 1
                : 0
            : (value ?? null);

    await db.execute(
        `UPDATE agent_config SET ${column} = $1 WHERE repository_id = $2`,
        [dbValue, repositoryId],
    );
}

export async function clearProjectOverride(
    repositoryId: string,
    field: keyof Omit<ProjectOverrides, "repositoryId">,
): Promise<void> {
    const db = await getDb();
    const column = OVERRIDE_COLUMN_MAP[field];
    if (!column) return;

    await db.execute(
        `UPDATE agent_config SET ${column} = NULL WHERE repository_id = $1`,
        [repositoryId],
    );
}

export async function removeProject(repositoryId: string): Promise<void> {
    const db = await getDb();
    // Delete tasks first (CASCADE should handle it, but be explicit)
    await db.execute("DELETE FROM tasks WHERE repository_id = $1", [
        repositoryId,
    ]);
    await db.execute("DELETE FROM agent_config WHERE repository_id = $1", [
        repositoryId,
    ]);
    await db.execute("DELETE FROM agent_runs WHERE repository_id = $1", [
        repositoryId,
    ]);
    await db.execute("DELETE FROM repositories WHERE id = $1", [repositoryId]);
}
