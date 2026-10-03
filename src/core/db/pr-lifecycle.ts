/**
 * Database module for PR lifecycle management.
 * Handles pr_reviews and pr_comments tables.
 */

import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { config } from "@core/config";
import type { PrReview, PrComment, PrCommentKind } from "@core/types/task";

async function getDb() {
    return await Database.load(config.dbUrl);
}

function ensureUtc(ts: string): string {
    if (ts.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(ts)) return ts;
    return ts.replace(" ", "T") + "Z";
}

// ── PR Reviews ──────────────────────────────────────────────

interface PrReviewRow {
    id: string;
    task_id: string;
    github_review_id: number;
    reviewer: string;
    state: string;
    body: string | null;
    submitted_at: string;
    created_at: string;
}

function rowToReview(row: PrReviewRow): PrReview {
    return {
        id: row.id,
        taskId: row.task_id,
        githubReviewId: row.github_review_id,
        reviewer: row.reviewer,
        state: row.state as PrReview["state"],
        body: row.body ?? undefined,
        submittedAt: ensureUtc(row.submitted_at),
        createdAt: ensureUtc(row.created_at),
    };
}

export async function upsertReview(
    taskId: string,
    review: {
        githubReviewId: number;
        reviewer: string;
        state: string;
        body?: string;
        submittedAt: string;
    },
): Promise<PrReview> {
    const db = await getDb();

    // Check if already exists
    const existing = await db.select<PrReviewRow[]>(
        "SELECT * FROM pr_reviews WHERE github_review_id = $1",
        [review.githubReviewId],
    );

    if (existing.length > 0) {
        return rowToReview(existing[0]);
    }

    const id = await invoke<string>("generate_task_id");
    await db.execute(
        `INSERT INTO pr_reviews (id, task_id, github_review_id, reviewer, state, body, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            id,
            taskId,
            review.githubReviewId,
            review.reviewer,
            review.state.toLowerCase(),
            review.body ?? null,
            review.submittedAt,
        ],
    );

    const rows = await db.select<PrReviewRow[]>(
        "SELECT * FROM pr_reviews WHERE id = $1",
        [id],
    );
    return rowToReview(rows[0]);
}

export async function listReviews(taskId: string): Promise<PrReview[]> {
    const db = await getDb();
    const rows = await db.select<PrReviewRow[]>(
        "SELECT * FROM pr_reviews WHERE task_id = $1 ORDER BY submitted_at ASC",
        [taskId],
    );
    return rows.map(rowToReview);
}

/** Get the latest review that requested changes */
export async function getLatestChangesRequested(
    taskId: string,
): Promise<PrReview | undefined> {
    const db = await getDb();
    const rows = await db.select<PrReviewRow[]>(
        "SELECT * FROM pr_reviews WHERE task_id = $1 AND state = 'changes_requested' ORDER BY submitted_at DESC LIMIT 1",
        [taskId],
    );
    return rows[0] ? rowToReview(rows[0]) : undefined;
}

// ── PR Comments ─────────────────────────────────────────────

interface PrCommentRow {
    id: string;
    task_id: string;
    github_comment_id: number;
    kind: string;
    in_reply_to_id: number | null;
    reviewer: string;
    body: string;
    path: string | null;
    line: number | null;
    side: string | null;
    commit_id: string | null;
    classification: string | null;
    our_reply: string | null;
    addressed_in_commit: string | null;
    created_at: string;
    updated_at: string;
}

function rowToComment(row: PrCommentRow): PrComment {
    return {
        id: row.id,
        taskId: row.task_id,
        githubCommentId: row.github_comment_id,
        kind: (row.kind as PrCommentKind) ?? "inline",
        inReplyToId: row.in_reply_to_id ?? undefined,
        reviewer: row.reviewer,
        body: row.body,
        path: row.path ?? undefined,
        line: row.line ?? undefined,
        side: (row.side as PrComment["side"]) ?? undefined,
        commitId: row.commit_id ?? undefined,
        classification:
            (row.classification as PrComment["classification"]) ?? undefined,
        ourReply: row.our_reply ?? undefined,
        addressedInCommit: row.addressed_in_commit ?? undefined,
        createdAt: ensureUtc(row.created_at),
        updatedAt: ensureUtc(row.updated_at),
    };
}

export async function upsertComment(
    taskId: string,
    comment: {
        githubCommentId: number;
        kind: PrCommentKind;
        inReplyToId?: number;
        reviewer: string;
        body: string;
        path?: string;
        line?: number;
        side?: string;
        commitId?: string;
        /**
         * When the source comment predates the non-inline-comment rollout,
         * the service passes a commit-sha-like sentinel so the row is
         * inserted as already-addressed and never re-sent to Claude.
         */
        preAddressedSentinel?: string;
    },
): Promise<PrComment> {
    const db = await getDb();

    // Check if already exists — match on (kind, github_comment_id) because
    // review / pull-comment / issue-comment IDs share an integer space but
    // come from different server-side tables and can collide.
    const existing = await db.select<PrCommentRow[]>(
        "SELECT * FROM pr_comments WHERE kind = $1 AND github_comment_id = $2",
        [comment.kind, comment.githubCommentId],
    );

    if (existing.length > 0) {
        if (existing[0].body !== comment.body) {
            await db.execute(
                "UPDATE pr_comments SET body = $1, updated_at = CURRENT_TIMESTAMP WHERE kind = $2 AND github_comment_id = $3",
                [comment.body, comment.kind, comment.githubCommentId],
            );
        }
        const rows = await db.select<PrCommentRow[]>(
            "SELECT * FROM pr_comments WHERE kind = $1 AND github_comment_id = $2",
            [comment.kind, comment.githubCommentId],
        );
        return rowToComment(rows[0]);
    }

    const id = await invoke<string>("generate_task_id");
    await db.execute(
        `INSERT INTO pr_comments (id, task_id, github_comment_id, kind, in_reply_to_id, reviewer, body, path, line, side, commit_id, addressed_in_commit, classification)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
            id,
            taskId,
            comment.githubCommentId,
            comment.kind,
            comment.inReplyToId ?? null,
            comment.reviewer,
            comment.body,
            comment.path ?? null,
            comment.line ?? null,
            comment.side ?? null,
            comment.commitId ?? null,
            comment.preAddressedSentinel ?? null,
            comment.preAddressedSentinel ? "resolved" : null,
        ],
    );

    const rows = await db.select<PrCommentRow[]>(
        "SELECT * FROM pr_comments WHERE id = $1",
        [id],
    );
    return rowToComment(rows[0]);
}

