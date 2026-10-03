import { isTauri } from "@core/services/client";

/**
 * Thin wrappers around Tauri plugins that degrade to browser behaviour when
 * the UI runs outside the Tauri webview (`pnpm vite:dev`). Plugins are
 * imported lazily so a plain browser never touches Tauri internals.
 */

/** Opens a URL in the user's default browser. */
export async function openExternal(url: string): Promise<void> {
    if (!isTauri) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
    }
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
}

/** Native folder picker. Returns undefined when the user cancels. */
export async function pickFolder(title: string): Promise<string | undefined> {
    if (!isTauri) {
        // Browser preview has no native dialog; ask for a path instead.
        const typed = window.prompt(`${title} (browser preview: type a path)`);
        return typed?.trim() || undefined;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false, title });
    if (!selected) return undefined;
    return selected;
}

/** Subscribes to deep links (`grsp://…`). Returns an unsubscribe function. */
export function onDeepLink(handler: (url: string) => void): () => void {
    if (!isTauri) return () => {};
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void import("@tauri-apps/plugin-deep-link")
        .then(({ onOpenUrl }) =>
            onOpenUrl((urls) => {
                for (const url of urls) handler(url);
            }),
        )
        .then((fn) => {
            if (disposed) fn();
            else unlisten = fn;
        })
        .catch((e: unknown) => {
            // The listener can fail in dev before the scheme is registered.
            console.warn("Deep link listener setup failed:", e);
        });

    return () => {
        disposed = true;
        unlisten?.();
    };
}

/** Subscribes to native menu navigation ("Settings…" → "/settings"). */
export function onMenuNavigate(handler: (path: string) => void): () => void {
    if (!isTauri) return () => {};
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void import("@tauri-apps/api/event")
        .then(({ listen }) =>
            listen<string>("menu-navigate", (event) => handler(event.payload)),
        )
        .then((fn) => {
            if (disposed) fn();
            else unlisten = fn;
        })
        .catch((e: unknown) => {
            console.warn("Menu listener setup failed:", e);
        });

    return () => {
        disposed = true;
        unlisten?.();
    };
}
