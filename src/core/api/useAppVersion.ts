import { useQuery } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";

export function useAppVersion() {
    return useQuery({
        queryKey: ["app-version"],
        queryFn: () => getVersion(),
    });
}
