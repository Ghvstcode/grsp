/**
 * Browser-mode persistence. Outside Tauri there is no SQLite, so the db
 * modules fall back to this localStorage-backed store (in-memory when
 * localStorage is unavailable). Only used for visual QA via `pnpm vite:dev`.
 */

const PREFIX = "grsp-browser:";
const memory = new Map<string, string>();

function readRaw(key: string): string | undefined {
    try {
        return window.localStorage.getItem(PREFIX + key) ?? undefined;
    } catch {
        return memory.get(key);
    }
}

function writeRaw(key: string, value: string): void {
    try {
        window.localStorage.setItem(PREFIX + key, value);
    } catch {
        memory.set(key, value);
    }
}

export function readStore<T>(
    key: string,
    seed: () => T,
    isValid: (value: unknown) => value is T,
): T {
    const raw = readRaw(key);
    if (raw !== undefined) {
        try {
            const parsed: unknown = JSON.parse(raw);
            if (isValid(parsed)) return parsed;
        } catch {
            // fall through to the seed
        }
    }
    const seeded = seed();
    writeRaw(key, JSON.stringify(seeded));
    return seeded;
}

export function writeStore<T>(key: string, value: T): void {
    writeRaw(key, JSON.stringify(value));
}
