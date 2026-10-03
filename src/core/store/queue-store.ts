import { create } from "zustand";

export interface QueuedTask {
    taskId: string;
    repositoryId: string;
    repoPath: string;
    taskTitle: string;
    taskDescription: string;
    filesInvolved: string[];
    baseBranch: string;
    branchName: string;
    userMessages?: string;
    resumeSessionId?: string;
}

interface QueueStore {
    queue: QueuedTask[];
    enqueue: (task: QueuedTask) => void;
    dequeue: () => QueuedTask | undefined;
    remove: (taskId: string) => void;
    clear: () => void;
    isQueued: (taskId: string) => boolean;
    queuePosition: (taskId: string) => number;
}

export const useQueueStore = create<QueueStore>()((set, get) => ({
    queue: [],
    enqueue: (task) =>
        set((state) => {
            // Don't add duplicates
            if (state.queue.some((t) => t.taskId === task.taskId)) return state;
            return { queue: [...state.queue, task] };
        }),
    dequeue: () => {
        const queue = get().queue;
        if (queue.length === 0) return undefined;
        const [first, ...rest] = queue;
        set({ queue: rest });
        return first;
    },
    remove: (taskId) =>
        set((state) => ({
            queue: state.queue.filter((t) => t.taskId !== taskId),
        })),
    clear: () => set({ queue: [] }),
    isQueued: (taskId) => get().queue.some((t) => t.taskId === taskId),
    queuePosition: (taskId) =>
        get().queue.findIndex((t) => t.taskId === taskId),
}));
