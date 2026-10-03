import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isOnboardingComplete, setOnboardingComplete } from "@core/db/metadata";

export function useOnboardingStatus() {
    return useQuery({
        queryKey: ["onboarding-status"],
        queryFn: isOnboardingComplete,
    });
}

export function useCompleteOnboarding() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: setOnboardingComplete,
        onSuccess: () => {
            queryClient.setQueryData(["onboarding-status"], true);
        },
    });
}
