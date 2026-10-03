import type { MouseEvent } from "react";
import { isTauri } from "@core/services/client";

/** Open a URL in the user's browser (the webview can't navigate away). */
export function openExternal(url: string) {
    if (!isTauri) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
    }
    import("@tauri-apps/plugin-opener")
        .then(({ openUrl }) => openUrl(url))
        .catch((error: unknown) => {
            console.error("Couldn't open the link:", error);
        });
}

/** onClick for `<a href target="_blank">` that also works inside Tauri. */
export function externalLinkClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!isTauri) return;
    event.preventDefault();
    openExternal(event.currentTarget.href);
}
