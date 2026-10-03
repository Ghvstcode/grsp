/**
 * Dev-only harness: mounts SessionView on the fixture backend without the
 * app shell. Open /src/ui/components/session/dev/index.html on the Vite dev
 * server. `?session=s479` picks a session, `?fx=stale,ownpr` a fixture state
 * (see core/fixtures/variants.ts). Not part of the production build.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import "@ui/App.css";
import "./preview.css";
import { Preview } from "./Preview";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
            networkMode: "always",
            refetchOnWindowFocus: false,
            staleTime: Infinity,
        },
    },
});

const root = document.getElementById("root");
if (root) {
    ReactDOM.createRoot(root).render(
        <React.StrictMode>
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <Preview />
                </MemoryRouter>
            </QueryClientProvider>
        </React.StrictMode>,
    );
}
