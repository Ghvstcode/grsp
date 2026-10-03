import { useSettings } from "@core/api/useSettings";
import { DEFAULT_SETTINGS, type GrspSettings } from "@core/types/grsp";

/**
 * The settings the session screens read: the shell's `useSettings()`, with
 * the defaults standing in until they've loaded.
 */
export function useSessionSettings(): GrspSettings {
    const { data } = useSettings();
    return data ?? DEFAULT_SETTINGS;
}
