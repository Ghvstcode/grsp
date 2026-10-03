import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuth, saveAuth, clearAuth } from "@core/db/auth";
import { useAuthStore } from "@core/store/auth-store";

export function useAuth() {
    const setUser = useAuthStore((s) => s.setUser);

    return useQuery({
        queryKey: ["auth"],
        queryFn: async () => {
            const auth = await getAuth();
            if (auth) {
                setUser({
                    id: auth.id,
                    githubId: auth.githubId,
                    username: auth.username,
                    avatarUrl: auth.avatarUrl,
                    email: auth.email,
                });
            }
            return auth ?? null;
        },
    });
}

export function useSaveAuth() {
    const queryClient = useQueryClient();
    const setUser = useAuthStore((s) => s.setUser);

    return useMutation({
        mutationFn: async (params: {
            githubId: number;
            username: string;
            avatarUrl: string | undefined;
            email: string | undefined;
            accessToken: string;
        }) => {
            await saveAuth(params);
            const auth = await getAuth();
            return auth;
        },
        onSuccess: (auth) => {
            if (auth) {
                setUser({
                    id: auth.id,
                    githubId: auth.githubId,
                    username: auth.username,
                    avatarUrl: auth.avatarUrl,
                    email: auth.email,
                });
            }
            void queryClient.invalidateQueries({ queryKey: ["auth"] });
        },
    });
}

export function useClearAuth() {
    const queryClient = useQueryClient();
    const clearUser = useAuthStore((s) => s.clearUser);

    return useMutation({
        mutationFn: clearAuth,
        onSuccess: () => {
            clearUser();
            void queryClient.invalidateQueries({ queryKey: ["auth"] });
        },
    });
}
