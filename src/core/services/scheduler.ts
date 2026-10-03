import type {
    GlobalSettings,
    ScheduleDay,
    ScanFrequency,
} from "@core/types/settings";

const DAY_MAP: Record<number, ScheduleDay> = {
    0: "sun",
    1: "mon",
    2: "tue",
    3: "wed",
    4: "thu",
    5: "fri",
    6: "sat",
};

/**
 * Check if the agent is allowed to work right now based on global settings.
 * Considers agent mode, active days, and time window.
 */
export function shouldWorkNow(settings: GlobalSettings): boolean {
    const mode = settings.agentMode;
    if (mode === "manual") return false;
    if (mode === "always") return true;

    // mode === "scheduled"
    const today = DAY_MAP[new Date().getDay()];
    if (!settings.scheduleDays.includes(today)) return false;

    return isInTimeWindow(settings.scheduleStart, settings.scheduleEnd);
}

/**
 * Check if a scan is due based on the last scan time and configured frequency.
 */
export function isScanDue(
    lastScanAt: string | undefined,
    scanFrequency: ScanFrequency,
): boolean {
    if (scanFrequency === "manual") return false;
    if (scanFrequency === "on-push") return false; // handled externally, not by timer

    if (!lastScanAt) return true; // never scanned — due immediately

    const minutes = scanFrequencyToMinutes(scanFrequency);
    const elapsed = (Date.now() - new Date(lastScanAt).getTime()) / 60_000;
    return elapsed >= minutes;
}

function scanFrequencyToMinutes(freq: ScanFrequency): number {
    switch (freq) {
        case "6h":
            return 360;
        case "12h":
            return 720;
        case "daily":
            return 1440;
        default:
            return Infinity;
    }
}

function isInTimeWindow(start: string, end: string): boolean {
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();

    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;

    if (startMin <= endMin) {
        // Normal window (e.g., 09:00 - 17:00)
        return current >= startMin && current <= endMin;
    }
    // Overnight window (e.g., 22:00 - 06:00)
    return current >= startMin || current <= endMin;
}
