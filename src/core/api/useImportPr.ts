import { useMutation, useQueryClient } from "@tanstack/react-query";
import { importPr } from "@core/services/pr-import";
import { parseOwnerRepo } from "@core/services/github";
import { useAppStore } from "@core/store/app-store";
import {
    prImportProgressToast,
    prImportSuccessToast,
    prImportErrorToast,
} from "@ui/lib/toast";

export function useImportPr() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (prUrl: string) => {
            const parsed = parseOwnerRepo(prUrl);
            const toastId = parsed
                ? `pr-import-${parsed.owner}-${parsed.repo}-${parsed.number}`
                : `pr-import-${Date.now()}`;
            const label = parsed ? `PR #${parsed.number}` : "PR";

            prImportProgressToast(toastId, `Importing ${label}...`);

            return importPr(prUrl, {
                onProgress: (step) => prImportProgressToast(toastId, step),
                onRepoReady: (repositoryId) => {
                    // Refresh sidebar immediately so the project appears
                    void queryClient.invalidateQueries({
                        queryKey: ["repositories"],
                    });
                    useAppStore.getState().setSelectedRepository(repositoryId);
                },
            }).then(
                (task) => {
                    prImportSuccessToast(toastId, task.prNumber ?? 0);
                    return task;
                },
                (err) => {
                    prImportErrorToast(
                        toastId,
                        err instanceof Error ? err.message : "Import failed",
                    );
                    throw err;
                },
            );
        },
        onSuccess: (task) => {
            void queryClient.invalidateQueries({
                queryKey: ["tasks", task.repositoryId],
            });
            void queryClient.invalidateQueries({
                queryKey: ["repositories"],
            });

            // Select the imported task
            useAppStore.getState().setSelectedRepository(task.repositoryId);
            useAppStore.getState().setSelectedTask(task.id);
        },
    });
}
