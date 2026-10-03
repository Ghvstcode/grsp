import { useEffect, useState } from "react";
import { type ThemeName, type ThemeMode, themes } from "@ui/themes";
import { ThemeContext } from "@ui/context/ThemeContext";

export function ThemeProvider({
    children,
    defaultMode = "system",
    defaultThemeName = "default",
    storageKey = "sustn-theme",
}: {
    children: React.ReactNode;
    defaultMode?: ThemeMode;
    defaultThemeName?: ThemeName;
    storageKey?: string;
}) {
    const [mode, setMode] = useState<ThemeMode>(() => {
        const saved = localStorage.getItem(`${storageKey}-mode`) as ThemeMode;
        return saved || defaultMode;
    });

    const [themeName, setThemeName] = useState<ThemeName>(
        () =>
            (localStorage.getItem(`${storageKey}-name`) as ThemeName) ||
            defaultThemeName,
    );

    useEffect(() => {
        const root = window.document.documentElement;
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

        const updateTheme = () => {
            const systemPreference = mediaQuery.matches ? "dark" : "light";
            const effectiveMode = mode === "system" ? systemPreference : mode;

            root.classList.remove("light", "dark");
            root.classList.add(effectiveMode);

            const theme = themes.find((t) => t.name === themeName)!;
            const colors =
                effectiveMode === "dark"
                    ? theme.colors.dark
                    : theme.colors.light;

            Object.entries(colors).forEach(([key, value]) => {
                root.style.setProperty(`--${key}`, value);
            });
        };

        updateTheme();

        const handleChange = () => {
            if (mode === "system") {
                updateTheme();
            }
        };

        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, [mode, themeName]);

    const value = {
        mode,
        setMode: (newMode: ThemeMode) => {
            localStorage.setItem(`${storageKey}-mode`, newMode);
            setMode(newMode);
        },
        themeName,
        setThemeName: (name: ThemeName) => {
            localStorage.setItem(`${storageKey}-name`, name);
            setThemeName(name);
        },
        themes,
    };

    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
}
