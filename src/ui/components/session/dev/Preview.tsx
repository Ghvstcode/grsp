import { Route, Routes } from "react-router-dom";
import { SessionView } from "../SessionView";

const sessionId =
    new URLSearchParams(window.location.search).get("session") ?? "s482";

/** Dev-only frame around SessionView; see ./main.tsx. */
export function Preview() {
    return (
        <div className="flex h-screen w-screen overflow-hidden">
            <aside className="w-[264px] shrink-0 border-r bg-[#fafafa] p-5 text-xs text-muted-foreground">
                Sidebar (owned by the shell)
            </aside>
            <main className="flex min-w-0 grow flex-col">
                <Routes>
                    <Route
                        path="/settings"
                        element={
                            <p className="p-9">Settings (owned by the shell)</p>
                        }
                    />
                    <Route
                        path="*"
                        element={<SessionView sessionId={sessionId} />}
                    />
                </Routes>
            </main>
        </div>
    );
}
