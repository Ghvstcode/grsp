import { useEffect } from "react";
import { useAppStore } from "@core/store/app-store";
import { useSessions } from "@core/api/useSessions";
import { EmptyState } from "./EmptyState";
import { SessionView } from "@ui/components/session/SessionView";
import { ErrorBoundary } from "@ui/components/ErrorBoundary";

export function MainContent() {
    const selectedSessionId = useAppStore((s) => s.selectedSessionId);
    const setSelectedSession = useAppStore((s) => s.setSelectedSession);
    const { data: sessions } = useSessions();

    // Drop a remembered selection once its session is gone (archived, or
    // its repo folder was removed).
    const isMissing =
        !!selectedSessionId &&
        !!sessions &&
        !sessions.some((s) => s.id === selectedSessionId);
    useEffect(() => {
        if (isMissing) setSelectedSession(undefined);
    }, [isMissing, setSelectedSession]);

    if (!selectedSessionId || isMissing) {
        return <EmptyState />;
    }

    return (
        <ErrorBoundary
            key={selectedSessionId}
            level="route"
            heading="Review view crashed"
        >
            <SessionView sessionId={selectedSessionId} />
        </ErrorBoundary>
    );
}
