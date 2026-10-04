import { onGrspEvent } from "@core/services/client";
import { metrics, metricKind } from "@core/services/metrics";
import { startSessionTracking } from "@core/services/session-tracker";
import { GRSP_EVENTS, type AnalysisEvent } from "@core/types/grsp";
import { useCallback, useRef, useEffect } from "react";
import { Sidebar } from "@ui/components/sidebar/Sidebar";
import { MainContent } from "@ui/components/main/MainContent";
import { NewReviewDialog } from "@ui/components/sidebar/NewReviewDialog";
import { ErrorBoundary } from "@ui/components/ErrorBoundary";
import { useAuth } from "@core/api/useAuth";
import { useAppStore } from "@core/store/app-store";

export function AppShell() {
    useAuth();

    // Usage metrics: app session length and which pipelines finish.
    useEffect(() => {
        startSessionTracking();
        return onGrspEvent<AnalysisEvent>(GRSP_EVENTS.analysis, (event) => {
            if (event.status === "done" || event.status === "error") {
                metrics.track("analysis_completed", {
                    kind: metricKind(event.kind),
                    status: event.status,
                });
            }
        });
    }, []);

    const sidebarWidth = useAppStore((s) => s.sidebarWidth);
    const setSidebarWidth = useAppStore((s) => s.setSidebarWidth);
    const isNewReviewOpen = useAppStore((s) => s.isNewReviewOpen);
    const setNewReviewOpen = useAppStore((s) => s.setNewReviewOpen);
    const isDragging = useRef(false);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }, []);

    useEffect(() => {
        function onMouseMove(e: MouseEvent) {
            if (!isDragging.current) return;
            // The store clamps to the min/max sidebar width.
            setSidebarWidth(e.clientX);
        }

        function onMouseUp() {
            if (!isDragging.current) return;
            isDragging.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        }

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [setSidebarWidth]);

    return (
        <ErrorBoundary level="root">
            <div className="flex h-screen w-screen overflow-hidden">
                <Sidebar style={{ width: sidebarWidth }} />
                <div
                    onMouseDown={handleMouseDown}
                    className="relative z-10 w-0 cursor-col-resize before:absolute before:-left-1 before:top-0 before:h-full before:w-2 before:content-[''] hover:before:bg-ring/20 active:before:bg-ring/30"
                />
                <main className="flex-1 overflow-hidden h-full min-w-0">
                    <MainContent />
                </main>
            </div>
            <NewReviewDialog
                open={isNewReviewOpen}
                onOpenChange={setNewReviewOpen}
            />
        </ErrorBoundary>
    );
}
