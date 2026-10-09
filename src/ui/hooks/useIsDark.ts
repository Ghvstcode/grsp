import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
    });
    return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");

/**
 * Whether the app is drawing in dark mode right now: the `dark` class the
 * theme provider puts on <html> (which already resolves "system"). For
 * components that have to tell a third-party widget which palette to use.
 */
export function useIsDark(): boolean {
    return useSyncExternalStore(subscribe, isDark, () => false);
}