export async function listComments(taskId: string): Promise<PrComment[]> {
    const db = await getDb();
    const rows = await db.select<PrCommentRow[]>(
        "SELECT * FROM pr_comments WHERE task_id = $1 ORDER BY created_at ASC",
        [taskId],
    );
    return rows.map(rowToComment);
}

/** Get unaddressed actionable comments */
export async function getUnaddressedComments(
    taskId: string,
): Promise<PrComment[]> {
    const db = await getDb();
    const rows = await db.select<PrCommentRow[]>(
        `SELECT * FROM pr_comments
         WHERE task_id = $1 AND classification = 'actionable' AND addressed_in_commit IS NULL
         ORDER BY created_at ASC`,
        [taskId],
    );
    return rows.map(rowToComment);
}

export async function updateCommentClassification(
    githubCommentId: number,
    classification: "actionable" | "conversational" | "resolved",
): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE pr_comments SET classification = $1, updated_at = CURRENT_TIMESTAMP WHERE github_comment_id = $2",
        [classification, githubCommentId],
    );
}

export async function markCommentAddressed(
    kind: PrCommentKind,
    githubCommentId: number,
    commitSha: string,
): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE pr_comments SET addressed_in_commit = $1, classification = 'resolved', updated_at = CURRENT_TIMESTAMP WHERE kind = $2 AND github_comment_id = $3",
        [commitSha, kind, githubCommentId],
    );
}

export async function setCommentReply(
    kind: PrCommentKind,
    githubCommentId: number,
    reply: string,
): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE pr_comments SET our_reply = $1, updated_at = CURRENT_TIMESTAMP WHERE kind = $2 AND github_comment_id = $3",
        [reply, kind, githubCommentId],
    );
}

/**
 * Read the rollout cutoff timestamp stamped at migration 22 install time.
 * Comments/reviews with source timestamp <= cutoff are treated as
 * pre-existing history and not fed back to Claude.
 */
export async function getPrCommentsRolloutCutoff(): Promise<
    string | undefined
> {
    const db = await getDb();
    const rows = await db.select<{ value: string }[]>(
        "SELECT value FROM global_settings WHERE key = 'pr_comments_rollout_cutoff'",
    );
    return rows[0]?.value;
}

/** Get all tasks that have an active PR lifecycle (for polling) */
export async function getTasksWithActivePr(): Promise<
    {
        id: string;
        repositoryId: string;
        prUrl: string;
        prNumber: number;
        prState: string;
        prReviewCycles: number;
    }[]
> {
    const db = await getDb();
    const rows = await db.select<
        {
            id: string;
            repository_id: string;
            pr_url: string;
            pr_number: number;
            pr_state: string;
            pr_review_cycles: number;
        }[]
    >(
        `SELECT id, repository_id, pr_url, pr_number, pr_state, pr_review_cycles
         FROM tasks
         WHERE pr_state IS NOT NULL
           AND pr_state NOT IN ('merged', 'needs_human_attention')
           AND pr_url IS NOT NULL
           AND pr_number IS NOT NULL`,
    );
    return rows.map((r) => ({
        id: r.id,
        repositoryId: r.repository_id,
        prUrl: r.pr_url,
        prNumber: r.pr_number,
        prState: r.pr_state,
        prReviewCycles: r.pr_review_cycles,
    }));
}
