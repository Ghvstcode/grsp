import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { GrspCommands } from "@core/types/grsp";
import { fixtureCall, fixtureListen } from "@core/fixtures/backend";

/** True inside the Tauri webview; false in a plain browser (vite dev). */
export const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Fixture mode serves the prototype scenario instead of the Rust core.
 * On with VITE_GRSP_FIXTURES=1, and always on outside Tauri so the UI can be
 * developed in a browser.
 */
export const useFixtures =
    import.meta.env.VITE_GRSP_FIXTURES === "1" || !isTauri;

/** Typed wrapper around every grsp Tauri command. */
export async function call<K extends keyof GrspCommands>(
    name: K,
    args: GrspCommands[K]["args"],
): Promise<GrspCommands[K]["result"]> {
    if (useFixtures) return fixtureCall(name, args);
    return invoke<GrspCommands[K]["result"]>(name, args);
}

/** Subscribe to a grsp event. Returns an unsubscribe function. */
export function onGrspEvent<T>(
    event: string,
    handler: (payload: T) => void,
): () => void {
    if (useFixtures) return fixtureListen<T>(event, handler);
    const unlisten = listen<T>(event, (e) => handler(e.payload));
    return () => {
        void unlisten.then((fn) => fn());
    };
}
