import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { config } from "@core/config";
import type {
    Task,
    TaskCategory,
    TaskState,
    TaskSource,
    EstimatedEffort,
    PrState,
    TaskEvent,
    TaskMessage,
    MessageRole,
} from "@core/types/task";

interface TaskRow {
    id: string;
    repository_id: string;
    title: string;
    description: string | null;
    category: string;
    state: string;
    sort_order: number;
    notes: string | null;
    pr_url: string | null;
    lines_added: number | null;
    lines_removed: number | null;
    source: string;
    estimated_effort: string | null;
    files_involved: string | null;
    base_branch: string | null;
    branch_name: string | null;
    worktree_path: string | null;
    commit_sha: string | null;
    session_id: string | null;
    linear_issue_id: string | null;
    linear_identifier: string | null;
    linear_url: string | null;
    pr_state: string | null;
    pr_number: number | null;
    pr_review_cycles: number | null;
    tokens_used: number | null;
    retry_count: number | null;
    last_error: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

interface TaskEventRow {
    id: string;
    task_id: string;
    event_type: string;
    field: string | null;
    old_value: string | null;
    new_value: string | null;
    comment: string | null;
    created_at: string;
}

interface TaskMessageRow {
    id: string;
    task_id: string;
    role: string;
    content: string;
    metadata: string | null;
    created_at: string;
}

async function getDb() {
    return await Database.load(config.dbUrl);
}

function parseFilesInvolved(raw: string | null): string[] | undefined {
    if (!raw) return undefined;
    try {
        return JSON.parse(raw) as string[];
    } catch {
        return undefined;
    }
}

/**
 * Ensure a timestamp string from SQLite is parseable as UTC.
 * SQLite CURRENT_TIMESTAMP returns "YYYY-MM-DD HH:MM:SS" (UTC but no
 * timezone indicator). Without "Z", JS engines may interpret it as local
 * time, breaking Date comparisons against Date.now() epoch ms.
 */
function ensureUtc(ts: string): string {
    if (ts.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(ts)) return ts;
    return ts.replace(" ", "T") + "Z";
}

function rowToTask(row: TaskRow): Task {
    return {
        id: row.id,
        repositoryId: row.repository_id,
        title: row.title,
        description: row.description ?? undefined,
        category: row.category as TaskCategory,
        state: row.state as TaskState,
        sortOrder: row.sort_order,
        notes: row.notes ?? undefined,
        prUrl: row.pr_url ?? undefined,
        linesAdded: row.lines_added ?? undefined,
        linesRemoved: row.lines_removed ?? undefined,
        source: (row.source ?? "manual") as TaskSource,
        estimatedEffort: (row.estimated_effort as EstimatedEffort) ?? undefined,
        filesInvolved: parseFilesInvolved(row.files_involved),
        baseBranch: row.base_branch ?? undefined,
        branchName: row.branch_name ?? undefined,
        worktreePath: row.worktree_path ?? undefined,
        commitSha: row.commit_sha ?? undefined,
        sessionId: row.session_id ?? undefined,
        linearIssueId: row.linear_issue_id ?? undefined,
        linearIdentifier: row.linear_identifier ?? undefined,
        linearUrl: row.linear_url ?? undefined,
        prState: (row.pr_state as PrState) ?? undefined,
        prNumber: row.pr_number ?? undefined,
        prReviewCycles: row.pr_review_cycles ?? 0,
        tokensUsed: row.tokens_used ?? 0,
        retryCount: row.retry_count ?? 0,
        lastError: row.last_error ?? undefined,
        startedAt: row.started_at ?? undefined,
        completedAt: row.completed_at ?? undefined,
        createdAt: ensureUtc(row.created_at),
        updatedAt: ensureUtc(row.updated_at),
    };
}

function rowToTaskEvent(row: TaskEventRow): TaskEvent {
    return {
        id: row.id,
        taskId: row.task_id,
        eventType: row.event_type,
        field: row.field ?? undefined,
        oldValue: row.old_value ?? undefined,
        newValue: row.new_value ?? undefined,
        comment: row.comment ?? undefined,
        createdAt: ensureUtc(row.created_at),
    };
}

async function generateEventId(): Promise<string> {
    return await invoke<string>("generate_task_id");
}

async function recordEvent(
    db: Awaited<ReturnType<typeof getDb>>,
    taskId: string,
    eventType: string,
    field?: string,
    oldValue?: string,
    newValue?: string,
    comment?: string,
): Promise<void> {
    const id = await generateEventId();
    await db.execute(
        "INSERT INTO task_events (id, task_id, event_type, field, old_value, new_value, comment) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
            id,
            taskId,
            eventType,
            field ?? null,
            oldValue ?? null,
            newValue ?? null,
            comment ?? null,
        ],
    );
}

