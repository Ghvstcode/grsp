import { useState, useCallback, useRef, useEffect } from "react";
import { Sidebar } from "@ui/components/sidebar/Sidebar";
import { MainContent } from "@ui/components/main/MainContent";
import { ErrorBoundary } from "@ui/components/ErrorBoundary";
import {
    useStartupRecovery,
    useStartupScan,
    useQueueProcessor,
    useGlobalTaskNotifications,
} from "@core/api/useEngine";
import { useAuth } from "@core/api/useAuth";
import { useScheduler } from "@core/api/useScheduler";
import { useLinearAutoSync } from "@core/api/useLinear";
import { usePrLifecyclePoller } from "@core/api/usePrLifecycle";
import { startSessionTracking } from "@core/services/session-tracker";
import { initNotificationPermission } from "@core/services/notifications";

const MIN_WIDTH = 180;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 270; // w-56

export function AppShell() {
    useAuth();
    useStartupRecovery();
    useStartupScan();
    useScheduler();
    useLinearAutoSync();
    usePrLifecyclePoller();
    useQueueProcessor();
    useGlobalTaskNotifications();

    const sessionStarted = useRef(false);
    useEffect(() => {
        if (sessionStarted.current) return;
        sessionStarted.current = true;
        startSessionTracking();
        void initNotificationPermission();
    }, []);

    const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
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
            const newWidth = Math.min(
                MAX_WIDTH,
                Math.max(MIN_WIDTH, e.clientX),
            );
            setSidebarWidth(newWidth);
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
    }, []);

    return (
        <ErrorBoundary level="root">
            <div className="flex h-screen w-screen overflow-hidden">
                <Sidebar style={{ width: sidebarWidth }} />
                <div
                    onMouseDown={handleMouseDown}
                    className="relative z-10 w-0 cursor-col-resize before:absolute before:-left-1 before:top-0 before:h-full before:w-2 before:content-[''] hover:before:bg-ring/20 active:before:bg-ring/30"
                />
                <main className="flex-1 overflow-hidden h-full">
                    <MainContent />
                </main>
            </div>
        </ErrorBoundary>
    );
}
