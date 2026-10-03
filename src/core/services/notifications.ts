import {
    isPermissionGranted,
    requestPermission,
    sendNotification as tauriNotify,
} from "@tauri-apps/plugin-notification";
import { invoke } from "@tauri-apps/api/core";

// ── Badge state ─────────────────────────────────────────────

let unreadCount = 0;

export async function incrementBadge(): Promise<void> {
    unreadCount += 1;
    try {
        await invoke("set_dock_badge", { count: unreadCount });
    } catch {
        // non-macOS or command not available — ignore
    }
}

export async function clearBadge(): Promise<void> {
    if (unreadCount === 0) return;
    unreadCount = 0;
    try {
        await invoke("set_dock_badge", { count: null as unknown as number });
    } catch {
        // ignore
    }
}

// ── Desktop notifications ───────────────────────────────────

let permissionGranted: boolean | null = null;

/**
 * Check and cache notification permission at startup.
 * Call once from AppShell so subsequent sendNotification calls
 * don't need to make async IPC calls.
 */
export async function initNotificationPermission(): Promise<void> {
    try {
        permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
            const result = await requestPermission();
            permissionGranted = result === "granted";
        }
    } catch (err) {
        console.error("[notifications] failed to init permission:", err);
        permissionGranted = false;
    }
}

export function sendNotification(title: string, body: string): void {
    try {
        if (permissionGranted) {
            tauriNotify({ title, body });
        } else if (permissionGranted === null) {
            // Permission not cached yet — fall back to async check
            void isPermissionGranted().then((granted) => {
                permissionGranted = granted;
                if (granted) tauriNotify({ title, body });
            });
        }
    } catch (err) {
        console.error("[notifications] failed to send:", err);
    }
}

// ── Sound synthesis (Web Audio API) ─────────────────────────

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
    return audioCtx;
}

/**
 * Play one of the built-in notification sounds.
 * Sounds are synthesized in real-time — no audio files needed.
 */
export async function playSound(preset: string): Promise<void> {
    try {
        const ctx = getAudioContext();
        if (ctx.state === "suspended") {
            await ctx.resume();
        }

        switch (preset) {
            case "chime":
                playChime(ctx);
                break;
            case "ding":
                playDing(ctx);
                break;
            case "pop":
                playPop(ctx);
                break;
            default:
                playChime(ctx);
        }
    } catch (err) {
        console.error("[sound] playback failed:", err);
    }
}

/** Two ascending tones — gentle, pleasant chime. */
function playChime(ctx: AudioContext): void {
    const now = ctx.currentTime;

    // First tone (C5 = 523 Hz)
    playTone(ctx, 523, now, 0.15, 0.12);
    // Second tone (E5 = 659 Hz) — slightly delayed
    playTone(ctx, 659, now + 0.12, 0.18, 0.12);
}

/** Single bell-like tone with resonance. */
function playDing(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now); // A5
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.4);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);
}

/** Short percussive pop — quick and satisfying. */
function playPop(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
}

/** Helper: play a single sine tone with attack/release envelope. */
function playTone(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    volume: number,
): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
}
