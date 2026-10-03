import { createContext } from "react";
import { type ThemeMode, type ThemeName, themes } from "@ui/themes";

type ThemeProviderState = {
    mode: ThemeMode;
    setMode: (mode: ThemeMode) => void;
    themeName: ThemeName;
    setThemeName: (theme: ThemeName) => void;
    themes: typeof themes;
};

const initialState: ThemeProviderState = {
    mode: "system",
    setMode: () => null,
    themeName: "default",
    setThemeName: () => null,
    themes: themes,
};

export const ThemeContext = createContext<ThemeProviderState>(initialState);
