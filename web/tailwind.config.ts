import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ["var(--font-sans)", "system-ui", "sans-serif"],
                mono: [
                    "var(--font-mono)",
                    "ui-monospace",
                    "Menlo",
                    "monospace",
                ],
            },
            // The grsp app tokens (design/DESIGN.md), used by the product mocks.
            colors: {
                ink: "#0a0a0a",
                paper: "#ffffff",
                panel: "#fafafa",
                wash: "#f5f5f5",
                line: "#e5e5e5",
                "line-strong": "#d4d4d4",
                "text-2": "#525252",
                "text-3": "#737373",
                "code-add": "#eeeeee",
                "code-hl": "#dcdcdc",
            },
        },
    },
    plugins: [],
};

export default config;
