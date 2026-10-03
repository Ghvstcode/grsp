import Database from "@tauri-apps/plugin-sql";
import { config } from "@core/config";
import type {
    AgentConfig,
    BudgetConfig,
    ScheduleMode,
} from "@core/types/agent";

interface AgentConfigRow {
    repository_id: string;
    enabled: number;
    schedule_mode: string;
    schedule_window_start: string | null;
    schedule_window_end: string | null;
    schedule_timezone: string;
    scan_interval_minutes: number;
    last_scan_at: string | null;
    last_work_at: string | null;
    priority: number;
    scan_enabled: number;
}

interface BudgetConfigRow {
    id: number;
    weekly_token_budget: number;
    max_usage_percent: number;
    reserve_percent: number;
    billing_mode: string;
}

async function getDb() {
    return await Database.load(config.dbUrl);
}

function rowToAgentConfig(row: AgentConfigRow): AgentConfig {
    return {
        repositoryId: row.repository_id,
        enabled: row.enabled === 1,
        scheduleMode: row.schedule_mode as ScheduleMode,
        scheduleWindowStart: row.schedule_window_start ?? undefined,
        scheduleWindowEnd: row.schedule_window_end ?? undefined,
        scheduleTimezone: row.schedule_timezone,
        scanIntervalMinutes: row.scan_interval_minutes,
        lastScanAt: row.last_scan_at ?? undefined,
        lastWorkAt: row.last_work_at ?? undefined,
        priority: row.priority,
        scanEnabled: (row.scan_enabled ?? 1) === 1,
    };
}

export async function getAgentConfig(
    repositoryId: string,
): Promise<AgentConfig> {
    const db = await getDb();
    const rows = await db.select<AgentConfigRow[]>(
        "SELECT * FROM agent_config WHERE repository_id = $1",
        [repositoryId],
    );

    if (rows[0]) {
        return rowToAgentConfig(rows[0]);
    }

    // Create default config if none exists
    await db.execute(
        "INSERT OR IGNORE INTO agent_config (repository_id) VALUES ($1)",
        [repositoryId],
    );

    const newRows = await db.select<AgentConfigRow[]>(
        "SELECT * FROM agent_config WHERE repository_id = $1",
        [repositoryId],
    );
    return rowToAgentConfig(newRows[0]);
}

export async function updateAgentConfig(
    repositoryId: string,
    fields: Partial<
        Pick<
            AgentConfig,
            | "enabled"
            | "scheduleMode"
            | "scheduleWindowStart"
            | "scheduleWindowEnd"
            | "scanIntervalMinutes"
            | "priority"
            | "scanEnabled"
        >
    >,
): Promise<AgentConfig> {
    const db = await getDb();

    // Ensure row exists
    await db.execute(
        "INSERT OR IGNORE INTO agent_config (repository_id) VALUES ($1)",
        [repositoryId],
    );

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (fields.enabled !== undefined) {
        setClauses.push(`enabled = $${paramIndex++}`);
        values.push(fields.enabled ? 1 : 0);
    }
    if (fields.scheduleMode !== undefined) {
        setClauses.push(`schedule_mode = $${paramIndex++}`);
        values.push(fields.scheduleMode);
    }
    if (fields.scheduleWindowStart !== undefined) {
        setClauses.push(`schedule_window_start = $${paramIndex++}`);
        values.push(fields.scheduleWindowStart);
    }
    if (fields.scheduleWindowEnd !== undefined) {
        setClauses.push(`schedule_window_end = $${paramIndex++}`);
        values.push(fields.scheduleWindowEnd);
    }
    if (fields.scanIntervalMinutes !== undefined) {
        setClauses.push(`scan_interval_minutes = $${paramIndex++}`);
        values.push(fields.scanIntervalMinutes);
    }
    if (fields.priority !== undefined) {
        setClauses.push(`priority = $${paramIndex++}`);
        values.push(fields.priority);
    }
    if (fields.scanEnabled !== undefined) {
        setClauses.push(`scan_enabled = $${paramIndex++}`);
        values.push(fields.scanEnabled ? 1 : 0);
    }

    if (setClauses.length > 0) {
        await db.execute(
            `UPDATE agent_config SET ${setClauses.join(", ")} WHERE repository_id = $${paramIndex}`,
            [...values, repositoryId],
        );
    }

    return getAgentConfig(repositoryId);
}

export async function updateLastScanAt(repositoryId: string): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE agent_config SET last_scan_at = CURRENT_TIMESTAMP WHERE repository_id = $1",
        [repositoryId],
    );
}

export async function updateLastWorkAt(repositoryId: string): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE agent_config SET last_work_at = CURRENT_TIMESTAMP WHERE repository_id = $1",
        [repositoryId],
    );
}

export async function getBudgetConfig(): Promise<BudgetConfig> {
    const db = await getDb();
    const rows = await db.select<BudgetConfigRow[]>(
        "SELECT * FROM budget_config WHERE id = 1",
    );

    if (rows[0]) {
        return {
            weeklyTokenBudget: rows[0].weekly_token_budget,
            maxUsagePercent: rows[0].max_usage_percent,
            reservePercent: rows[0].reserve_percent,
            billingMode: rows[0].billing_mode as "subscription" | "api",
        };
    }

    return {
        weeklyTokenBudget: 5_000_000,
        maxUsagePercent: 80,
        reservePercent: 10,
        billingMode: "subscription",
    };
}

export async function updateBudgetConfig(
    fields: Partial<BudgetConfig>,
): Promise<BudgetConfig> {
    const db = await getDb();

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (fields.weeklyTokenBudget !== undefined) {
        setClauses.push(`weekly_token_budget = $${paramIndex++}`);
        values.push(fields.weeklyTokenBudget);
    }
    if (fields.maxUsagePercent !== undefined) {
        setClauses.push(`max_usage_percent = $${paramIndex++}`);
        values.push(fields.maxUsagePercent);
    }
    if (fields.reservePercent !== undefined) {
        setClauses.push(`reserve_percent = $${paramIndex++}`);
        values.push(fields.reservePercent);
    }
    if (fields.billingMode !== undefined) {
        setClauses.push(`billing_mode = $${paramIndex++}`);
        values.push(fields.billingMode);
    }

    if (setClauses.length > 0) {
        await db.execute(
            `UPDATE budget_config SET ${setClauses.join(", ")} WHERE id = 1`,
            values,
        );
    }

    return getBudgetConfig();
}
