import { create } from "zustand";
import { persist } from "zustand/middleware";

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 400;
export const SIDEBAR_DEFAULT_WIDTH = 264;

interface AppStore {
    /** The review session shown in the main area. */
    selectedSessionId: string | undefined;
    setSelectedSession: (id: string | undefined) => void;
    sidebarWidth: number;
    setSidebarWidth: (width: number) => void;
    /** The "New review" dialog (opened from the sidebar and empty states). */
    isNewReviewOpen: boolean;
    setNewReviewOpen: (open: boolean) => void;
}

export const useAppStore = create<AppStore>()(
    persist(
        (set) => ({
            selectedSessionId: undefined,
            setSelectedSession: (id) => set({ selectedSessionId: id }),
            sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
            setSidebarWidth: (width) =>
                set({
                    sidebarWidth: Math.min(
                        SIDEBAR_MAX_WIDTH,
                        Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)),
                    ),
                }),
            isNewReviewOpen: false,
            setNewReviewOpen: (open) => set({ isNewReviewOpen: open }),
        }),
        {
            name: "grsp-app-store",
            partialize: (state) => ({
                selectedSessionId: state.selectedSessionId,
                sidebarWidth: state.sidebarWidth,
            }),
        },
    ),
);