export async function listTasks(
    repositoryId: string,
    baseBranch?: string,
): Promise<Task[]> {
    const db = await getDb();
    if (baseBranch) {
        const rows = await db.select<TaskRow[]>(
            "SELECT * FROM tasks WHERE repository_id = $1 AND (base_branch = $2 OR base_branch IS NULL) ORDER BY sort_order ASC",
            [repositoryId, baseBranch],
        );
        return rows.map(rowToTask);
    }
    const rows = await db.select<TaskRow[]>(
        "SELECT * FROM tasks WHERE repository_id = $1 ORDER BY sort_order ASC",
        [repositoryId],
    );
    return rows.map(rowToTask);
}

export async function getTask(id: string): Promise<Task | undefined> {
    const db = await getDb();
    const rows = await db.select<TaskRow[]>(
        "SELECT * FROM tasks WHERE id = $1",
        [id],
    );
    return rows[0] ? rowToTask(rows[0]) : undefined;
}

export async function createTask(task: {
    repositoryId: string;
    title: string;
    description?: string;
    category: TaskCategory;
    sortOrder: number;
    baseBranch?: string;
    estimatedEffort?: EstimatedEffort;
}): Promise<Task> {
    const db = await getDb();
    const id = await invoke<string>("generate_task_id");

    await db.execute(
        "INSERT INTO tasks (id, repository_id, title, description, category, sort_order, base_branch, estimated_effort) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [
            id,
            task.repositoryId,
            task.title,
            task.description ?? null,
            task.category,
            task.sortOrder,
            task.baseBranch ?? null,
            task.estimatedEffort ?? null,
        ],
    );

    await recordEvent(db, id, "created");

    const rows = await db.select<TaskRow[]>(
        "SELECT * FROM tasks WHERE id = $1",
        [id],
    );

    return rowToTask(rows[0]);
}

// Field-to-event-type mapping for tracked fields
const fieldEventTypes: Record<string, string> = {
    title: "title_change",
    description: "description_change",
    state: "state_change",
    notes: "notes_change",
    prUrl: "pr_url_change",
    category: "category_change",
    prState: "pr_state_change",
};

// Field name to DB column mapping
const fieldToColumn: Record<string, string> = {
    title: "title",
    description: "description",
    state: "state",
    notes: "notes",
    prUrl: "pr_url",
    category: "category",
    prState: "pr_state",
};

