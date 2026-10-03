import { useCallback, useEffect, useRef, useState } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Checks for app updates on mount and every hour.
 * Returns state for rendering an update dialog.
 */
export function useUpdateChecker() {
    const checkedRef = useRef(false);
    const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
    const [showDialog, setShowDialog] = useState(false);

    useEffect(() => {
        async function checkForUpdate() {
            try {
                const update = await check();
                if (!update) return;

                setAvailableUpdate(update);
                setShowDialog(true);
            } catch (e) {
                // Silently ignore — network errors, dev mode, etc.
                console.debug("Update check failed:", e);
            }
        }

        if (!checkedRef.current) {
            checkedRef.current = true;
            const initialTimeout = setTimeout(
                () => void checkForUpdate(),
                5000,
            );

            const interval = setInterval(
                () => void checkForUpdate(),
                CHECK_INTERVAL_MS,
            );

            return () => {
                clearTimeout(initialTimeout);
                clearInterval(interval);
            };
        }
    }, []);

    const handleInstall = useCallback(async () => {
        if (!availableUpdate) return;
        await availableUpdate.downloadAndInstall();
        await relaunch();
    }, [availableUpdate]);

    const handleDismiss = useCallback(() => {
        setShowDialog(false);
    }, []);

    return {
        updateVersion: availableUpdate?.version ?? "",
        showUpdateDialog: showDialog,
        handleInstall,
        handleDismiss,
    };
}
