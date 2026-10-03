import { create } from "zustand";

export interface AuthUser {
    id: string;
    githubId: number;
    username: string;
    avatarUrl: string | undefined;
    email: string | undefined;
}

interface AuthStore {
    user: AuthUser | undefined;
    isAuthenticated: boolean;
    setUser: (user: AuthUser) => void;
    clearUser: () => void;
}

export const useAuthStore = create<AuthStore>()((set) => ({
    user: undefined,
    isAuthenticated: false,
    setUser: (user) => set({ user, isAuthenticated: true }),
    clearUser: () => set({ user: undefined, isAuthenticated: false }),
}));