export async function updateTask(
    id: string,
    fields: Partial<
        Pick<
            Task,
            | "title"
            | "description"
            | "state"
            | "sortOrder"
            | "notes"
            | "prUrl"
            | "category"
            | "baseBranch"
            | "branchName"
            | "worktreePath"
            | "commitSha"
            | "sessionId"
            | "lastError"
            | "startedAt"
            | "completedAt"
            | "filesInvolved"
            | "prState"
            | "prNumber"
            | "prReviewCycles"
        >
    >,
): Promise<Task> {
    const db = await getDb();

    // Read current values for event recording
    const currentRows = await db.select<TaskRow[]>(
        "SELECT * FROM tasks WHERE id = $1",
        [id],
    );
    const current = currentRows[0];

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (fields.title !== undefined) {
        setClauses.push(`title = $${paramIndex++}`);
        values.push(fields.title);
    }
    if (fields.description !== undefined) {
        setClauses.push(`description = $${paramIndex++}`);
        values.push(fields.description);
    }
    if (fields.state !== undefined) {
        setClauses.push(`state = $${paramIndex++}`);
        values.push(fields.state);
    }
    if (fields.sortOrder !== undefined) {
        setClauses.push(`sort_order = $${paramIndex++}`);
        values.push(fields.sortOrder);
    }
    if (fields.notes !== undefined) {
        setClauses.push(`notes = $${paramIndex++}`);
        values.push(fields.notes);
    }
    if (fields.prUrl !== undefined) {
        setClauses.push(`pr_url = $${paramIndex++}`);
        values.push(fields.prUrl);
    }
    if (fields.category !== undefined) {
        setClauses.push(`category = $${paramIndex++}`);
        values.push(fields.category);
    }
    if (fields.baseBranch !== undefined) {
        setClauses.push(`base_branch = $${paramIndex++}`);
        values.push(fields.baseBranch);
    }
    if (fields.branchName !== undefined) {
        setClauses.push(`branch_name = $${paramIndex++}`);
        values.push(fields.branchName);
    }
    if (fields.worktreePath !== undefined) {
        setClauses.push(`worktree_path = $${paramIndex++}`);
        values.push(fields.worktreePath);
    }
    if (fields.commitSha !== undefined) {
        setClauses.push(`commit_sha = $${paramIndex++}`);
        values.push(fields.commitSha);
    }
    if (fields.sessionId !== undefined) {
        setClauses.push(`session_id = $${paramIndex++}`);
        values.push(fields.sessionId);
    }
    if (fields.lastError !== undefined) {
        setClauses.push(`last_error = $${paramIndex++}`);
        values.push(fields.lastError);
    }
    if (fields.startedAt !== undefined) {
        setClauses.push(`started_at = $${paramIndex++}`);
        values.push(fields.startedAt);
    }
    if (fields.completedAt !== undefined) {
        setClauses.push(`completed_at = $${paramIndex++}`);
        values.push(fields.completedAt);
    }
    if (fields.filesInvolved !== undefined) {
        setClauses.push(`files_involved = $${paramIndex++}`);
        values.push(JSON.stringify(fields.filesInvolved));
    }
    if (fields.prState !== undefined) {
        setClauses.push(`pr_state = $${paramIndex++}`);
        values.push(fields.prState);
    }
    if (fields.prNumber !== undefined) {
        setClauses.push(`pr_number = $${paramIndex++}`);
        values.push(fields.prNumber);
    }
    if (fields.prReviewCycles !== undefined) {
        setClauses.push(`pr_review_cycles = $${paramIndex++}`);
        values.push(fields.prReviewCycles);
    }

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

    await db.execute(
        `UPDATE tasks SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`,
        [...values, id],
    );

    // Record events for tracked field changes
    if (current) {
        for (const [field, eventType] of Object.entries(fieldEventTypes)) {
            const newVal = fields[field as keyof typeof fields];
            if (newVal === undefined) continue;

            const col = fieldToColumn[field];
            const oldVal = current[col as keyof TaskRow];
            const oldStr = oldVal != null ? String(oldVal) : undefined;
            const newStr = String(newVal);

            if (oldStr !== newStr) {
                await recordEvent(db, id, eventType, field, oldStr, newStr);
            }
        }
    }

    const rows = await db.select<TaskRow[]>(
        "SELECT * FROM tasks WHERE id = $1",
        [id],
    );

    return rowToTask(rows[0]);
}

export async function deleteTask(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM tasks WHERE id = $1", [id]);
}

export async function reorderTask(
    id: string,
    newSortOrder: number,
): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE tasks SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [newSortOrder, id],
    );
}

export async function addComment(
    taskId: string,
    comment: string,
): Promise<TaskEvent> {
    const db = await getDb();
    const id = await generateEventId();
    await db.execute(
        "INSERT INTO task_events (id, task_id, event_type, comment) VALUES ($1, $2, $3, $4)",
        [id, taskId, "comment", comment],
    );
    const rows = await db.select<TaskEventRow[]>(
        "SELECT * FROM task_events WHERE id = $1",
        [id],
    );
    return rowToTaskEvent(rows[0]);
}

export async function recordPublicEvent(
    taskId: string,
    opts: {
        eventType: string;
        field?: string;
        oldValue?: string;
        newValue?: string;
        comment?: string;
    },
): Promise<void> {
    const db = await getDb();
    await recordEvent(
        db,
        taskId,
        opts.eventType,
        opts.field,
        opts.oldValue,
        opts.newValue,
        opts.comment,
    );
}

export async function listTaskEvents(taskId: string): Promise<TaskEvent[]> {
    const db = await getDb();
    const rows = await db.select<TaskEventRow[]>(
        "SELECT * FROM task_events WHERE task_id = $1 ORDER BY created_at DESC",
        [taskId],
    );
    return rows.map(rowToTaskEvent);
}

// ── Task Messages (Chat) ────────────────────────────────────

