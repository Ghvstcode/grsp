import { useQuery } from "@tanstack/react-query";
import { isTauri } from "@core/services/client";

export function useAppVersion() {
    return useQuery({
        queryKey: ["app-version"],
        queryFn: async () => {
            if (!isTauri) return "dev";
            const { getVersion } = await import("@tauri-apps/api/app");
            return getVersion();
        },
    });
}
