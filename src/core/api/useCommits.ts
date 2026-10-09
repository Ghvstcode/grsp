import { useQuery } from "@tanstack/react-query";
import { call } from "@core/services/client";

/** How many commits the dialog asks for; enough to find last week's work. */
export const COMMIT_LIST_LIMIT = 50;

/**
 * Recent commits on a branch, newest first. The core fetches the branch
 * first, so this is fetched when the list is shown and not kept warm.
 */
export function useCommits(
    repoId: string | undefined,
    branch: string | undefined,
    enabled = true,
) {
    return useQuery({
        queryKey: ["commits", repoId, branch],
        queryFn: () =>
            call("repo_list_commits", {
                repoId: repoId ?? "",
                branch: branch ?? "",
                limit: COMMIT_LIST_LIMIT,
            }),
        enabled: enabled && !!repoId && !!branch,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
    });
}