function rowToTaskMessage(row: TaskMessageRow): TaskMessage {
    let metadata: Record<string, unknown> | undefined;
    if (row.metadata) {
        try {
            metadata = JSON.parse(row.metadata) as Record<string, unknown>;
        } catch {
            metadata = undefined;
        }
    }
    return {
        id: row.id,
        taskId: row.task_id,
        role: row.role as MessageRole,
        content: row.content,
        metadata,
        createdAt: ensureUtc(row.created_at),
    };
}

export async function createMessage(
    taskId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>,
): Promise<TaskMessage> {
    const db = await getDb();
    const id = await invoke<string>("generate_task_id");
    await db.execute(
        "INSERT INTO task_messages (id, task_id, role, content, metadata) VALUES ($1, $2, $3, $4, $5)",
        [id, taskId, role, content, metadata ? JSON.stringify(metadata) : null],
    );
    const rows = await db.select<TaskMessageRow[]>(
        "SELECT * FROM task_messages WHERE id = $1",
        [id],
    );
    return rowToTaskMessage(rows[0]);
}

export async function listMessages(taskId: string): Promise<TaskMessage[]> {
    const db = await getDb();
    const rows = await db.select<TaskMessageRow[]>(
        "SELECT * FROM task_messages WHERE task_id = $1 ORDER BY created_at ASC",
        [taskId],
    );
    return rows.map(rowToTaskMessage);
}

/**
 * Get the next pending task for a repository, ordered by sort_order (priority).
 * Returns undefined if no pending tasks exist.
 */
export async function getNextPendingTask(
    repositoryId: string,
): Promise<Task | undefined> {
    const db = await getDb();
    const rows = await db.select<TaskRow[]>(
        "SELECT * FROM tasks WHERE repository_id = $1 AND state = 'pending' ORDER BY sort_order ASC LIMIT 1",
        [repositoryId],
    );
    return rows[0] ? rowToTask(rows[0]) : undefined;
}

// ── Agent Engine Helpers ────────────────────────────────────

/**
 * Insert a single scanned task into the DB.
 * Returns the created Task so the caller can progressively update the UI.
 */
export async function createScannedTask(
    repositoryId: string,
    task: {
        title: string;
        description: string;
        category: string;
        estimatedEffort: string;
        filesInvolved: string[];
    },
    sortOrder: number,
    baseBranch?: string,
): Promise<Task> {
    const db = await getDb();
    const id = await invoke<string>("generate_task_id");

    await db.execute(
        `INSERT INTO tasks (id, repository_id, title, description, category, sort_order, source, estimated_effort, files_involved, base_branch)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
            id,
            repositoryId,
            task.title,
            task.description,
            task.category,
            sortOrder,
            "scan",
            task.estimatedEffort,
            JSON.stringify(task.filesInvolved),
            baseBranch ?? null,
        ],
    );

    await recordEvent(
        db,
        id,
        "created",
        undefined,
        undefined,
        undefined,
        "Discovered by agent scan",
    );

    const rows = await db.select<TaskRow[]>(
        "SELECT * FROM tasks WHERE id = $1",
        [id],
    );

    return rowToTask(rows[0]);
}

/**
 * Create a task from an imported PR.
 * The task starts in "review" state with PR fields pre-populated.
 */
export async function createImportedTask(
    repositoryId: string,
    task: {
        title: string;
        description: string | undefined;
        baseBranch: string;
        branchName: string;
        prUrl: string;
        prNumber: number;
    },
    sortOrder: number,
): Promise<Task> {
    const db = await getDb();
    const id = await invoke<string>("generate_task_id");

    await db.execute(
        `INSERT INTO tasks (id, repository_id, title, description, category, sort_order, source, state, base_branch, branch_name, pr_url, pr_number, pr_state)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
            id,
            repositoryId,
            task.title,
            task.description ?? null,
            "general",
            sortOrder,
            "imported",
            "review",
            task.baseBranch,
            task.branchName,
            task.prUrl,
            task.prNumber,
            "in_review",
        ],
    );

    await recordEvent(
        db,
        id,
        "created",
        undefined,
        undefined,
        undefined,
        "Imported from PR",
    );

    const rows = await db.select<TaskRow[]>(
        "SELECT * FROM tasks WHERE id = $1",
        [id],
    );

    return rowToTask(rows[0]);
}

/**
 * Insert a single Linear-sourced task into the DB.
 */
