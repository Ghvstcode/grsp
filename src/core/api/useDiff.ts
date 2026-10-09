import { useQuery } from "@tanstack/react-query";
import { call } from "@core/services/client";
import { sessionKeys } from "@core/api/useSession";

/**
 * The whole diff of a session, for the Code tab. It only changes when the
 * head does, so it is cached per session and head and never refetched on
 * focus.
 */
export function useDiff(
    sessionId: string,
    headSha: string | undefined,
    enabled = true,
) {
    return useQuery({
        queryKey: sessionKeys.diff(sessionId, headSha),
        queryFn: () => call("diff_read", { sessionId }),
        enabled,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
    });
}
