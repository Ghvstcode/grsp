/**
 * GitHub API helpers for PR lifecycle management.
 * Uses the `gh` CLI via Tauri's invoke to interact with GitHub,
 * which inherits the user's auth — no separate token needed.
 */

import { invoke } from "@tauri-apps/api/core";

// ── Types ───────────────────────────────────────────────────

export interface GhPrReview {
    id: number;
    user: { login: string };
    state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";
    body: string;
    submitted_at: string;
}

export interface GhPrComment {
    id: number;
    user: { login: string };
    body: string;
    path: string | null;
    line: number | null;
    side: "LEFT" | "RIGHT" | null;
    original_line: number | null;
    commit_id: string | null;
    in_reply_to_id: number | null;
    created_at: string;
    updated_at: string;
}

/** Issue-level comment on a PR (general discussion, not tied to a line). */
export interface GhIssueComment {
    id: number;
    user: { login: string };
    body: string;
    created_at: string;
    updated_at: string;
}

export interface GhPrStatus {
    state: "open" | "closed" | "merged";
    merged: boolean;
    mergeable: string | null;
    reviewDecision: string | null;
}

// ── Helpers ─────────────────────────────────────────────────

/** Parse owner/repo from a GitHub PR URL */
export function parseOwnerRepo(
    prUrl: string,
): { owner: string; repo: string; number: number } | undefined {
    const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) return undefined;
    return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
}

/** Run a gh api command and return parsed JSON */
async function ghApi<T>(repoPath: string, endpoint: string): Promise<T> {
    const result = await invoke<{
        success: boolean;
        stdout: string;
        stderr: string;
    }>("run_gh_api", { repoPath, endpoint });
    if (!result.success) {
        throw new Error(`gh api failed: ${result.stderr}`);
    }
    return JSON.parse(result.stdout) as T;
}

/** Run a gh api command with POST body */
async function ghApiPost<T>(
    repoPath: string,
    endpoint: string,
    body: Record<string, unknown>,
): Promise<T> {
    const result = await invoke<{
        success: boolean;
        stdout: string;
        stderr: string;
    }>("run_gh_api_post", { repoPath, endpoint, body: JSON.stringify(body) });
    if (!result.success) {
        throw new Error(`gh api POST failed: ${result.stderr}`);
    }
    return JSON.parse(result.stdout) as T;
}

// ── PR Metadata ────────────────────────────────────────────

export interface GhPrMetadata {
    title: string;
    body: string;
    headBranch: string;
    baseBranch: string;
    user: { login: string };
    state: "open" | "closed";
    merged: boolean;
}

export async function getPrMetadata(
    repoPath: string,
    owner: string,
    repo: string,
    prNumber: number,
): Promise<GhPrMetadata> {
    const raw = await ghApi<Record<string, unknown>>(
        repoPath,
        `repos/${owner}/${repo}/pulls/${prNumber}`,
    );
    return {
        title: raw.title as string,
        body: (raw.body as string) ?? "",
        headBranch: (raw.head as { ref: string }).ref,
        baseBranch: (raw.base as { ref: string }).ref,
        user: { login: (raw.user as { login: string }).login },
        state: raw.state as "open" | "closed",
        merged: raw.merged as boolean,
    };
}

// ── PR Status ───────────────────────────────────────────────

export async function getPrStatus(
    repoPath: string,
    owner: string,
    repo: string,
    prNumber: number,
): Promise<GhPrStatus> {
    return ghApi<GhPrStatus>(
        repoPath,
        `repos/${owner}/${repo}/pulls/${prNumber}`,
    );
}

// ── Reviews ─────────────────────────────────────────────────

