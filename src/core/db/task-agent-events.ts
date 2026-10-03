/**
 * Persisted agent streaming events.
 *
 * Stores the output emitted from Claude CLI during task execution so users
 * can view it after streaming ends or on app reload.
 */

import Database from "@tauri-apps/plugin-sql";
import { config } from "@core/config";
import type { TaskOutputEvent, ContentBlock } from "@core/types/agent";

async function getDb() {
    return await Database.load(config.dbUrl);
}

interface EventRow {
    id: number;
    task_id: string;
    event_type: string | null;
    blocks_json: string;
    timestamp: string;
}

function rowToEvent(row: EventRow): TaskOutputEvent {
    let blocks: ContentBlock[] = [];
    try {
        blocks = JSON.parse(row.blocks_json) as ContentBlock[];
    } catch {
        blocks = [];
    }
    return {
        taskId: row.task_id,
        eventType: row.event_type ?? undefined,
        blocks,
        raw: "",
        timestamp: row.timestamp,
    };
}

export async function saveAgentEvent(event: TaskOutputEvent): Promise<void> {
    const db = await getDb();
    await db.execute(
        `INSERT INTO task_agent_events (task_id, event_type, blocks_json, timestamp)
         VALUES ($1, $2, $3, $4)`,
        [
            event.taskId,
            event.eventType ?? null,
            JSON.stringify(event.blocks),
            event.timestamp,
        ],
    );
}

export async function listAgentEvents(
    taskId: string,
): Promise<TaskOutputEvent[]> {
    const db = await getDb();
    const rows = await db.select<EventRow[]>(
        `SELECT id, task_id, event_type, blocks_json, timestamp
         FROM task_agent_events
         WHERE task_id = $1
         ORDER BY id ASC`,
        [taskId],
    );
    return rows.map(rowToEvent);
}

export async function clearAgentEvents(taskId: string): Promise<void> {
    const db = await getDb();
    await db.execute(`DELETE FROM task_agent_events WHERE task_id = $1`, [
        taskId,
    ]);
}
