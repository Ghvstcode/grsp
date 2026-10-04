import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@core/services/client";
import { metrics } from "./metrics";

let sessionStart: number | undefined;

/** Starts the metrics queue and records how long the app stays open. */
export function startSessionTracking() {
    if (!isTauri || sessionStart) return;
    sessionStart = Date.now();
    metrics.start();
    metrics.track("session_start");

    const appWindow = getCurrentWindow();
    void appWindow.onCloseRequested(() => {
        if (sessionStart) {
            const durationSeconds = Math.round(
                (Date.now() - sessionStart) / 1000,
            );
            metrics.track("session_end", { durationSeconds });
        }
        metrics.stop();
    });
}
