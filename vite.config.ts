import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;
const port = process.env.VITE_PORT ? parseInt(process.env.VITE_PORT) : 1420;

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@ui": path.resolve(__dirname, "./src/ui"),
            "@core": path.resolve(__dirname, "./src/core"),
            "@": path.resolve(__dirname, "./src"),
        },
    },
    build: {
        target: ["es2020"],
    },
    clearScreen: false,
    server: {
        port,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                  protocol: "ws",
                  host,
                  port: port + 1,
              }
            : undefined,
        watch: {
            ignored: ["**/src-tauri/**"],
        },
    },
});
