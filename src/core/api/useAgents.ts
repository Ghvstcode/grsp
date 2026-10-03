import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { call } from "@core/services/client";
import type { AgentKind, AgentStatus } from "@core/types/grsp";

export const AGENT_LABELS: Record<AgentKind, string> = {
    claude: "Claude Code",
    codex: "Codex",
};

export const AGENT_INSTALL: Record<
    AgentKind,
    { command: string; signIn: string; url: string }
> = {
    claude: {
        command: "npm install -g @anthropic-ai/claude-code",
        signIn: "Run `claude` in a terminal and sign in.",
        url: "https://docs.anthropic.com/en/docs/claude-code/overview",
    },
    codex: {
        command: "npm install -g @openai/codex",
        signIn: "Run `codex login` in a terminal.",
        url: "https://developers.openai.com/codex/cli",
    },
};

/** Detects Claude Code and Codex on PATH and known install paths. */
export function useAgentStatuses() {
    return useQuery({
        queryKey: ["agents"],
        queryFn: () => call("agent_detect", {}),
        staleTime: 0,
    });
}

/** Runs the sign-in ping for one agent and merges the result into the list. */
export function useRecheckAgent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (kind: AgentKind) => call("agent_recheck", { kind }),
        onSuccess: (status) => {
            queryClient.setQueryData<AgentStatus[]>(["agents"], (list) => {
                if (!list) return [status];
                return list.some((a) => a.kind === status.kind)
                    ? list.map((a) => (a.kind === status.kind ? status : a))
                    : [...list, status];
            });
        },
    });
}

export function useGithubStatus() {
    return useQuery({
        queryKey: ["github-status"],
        queryFn: () => call("github_status", {}),
        staleTime: 0,
    });
}
