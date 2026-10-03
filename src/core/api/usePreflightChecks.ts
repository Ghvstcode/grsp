import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

interface CheckResult {
    installed: boolean;
    version: string | null;
}

interface AuthCheckResult {
    authenticated: boolean;
}

export interface PreflightResults {
    git: CheckResult;
    claude: CheckResult;
    claudeAuth: AuthCheckResult;
    gh: CheckResult;
    allRequiredPassed: boolean;
}

async function runAllChecks(): Promise<PreflightResults> {
    const [git, claude, claudeAuth, gh] = await Promise.all([
        invoke<CheckResult>("check_git_installed"),
        invoke<CheckResult>("check_claude_installed"),
        invoke<AuthCheckResult>("check_claude_authenticated"),
        invoke<CheckResult>("check_gh_installed"),
    ]);

    return {
        git,
        claude,
        claudeAuth,
        gh,
        allRequiredPassed:
            git.installed && claude.installed && claudeAuth.authenticated,
    };
}

export function usePreflightChecks(enabled = true) {
    return useQuery({
        queryKey: ["preflight-checks"],
        queryFn: runAllChecks,
        enabled,
        staleTime: 0,
    });
}
