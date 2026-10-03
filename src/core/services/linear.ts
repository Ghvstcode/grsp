import type {
    LinearTeam,
    LinearProject,
    LinearIssue,
} from "@core/types/linear";

const LINEAR_API_URL = "https://api.linear.app/graphql";

async function linearQuery<T>(
    apiKey: string,
    query: string,
    variables?: Record<string, unknown>,
): Promise<T> {
    const response = await fetch(LINEAR_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: apiKey,
        },
        body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Linear API error (${response.status}): ${text}`);
    }

    const json = (await response.json()) as {
        data?: T;
        errors?: { message: string }[];
    };

    if (json.errors?.length) {
        throw new Error(
            `Linear GraphQL error: ${json.errors.map((e) => e.message).join(", ")}`,
        );
    }

    if (!json.data) {
        throw new Error("Linear API returned no data");
    }

    return json.data;
}

/**
 * Test the API key by fetching the authenticated user's name.
 */
export async function testConnection(
    apiKey: string,
): Promise<{ success: boolean; userName?: string; error?: string }> {
    try {
        const data = await linearQuery<{ viewer: { name: string } }>(
            apiKey,
            `query { viewer { name } }`,
        );
        return { success: true, userName: data.viewer.name };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
        };
    }
}

/**
 * Fetch all teams accessible to the authenticated user.
 */
export async function fetchTeams(apiKey: string): Promise<LinearTeam[]> {
    const data = await linearQuery<{
        teams: { nodes: { id: string; name: string; key: string }[] };
    }>(apiKey, `query { teams { nodes { id name key } } }`);

    return data.teams.nodes;
}

/**
 * Fetch projects within a team.
 */
export async function fetchProjects(
    apiKey: string,
    teamId: string,
): Promise<LinearProject[]> {
    const data = await linearQuery<{
        team: { projects: { nodes: { id: string; name: string }[] } };
    }>(
        apiKey,
        `query ($teamId: String!) {
            team(id: $teamId) {
                projects { nodes { id name } }
            }
        }`,
        { teamId },
    );

    return data.team.projects.nodes;
}

/**
 * Fetch active issues from a team, optionally filtered by project and labels.
 * Returns paginated results.
 */
export async function fetchIssues(
    apiKey: string,
    teamId: string,
    options?: {
        projectId?: string;
        labelNames?: string[];
        cursor?: string;
        limit?: number;
    },
): Promise<{
    issues: LinearIssue[];
    hasMore: boolean;
    endCursor: string | undefined;
}> {
    const limit = options?.limit ?? 50;

    const filterParts: string[] = [
        `team: { id: { eq: "${teamId}" } }`,
        `state: { type: { nin: ["canceled", "completed"] } }`,
    ];

    if (options?.projectId) {
        filterParts.push(`project: { id: { eq: "${options.projectId}" } }`);
    }

    if (options?.labelNames?.length) {
        const labelsStr = options.labelNames.map((l) => `"${l}"`).join(", ");
        filterParts.push(`labels: { name: { in: [${labelsStr}] } }`);
    }

    const filterStr = filterParts.join(", ");
    const afterClause = options?.cursor ? `, after: "${options.cursor}"` : "";

    const data = await linearQuery<{
        issues: {
            nodes: {
                id: string;
                identifier: string;
                title: string;
                description: string | null;
                url: string;
                priority: number;
                state: { name: string; type: string };
                labels: { nodes: { name: string }[] };
                assignee: { name: string } | null;
            }[];
            pageInfo: {
                hasNextPage: boolean;
                endCursor: string | null;
            };
        };
    }>(
        apiKey,
        `query {
            issues(
                filter: { ${filterStr} }
                first: ${limit}
                ${afterClause}
                orderBy: updatedAt
            ) {
                nodes {
                    id
                    identifier
                    title
                    description
                    url
                    priority
                    state { name type }
                    labels { nodes { name } }
                    assignee { name }
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }`,
    );

    const issues: LinearIssue[] = data.issues.nodes.map((node) => ({
        id: node.id,
        identifier: node.identifier,
        title: node.title,
        description: node.description ?? undefined,
        url: node.url,
        priority: node.priority,
        state: node.state,
        labels: node.labels.nodes,
        assignee: node.assignee ?? undefined,
    }));

    return {
        issues,
        hasMore: data.issues.pageInfo.hasNextPage,
        endCursor: data.issues.pageInfo.endCursor ?? undefined,
    };
}

/**
 * Post a comment on a Linear issue (e.g., to link a PR).
 */
export async function addComment(
    apiKey: string,
    issueId: string,
    body: string,
): Promise<void> {
    await linearQuery(
        apiKey,
        `mutation ($issueId: String!, $body: String!) {
            commentCreate(input: { issueId: $issueId, body: $body }) {
                success
            }
        }`,
        { issueId, body },
    );
}
