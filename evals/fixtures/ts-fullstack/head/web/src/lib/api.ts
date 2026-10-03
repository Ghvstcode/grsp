const BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
    constructor(
        public status: number,
        public code: string,
    ) {
        super(code);
    }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new ApiError(response.status, payload.error ?? "unknown_error");
    }
    return response.json();
}

export interface Member {
    userId: string;
    role: string;
}

export function listMembers(teamId: string) {
    return request<Member[]>("GET", `/api/teams/${teamId}/members`);
}

export function inviteMember(teamId: string, email: string) {
    return request<{ id: string; email: string }>("POST", `/api/teams/${teamId}/invites`, { email });
}
