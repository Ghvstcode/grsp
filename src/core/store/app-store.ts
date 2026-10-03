import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppStore {
    selectedRepositoryId: string | undefined;
    selectedTaskId: string | undefined;
    /** Epoch ms when the user last viewed each project. */
    projectLastViewedAt: Record<string, number>;
    /** Review task IDs the user has already seen, keyed by repo ID. */
    seenReviewTaskIds: Record<string, string[]>;
    setSelectedRepository: (id: string | undefined) => void;
    setSelectedTask: (id: string | undefined) => void;
    markReviewTasksSeen: (repoId: string, taskIds: string[]) => void;
}

export const useAppStore = create<AppStore>()(
    persist(
        (set, get) => ({
            selectedRepositoryId: undefined,
            selectedTaskId: undefined,
            projectLastViewedAt: {},
            seenReviewTaskIds: {},
            setSelectedRepository: (id) => {
                // Stamp the previously selected project's view time
                const prev = get().selectedRepositoryId;
                const updates: Partial<AppStore> = {
                    selectedRepositoryId: id,
                    selectedTaskId: undefined,
                };
                if (prev) {
                    updates.projectLastViewedAt = {
                        ...get().projectLastViewedAt,
                        [prev]: Date.now(),
                    };
                }
                set(updates);
            },
            setSelectedTask: (id) => set({ selectedTaskId: id }),
            markReviewTasksSeen: (repoId, taskIds) =>
                set((state) => ({
                    seenReviewTaskIds: {
                        ...state.seenReviewTaskIds,
                        [repoId]: taskIds,
                    },
                })),
        }),
        {
            name: "sustn-app-store",
            partialize: (state) => ({
                projectLastViewedAt: state.projectLastViewedAt,
                seenReviewTaskIds: state.seenReviewTaskIds,
            }),
        },
    ),
);
