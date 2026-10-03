import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
    listTasks,
    getTask,
    createTask as dbCreateTask,
    updateTask as dbUpdateTask,
    deleteTask as dbDeleteTask,
    reorderTask as dbReorderTask,
    addComment as dbAddComment,
    listTaskEvents,
    createMessage as dbCreateMessage,
    listMessages as dbListMessages,
} from "@core/db/tasks";
import { listRepositories } from "@core/db/repositories";
import type {
    Task,
    TaskCategory,
    TaskState,
    EstimatedEffort,
    MessageRole,
} from "@core/types/task";
import { metrics } from "@core/services/metrics";

async function cleanupWorktree(
    repositoryId: string,
    taskId: string,
): Promise<void> {
    try {
        const repos = await listRepositories();
        const repo = repos.find((r) => r.id === repositoryId);
        if (!repo) return;
        await invoke("engine_cleanup_worktree", {
            repoPath: repo.path,
            taskId,
        });
    } catch (e) {
        console.warn("[useTasks] worktree cleanup failed:", e);
    }
}

export function useTasks(
    repositoryId: string | undefined,
    baseBranch?: string,
) {
    return useQuery({
        queryKey: ["tasks", repositoryId, baseBranch],
        queryFn: () => listTasks(repositoryId!, baseBranch),
        enabled: !!repositoryId,
    });
}

export function useTask(taskId: string | undefined) {
    return useQuery({
        queryKey: ["task", taskId],
        queryFn: () => getTask(taskId!),
        enabled: !!taskId,
    });
}

export function useCreateTask() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (task: {
            repositoryId: string;
            title: string;
            description?: string;
            category: TaskCategory;
            sortOrder: number;
            baseBranch?: string;
            estimatedEffort?: EstimatedEffort;
        }) => dbCreateTask(task),
        onSuccess: (task) => {
            metrics.track("task_created", { category: task.category });
            void queryClient.invalidateQueries({
                queryKey: ["tasks", task.repositoryId],
            });
        },
    });
}

export function useUpdateTask() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            id,
            ...fields
        }: {
            id: string;
            title?: string;
            description?: string;
            state?: TaskState;
            sortOrder?: number;
            notes?: string;
            prUrl?: string;
            category?: TaskCategory;
            branchName?: string;
            commitSha?: string;
            lastError?: string;
            startedAt?: string;
            completedAt?: string;
            filesInvolved?: string[];
        }) => dbUpdateTask(id, fields),
        onSuccess: (task) => {
            void queryClient.invalidateQueries({
                queryKey: ["tasks", task.repositoryId],
            });
            void queryClient.invalidateQueries({
                queryKey: ["task", task.id],
            });
            void queryClient.invalidateQueries({
                queryKey: ["task-events", task.id],
            });

            // Clean up worktree when task reaches a terminal state
            if (task.state === "done" || task.state === "dismissed") {
                void cleanupWorktree(task.repositoryId, task.id);
            }
        },
    });
}

export function useDeleteTask() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id }: { id: string; repositoryId: string }) =>
            dbDeleteTask(id),
        onSuccess: (_data, variables) => {
            void queryClient.invalidateQueries({
                queryKey: ["tasks", variables.repositoryId],
            });
        },
    });
}

export function useReorderTask() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            id,
            newSortOrder,
        }: {
            id: string;
            repositoryId: string;
            newSortOrder: number;
        }) => dbReorderTask(id, newSortOrder),
        onMutate: async ({ id, repositoryId, newSortOrder }) => {
            await queryClient.cancelQueries({
                queryKey: ["tasks", repositoryId],
            });

            const previousTasks = queryClient.getQueryData<Task[]>([
                "tasks",
                repositoryId,
            ]);

            queryClient.setQueryData<Task[]>(["tasks", repositoryId], (old) => {
                if (!old) return old;
                return old
                    .map((t) =>
                        t.id === id ? { ...t, sortOrder: newSortOrder } : t,
                    )
                    .sort((a, b) => a.sortOrder - b.sortOrder);
            });

            return { previousTasks };
        },
        onError: (_err, variables, context) => {
            if (context?.previousTasks) {
                queryClient.setQueryData(
                    ["tasks", variables.repositoryId],
                    context.previousTasks,
                );
            }
        },
        onSettled: (_data, _error, variables) => {
            void queryClient.invalidateQueries({
                queryKey: ["tasks", variables.repositoryId],
            });
        },
    });
}

export function useTaskEvents(taskId: string | undefined) {
    return useQuery({
        queryKey: ["task-events", taskId],
        queryFn: () => listTaskEvents(taskId!),
        enabled: !!taskId,
    });
}

export function useAddComment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            taskId,
            comment,
        }: {
            taskId: string;
            comment: string;
        }) => dbAddComment(taskId, comment),
        onSuccess: (event) => {
            void queryClient.invalidateQueries({
                queryKey: ["task-events", event.taskId],
            });
        },
    });
}

export function useTaskMessages(taskId: string | undefined) {
    return useQuery({
        queryKey: ["task-messages", taskId],
        queryFn: () => dbListMessages(taskId!),
        enabled: !!taskId,
    });
}

export function useSendMessage() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            taskId,
            role,
            content,
            metadata,
        }: {
            taskId: string;
            role: MessageRole;
            content: string;
            metadata?: Record<string, unknown>;
        }) => dbCreateMessage(taskId, role, content, metadata),
        onSuccess: (message) => {
            void queryClient.invalidateQueries({
                queryKey: ["task-messages", message.taskId],
            });
        },
    });
}
