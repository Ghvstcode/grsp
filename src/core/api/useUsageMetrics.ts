import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isMetricsEnabled, setMetricsEnabled } from "@core/services/metrics";

export function useUsageMetrics() {
    return useQuery({
        queryKey: ["usage-metrics"],
        queryFn: isMetricsEnabled,
    });
}

export function useSetUsageMetrics() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (enabled: boolean) => setMetricsEnabled(enabled),
        onMutate: (enabled) => {
            queryClient.setQueryData(["usage-metrics"], enabled);
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: ["usage-metrics"] });
        },
    });
}