export async function createLinearTask(
    repositoryId: string,
    task: {
        title: string;
        description: string | undefined;
        category: string;
        estimatedEffort: string;
        filesInvolved?: string[];
        linearIssueId: string;
        linearIdentifier: string;
        linearUrl: string;
    },
    sortOrder: number,
    baseBranch?: string,
): Promise<Task> {
    const db = await getDb();
    const id = await invoke<string>("generate_task_id");

    await db.execute(
        `INSERT INTO tasks (id, repository_id, title, description, category, sort_order, source, estimated_effort, files_involved, base_branch, linear_issue_id, linear_identifier, linear_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
            id,
            repositoryId,
            task.title,
            task.description ?? null,
            task.category,
            sortOrder,
            "linear",
            task.estimatedEffort,
            task.filesInvolved ? JSON.stringify(task.filesInvolved) : null,
            baseBranch ?? null,
            task.linearIssueId,
            task.linearIdentifier,
            task.linearUrl,
        ],
    );

    await recordEvent(
        db,
        id,
        "created",
        undefined,
        undefined,
        undefined,
        `Imported from Linear: ${task.linearIdentifier}`,
    );

    const rows = await db.select<TaskRow[]>(
        "SELECT * FROM tasks WHERE id = $1",
        [id],
    );

    return rowToTask(rows[0]);
}

/**
 * Get the set of Linear issue IDs already imported for a repository (for dedup).
 */
export async function getLinearIssueIds(
    repositoryId: string,
): Promise<Set<string>> {
    const db = await getDb();
    const rows = await db.select<{ linear_issue_id: string }[]>(
        "SELECT linear_issue_id FROM tasks WHERE repository_id = $1 AND linear_issue_id IS NOT NULL AND state IN ('pending', 'in_progress', 'review', 'failed')",
        [repositoryId],
    );
    return new Set(rows.map((r) => r.linear_issue_id));
}

/**
 * Fix Linear tasks that have a mismatched base_branch.
 * Updates them to the correct branch so they appear in the task list.
 */
export async function fixOrphanedLinearTasks(
    repositoryId: string,
    correctBaseBranch?: string,
): Promise<void> {
    if (!correctBaseBranch) return;
    const db = await getDb();
    await db.execute(
        `UPDATE tasks SET base_branch = $1, updated_at = CURRENT_TIMESTAMP
         WHERE repository_id = $2 AND source = 'linear'
         AND base_branch IS NOT NULL AND base_branch != $1`,
        [correctBaseBranch, repositoryId],
    );
}

/**
 * Get the set of existing non-terminal task titles for dedup,
 * plus the current min/max sort_order.
 */
export async function getDeduplicationContext(repositoryId: string): Promise<{
    existingTitles: Set<string>;
    maxSortOrder: number;
    minSortOrder: number;
}> {
    const db = await getDb();

    const existing = await db.select<TaskRow[]>(
        "SELECT title, sort_order FROM tasks WHERE repository_id = $1 AND state IN ('pending', 'in_progress', 'review', 'failed')",
        [repositoryId],
    );

    const existingTitles = new Set(
        existing.map((t) => t.title.toLowerCase().trim()),
    );

    const orderRows = await db.select<
        { max_order: number | null; min_order: number | null }[]
    >(
        "SELECT MAX(sort_order) as max_order, MIN(sort_order) as min_order FROM tasks WHERE repository_id = $1",
        [repositoryId],
    );

    return {
        existingTitles,
        maxSortOrder: orderRows[0]?.max_order ?? 0,
        minSortOrder: orderRows[0]?.min_order ?? 0,
    };
}

/**
 * Reset stale in_progress tasks on app startup.
 * If a task is in_progress but no engine process is running, it was orphaned
 * when the app was closed mid-execution. Reset to 'failed' with an explanation.
 */
export async function recoverStaleTasks(): Promise<number> {
    const db = await getDb();

    const stale = await db.select<TaskRow[]>(
        "SELECT * FROM tasks WHERE state = 'in_progress'",
    );

    for (const row of stale) {
        await db.execute(
            "UPDATE tasks SET state = 'failed', last_error = 'App was closed while task was in progress', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            [row.id],
        );
        await recordEvent(
            db,
            row.id,
            "state_change",
            "state",
            "in_progress",
            "failed",
            "Recovered on startup — app was closed during execution",
        );
    }

    return stale.length;
}
