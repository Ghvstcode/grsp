import { getCurrentWindow } from "@tauri-apps/api/window";
import { metrics } from "./metrics";

let sessionStart: number | undefined;

export function startSessionTracking() {
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