export async function listPrReviews(
    repoPath: string,
    owner: string,
    repo: string,
    prNumber: number,
): Promise<GhPrReview[]> {
    return ghApi<GhPrReview[]>(
        repoPath,
        `repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
    );
}

// ── Review Comments ─────────────────────────────────────────

export async function listPrComments(
    repoPath: string,
    owner: string,
    repo: string,
    prNumber: number,
): Promise<GhPrComment[]> {
    return ghApi<GhPrComment[]>(
        repoPath,
        `repos/${owner}/${repo}/pulls/${prNumber}/comments`,
    );
}

// ── Post Reply ──────────────────────────────────────────────

export async function replyToComment(
    repoPath: string,
    owner: string,
    repo: string,
    prNumber: number,
    commentId: number,
    body: string,
): Promise<GhPrComment> {
    return ghApiPost<GhPrComment>(
        repoPath,
        `repos/${owner}/${repo}/pulls/${prNumber}/comments/${commentId}/replies`,
        { body },
    );
}

/** Post a top-level issue comment on the PR */
export async function postPrComment(
    repoPath: string,
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
): Promise<{ id: number }> {
    return ghApiPost<{ id: number }>(
        repoPath,
        `repos/${owner}/${repo}/issues/${prNumber}/comments`,
        { body },
    );
}

// ── Issue-level Comments ────────────────────────────────────

/**
 * List issue-level comments on a PR (general conversation, not tied to a
 * diff line). These come from the issues endpoint because PRs are issues
 * on the GitHub data model.
 */
export async function listIssueComments(
    repoPath: string,
    owner: string,
    repo: string,
    prNumber: number,
): Promise<GhIssueComment[]> {
    return ghApi<GhIssueComment[]>(
        repoPath,
        `repos/${owner}/${repo}/issues/${prNumber}/comments`,
    );
}

/**
 * Marker appended to every bot-authored issue comment so we can identify
 * and skip them on the next fetch, without having to resolve the gh
 * user's login. More robust than login matching if auth is swapped.
 */
export const SUSTN_MARKER_PREFIX = "<!-- sustn:task=";

export function sustnMarker(taskId: string): string {
    return `${SUSTN_MARKER_PREFIX}${taskId} -->`;
}

export function bodyHasSustnMarker(body: string): boolean {
    return body.includes(SUSTN_MARKER_PREFIX);
}

/**
 * Post an issue comment on a PR with a trailing marker identifying it as
 * authored by SUSTN for a given task. The marker is invisible in GitHub's
 * rendered markdown but lets us dedup on fetch.
 */
export async function postPrCommentWithMarker(
    repoPath: string,
    owner: string,
    repo: string,
    prNumber: number,
    taskId: string,
    body: string,
): Promise<{ id: number }> {
    const stamped = `${body}\n\n${sustnMarker(taskId)}`;
    return postPrComment(repoPath, owner, repo, prNumber, stamped);
}

// ── Re-request Review ───────────────────────────────────────

export async function requestReview(
    repoPath: string,
    owner: string,
    repo: string,
    prNumber: number,
    reviewers: string[],
): Promise<void> {
    await ghApiPost(
        repoPath,
        `repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`,
        { reviewers },
    );
}

// ── Get diff of the PR ──────────────────────────────────────

export async function getPrDiff(
    repoPath: string,
    owner: string,
    repo: string,
    prNumber: number,
): Promise<string> {
    const result = await invoke<{
        success: boolean;
        stdout: string;
        stderr: string;
    }>("run_gh_api", {
        repoPath,
        endpoint: `repos/${owner}/${repo}/pulls/${prNumber}`,
        accept: "application/vnd.github.v3.diff",
    });
    if (!result.success) {
        throw new Error(`Failed to get PR diff: ${result.stderr}`);
    }
    return result.stdout;
}

// ── Resolved Threads ──────────────────────────────────────

/**
 * Fetch the set of root comment IDs whose review thread has been
 * marked as "Resolved" on GitHub.
 *
 * Uses the GraphQL API because the REST API does not expose
 * thread resolution status.
 */
export async function getResolvedThreadCommentIds(
    repoPath: string,
    owner: string,
    repo: string,
    prNumber: number,
): Promise<Set<number>> {
    const query = `
        query($owner: String!, $repo: String!, $number: Int!) {
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $number) {
                    reviewThreads(first: 100) {
                        nodes {
                            isResolved
                            comments(first: 1) {
                                nodes { databaseId }
                            }
                        }
                    }
                }
            }
        }
    `;

    try {
        const result = await ghApiPost<{
            data?: {
                repository?: {
                    pullRequest?: {
                        reviewThreads?: {
                            nodes?: Array<{
                                isResolved: boolean;
                                comments: {
                                    nodes: Array<{ databaseId: number }>;
                                };
                            }>;
                        };
                    };
                };
            };
        }>(repoPath, "graphql", {
            query,
            variables: { owner, repo, number: prNumber },
        });

        const threads =
            result.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
        const resolvedIds = new Set<number>();
        for (const thread of threads) {
            if (thread.isResolved) {
                const rootComment = thread.comments.nodes[0];
                if (rootComment) {
                    resolvedIds.add(rootComment.databaseId);
                }
            }
        }
        return resolvedIds;
    } catch (e) {
        console.warn(`[github] failed to fetch resolved threads:`, e);
        return new Set();
    }
}
