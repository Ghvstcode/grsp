import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSettings, updateSetting } from "@core/db/settings";
import type { SettingUpdate } from "@core/db/settings-codec";
import type { GrspSettings } from "@core/types/grsp";
import { savedToast } from "@ui/lib/toast";

export function useSettings() {
    return useQuery({
        queryKey: ["settings"],
        queryFn: getSettings,
    });
}

type UpdateSettingVariables = SettingUpdate & {
    /** Skip the "Saved" toast (e.g. onboarding). */
    silent?: boolean;
};

export function useUpdateSetting() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (update: UpdateSettingVariables) => updateSetting(update),
        onMutate: ({ key, value }) => {
            queryClient.setQueryData<GrspSettings>(["settings"], (settings) =>
                settings ? { ...settings, [key]: value } : settings,
            );
        },
        onSuccess: (_data, variables) => {
            if (!variables.silent) savedToast();
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: ["settings"] });
        },
    });
}
