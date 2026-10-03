export type ThemeMode = "light" | "dark" | "system";

export type Theme = {
    name: string;
    label: string;
    colors: {
        light: Record<string, string>;
        dark: Record<string, string>;
    };
};

/**
 * grsp is strict black and white (design/DESIGN.md → Visual language).
 * Values are HSL triplets consumed as `hsl(var(--token))`.
 *
 * The shadcn tokens map onto the DESIGN tokens:
 *   foreground / primary = ink, background = paper, sidebar = panel,
 *   muted / secondary / accent = wash, border = line, input = line-strong,
 *   muted-foreground = text-3.
 * The DESIGN tokens are also exposed under their own names (`bg-wash`,
 * `text-text-2`, `border-line-strong`, `bg-code-add`, …) for the screens.
 * Dark mode inverts the scale.
 */
export const defaultTheme: Theme = {
    name: "default",
    label: "Default",
    colors: {
        light: {
            // DESIGN tokens
            ink: "0 0% 3.9%", // #0a0a0a
            paper: "0 0% 100%", // #ffffff
            panel: "0 0% 98%", // #fafafa
            wash: "0 0% 96.1%", // #f5f5f5
            line: "0 0% 89.8%", // #e5e5e5
            "line-soft": "0 0% 94.1%", // #f0f0f0 (hairlines inside cards)
            "line-strong": "0 0% 83.1%", // #d4d4d4
            "text-2": "0 0% 32.2%", // #525252
            "text-3": "0 0% 45.1%", // #737373
            "code-add": "0 0% 93.3%", // #eeeeee
            "code-hl": "0 0% 86.3%", // #dcdcdc
            // shadcn tokens
            background: "0 0% 100%",
            foreground: "0 0% 3.9%",
            card: "0 0% 100%",
            "card-foreground": "0 0% 3.9%",
            popover: "0 0% 100%",
            "popover-foreground": "0 0% 3.9%",
            primary: "0 0% 3.9%",
            "primary-foreground": "0 0% 100%",
            secondary: "0 0% 96.1%",
            "secondary-foreground": "0 0% 3.9%",
            muted: "0 0% 96.1%",
            "muted-foreground": "0 0% 45.1%",
            accent: "0 0% 96.1%",
            "accent-foreground": "0 0% 3.9%",
            destructive: "0 72% 45%",
            "destructive-foreground": "0 0% 100%",
            border: "0 0% 89.8%",
            input: "0 0% 83.1%",
            ring: "0 0% 3.9%",
            "sidebar-background": "0 0% 98%",
            "sidebar-foreground": "0 0% 3.9%",
            "sidebar-primary": "0 0% 3.9%",
            "sidebar-primary-foreground": "0 0% 100%",
            "sidebar-accent": "0 0% 94.1%",
            "sidebar-accent-foreground": "0 0% 3.9%",
            "sidebar-border": "0 0% 89.8%",
            "sidebar-ring": "0 0% 3.9%",
            radius: "0.625rem",
        },
        dark: {
            // DESIGN tokens (inverted)
            ink: "0 0% 98%",
            paper: "0 0% 3.9%",
            panel: "0 0% 6.5%",
            wash: "0 0% 10%",
            line: "0 0% 16%",
            "line-soft": "0 0% 12%",
            "line-strong": "0 0% 25%",
            "text-2": "0 0% 72%",
            "text-3": "0 0% 58%",
            "code-add": "0 0% 13%",
            "code-hl": "0 0% 22%",
            // shadcn tokens
            background: "0 0% 3.9%",
            foreground: "0 0% 98%",
            card: "0 0% 3.9%",
            "card-foreground": "0 0% 98%",
            popover: "0 0% 6.5%",
            "popover-foreground": "0 0% 98%",
            primary: "0 0% 98%",
            "primary-foreground": "0 0% 3.9%",
            secondary: "0 0% 10%",
            "secondary-foreground": "0 0% 98%",
            muted: "0 0% 10%",
            "muted-foreground": "0 0% 58%",
            accent: "0 0% 10%",
            "accent-foreground": "0 0% 98%",
            destructive: "0 70% 55%",
            "destructive-foreground": "0 0% 100%",
            border: "0 0% 16%",
            input: "0 0% 25%",
            ring: "0 0% 98%",
            "sidebar-background": "0 0% 6.5%",
            "sidebar-foreground": "0 0% 98%",
            "sidebar-primary": "0 0% 98%",
            "sidebar-primary-foreground": "0 0% 3.9%",
            "sidebar-accent": "0 0% 12%",
            "sidebar-accent-foreground": "0 0% 98%",
            "sidebar-border": "0 0% 16%",
            "sidebar-ring": "0 0% 98%",
            radius: "0.625rem",
        },
    },
};

export const themes = [defaultTheme] as const;

export type ThemeName = (typeof themes)[number]["name"];
