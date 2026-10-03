import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
    listRepositories,
    addRepository as dbAddRepository,
    updateLastPulledAt,
    updateDefaultBranch,
} from "@core/db/repositories";
import { metrics } from "@core/services/metrics";

interface ValidateResult {
    valid: boolean;
    error: string | null;
}

interface CloneResult {
    success: boolean;
    path: string | null;
    error: string | null;
}

export function useRepositories() {
    return useQuery({
        queryKey: ["repositories"],
        queryFn: listRepositories,
    });
}

export function useAddRepository() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ path, name }: { path: string; name: string }) => {
            // Validate it's a git repo first
            const result = await invoke<ValidateResult>("validate_git_repo", {
                path,
            });
            if (!result.valid) {
                throw new Error(result.error ?? "Not a valid git repository");
            }

            const repo = await dbAddRepository(path, name);

            return repo;
        },
        onSuccess: (_data, variables) => {
            metrics.track("project_added", { repositoryName: variables.name });
            void queryClient.invalidateQueries({ queryKey: ["repositories"] });
        },
    });
}

export function useCloneRepository() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            url,
            destination,
        }: {
            url: string;
            destination: string;
        }) => {
            const result = await invoke<CloneResult>("clone_repository", {
                url,
                destination,
            });

            if (!result.success || !result.path) {
                throw new Error(result.error ?? "Clone failed");
            }

            // Extract repo name from the path
            const name = result.path.split("/").pop() ?? "unknown";
            return await dbAddRepository(result.path, name);
        },
        onSuccess: (repo) => {
            metrics.track("project_added", { repositoryName: repo.name });
            void queryClient.invalidateQueries({ queryKey: ["repositories"] });
        },
    });
}

interface PullResult {
    success: boolean;
    error: string | null;
}

export function useGitPull() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            path,
            repositoryId,
        }: {
            path: string;
            repositoryId: string;
        }) => {
            const result = await invoke<PullResult>("git_pull", { path });
            if (!result.success) {
                throw new Error(result.error ?? "git pull failed");
            }
            await updateLastPulledAt(repositoryId);
            return result;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["repositories"] });
        },
    });
}

export function useGitBranches(repoPath: string | undefined) {
    return useQuery({
        queryKey: ["git-branches", repoPath],
        queryFn: () =>
            invoke<Array<{ name: string; isCurrent: boolean }>>(
                "engine_list_branches",
                { repoPath: repoPath! },
            ),
        enabled: !!repoPath,
        staleTime: 30_000,
    });
}

export function useUpdateDefaultBranch() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            repositoryId,
            branch,
        }: {
            repositoryId: string;
            branch: string;
        }) => updateDefaultBranch(repositoryId, branch),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["repositories"] });
        },
    });
}

export function useDefaultCloneDir() {
    return useQuery({
        queryKey: ["default-clone-dir"],
        queryFn: () => invoke<string>("get_default_clone_dir"),
    });
}
