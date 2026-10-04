import { metrics } from "@core/services/metrics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { call } from "@core/services/client";
import {
    listRepos,
    addRepo,
    removeRepo,
    setRepoSidebarOpen,
} from "@core/db/repos";
import type { Repo } from "@core/types/grsp";

export function useRepos() {
    return useQuery({
        queryKey: ["repos"],
        queryFn: listRepos,
    });
}

/** Adds a folder. Rejects with a readable error if it isn't a git repo. */
export function useAddRepo() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ path }: { path: string }) => addRepo(path),
        onSuccess: () => {
            metrics.track("repo_added", { via: "folder" });
            void queryClient.invalidateQueries({ queryKey: ["repos"] });
        },
    });
}

/** Clones owner/name into grsp's own folder, then adds it as a repo. */
export function useCloneRepo() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            owner,
            name,
        }: {
            owner: string;
            name: string;
        }) => {
            const { path } = await call("repo_clone", { owner, name });
            return addRepo(path);
        },
        onSuccess: () => {
            metrics.track("repo_added", { via: "clone" });
            void queryClient.invalidateQueries({ queryKey: ["repos"] });
        },
    });
}

/** Removes a folder and archives its sessions. */
export function useRemoveRepo() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (repoId: string) => removeRepo(repoId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["repos"] });
            void queryClient.invalidateQueries({ queryKey: ["sessions"] });
        },
    });
}

/** Persists a folder's open/closed state in the sidebar. */
export function useSetRepoSidebarOpen() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ repoId, open }: { repoId: string; open: boolean }) =>
            setRepoSidebarOpen(repoId, open),
        onMutate: ({ repoId, open }) => {
            queryClient.setQueryData<Repo[]>(["repos"], (repos) =>
                repos?.map((r) =>
                    r.id === repoId ? { ...r, sidebarOpen: open } : r,
                ),
            );
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: ["repos"] });
        },
    });
}

export function useOpenPrs(repoId: string | undefined, enabled = true) {
    return useQuery({
        queryKey: ["open-prs", repoId],
        queryFn: () => call("github_list_open_prs", { repoId: repoId ?? "" }),
        enabled: enabled && !!repoId,
        staleTime: 30_000,
    });
}

export function useBranches(repoId: string | undefined, enabled = true) {
    return useQuery({
        queryKey: ["branches", repoId],
        queryFn: () => call("repo_list_branches", { repoId: repoId ?? "" }),
        enabled: enabled && !!repoId,
        staleTime: 30_000,
    });
}
