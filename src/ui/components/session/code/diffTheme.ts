/**
 * grsp's look for `@pierre/diffs`: strict black and white (DESIGN.md).
 *
 * The library colours code with a Shiki theme and tints added / removed
 * lines green and red. Here both themes are a single ink colour with no
 * token rules, so there is no syntax colour, and the diff tints are replaced
 * with the DESIGN greys through the library's `--diffs-*-override`
 * variables. The `--g-*` values come from `.grsp-session` (session.css) and
 * inherit into the diff's shadow root.
 */
import {
    preloadHighlighter,
    registerCustomTheme,
    type ThemeRegistration,
} from "@pierre/diffs";

export const DIFF_THEME = { light: "grsp-light", dark: "grsp-dark" } as const;

function monochrome(
    name: string,
    type: "light" | "dark",
    foreground: string,
    background: string,
): ThemeRegistration {
    return {
        name,
        type,
        colors: {
            "editor.foreground": foreground,
            "editor.background": background,
        },
        // No token rules: every token takes the editor foreground.
        tokenColors: [],
        settings: [],
    };
}

let ready: Promise<void> | undefined;

/**
 * Registers the two themes and loads the highlighter with them, once.
 * Awaited before the first diff is mounted: a diff mounted while the
 * highlighter is still loading can stay blank (seen under React StrictMode).
 */
export function prepareDiffs(): Promise<void> {
    ready ??= (() => {
        registerDiffThemes();
        return preloadHighlighter({
            themes: [DIFF_THEME.light, DIFF_THEME.dark],
            langs: [],
        }).catch((error: unknown) => {
            // The diff still draws; it loads what it needs on demand.
            console.warn("Couldn't preload the diff highlighter:", error);
        });
    })();
    return ready;
}

function registerDiffThemes() {
    registerCustomTheme(DIFF_THEME.light, () =>
        Promise.resolve(
            monochrome(DIFF_THEME.light, "light", "#262626", "#ffffff"),
        ),
    );
    registerCustomTheme(DIFF_THEME.dark, () =>
        Promise.resolve(
            monochrome(DIFF_THEME.dark, "dark", "#e5e5e5", "#0a0a0a"),
        ),
    );
}

/**
 * Injected into the diff's shadow root. Ink marks additions, grey marks
 * deletions; backgrounds are the DESIGN `code-add` / `code-del` greys and
 * changed words inside a line use `code-hl`.
 */
export const DIFF_CSS = `
:host {
    --diffs-font-family: var(--font-mono);
    --diffs-header-font-family: var(--font-sans);
    --diffs-font-size: 12.5px;
    --diffs-line-height: 21px;
    --diffs-tab-size: 4;

    --diffs-light-bg: hsl(var(--background));
    --diffs-dark-bg: hsl(var(--background));
    --diffs-light: var(--g-text-1);
    --diffs-dark: var(--g-text-1);

    --diffs-addition-color-override: hsl(var(--foreground));
    --diffs-deletion-color-override: var(--g-gutter);
    --diffs-modified-color-override: hsl(var(--foreground));

    --diffs-bg-addition-override: var(--g-code-add);
    --diffs-bg-addition-number-override: var(--g-code-add);
    --diffs-bg-addition-emphasis-override: var(--g-code-hl);
    --diffs-bg-deletion-override: var(--g-code-del);
    --diffs-bg-deletion-number-override: var(--g-code-del);
    --diffs-bg-deletion-emphasis-override: var(--g-line-strong);

    --diffs-bg-context-override: hsl(var(--background));
    --diffs-bg-context-gutter-override: hsl(var(--background));
    --diffs-bg-separator-override: var(--g-panel);
    --diffs-bg-buffer-override: var(--g-panel);
    --diffs-bg-hover-override: var(--g-wash);
    --diffs-bg-selection-override: var(--g-code-hl);
    --diffs-bg-selection-number-override: var(--g-code-hl);

    --diffs-fg-number-override: var(--g-gutter);
    --diffs-fg-number-addition-override: var(--g-text-2);
    --diffs-fg-number-deletion-override: var(--g-gutter);
}

/*
 * The library blends each tint into the page background; the DESIGN greys
 * are already the final colours, so use them as they are.
 */
[data-line-type='change-addition'],
[data-line-type='change-deletion'] {
    --mix-light: 0%;
    --mix-dark: 0%;
}
[data-selected-line] {
    --mix-selection-light: 0%;
    --mix-selection-dark: 0%;
}

/* Added lines read in full ink, removed lines step back. */
[data-line-type='change-addition'] span {
    color: hsl(var(--foreground));
}
[data-line-type='change-deletion'] span {
    color: var(--g-code-del-text);
}
`;
