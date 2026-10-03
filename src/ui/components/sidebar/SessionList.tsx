import { useMemo } from "react";
import { ChevronRight, Folder } from "lucide-react";
import { useRepos, useSetRepoSidebarOpen } from "@core/api/useRepos";
import { useSessions, useArchiveSession } from "@core/api/useSessions";
import { useAppStore } from "@core/store/app-store";
import {
    errorMessage,
    groupSessionsByRepo,
    type SessionGroup,
} from "@core/utils/sessions";
import { ScrollArea } from "@ui/components/ui/scroll-area";
import { errorToast } from "@ui/lib/toast";
import { cn } from "@ui/lib/utils";
import { SessionItem } from "./SessionItem";

interface SessionListProps {
    onAddFolder: () => void;
}

export function SessionList({ onAddFolder }: SessionListProps) {
    const { data: repos, isLoading: reposLoading } = useRepos();
    const {
        data: sessions,
        error: sessionsError,
        refetch: refetchSessions,
    } = useSessions();
    const selectedSessionId = useAppStore((s) => s.selectedSessionId);
    const setSelectedSession = useAppStore((s) => s.setSelectedSession);
    const setSidebarOpen = useSetRepoSidebarOpen();
    const archiveSession = useArchiveSession();

    const groups = useMemo(
        () => groupSessionsByRepo(repos ?? [], sessions ?? []),
        [repos, sessions],
    );

    if (reposLoading) return null;

    if (groups.length === 0) {
        return (
            <div className="px-[22px] py-2">
                <p className="text-xs text-text-3">No repo folders yet.</p>
                <button
                    type="button"
                    onClick={onAddFolder}
                    className="mt-1.5 text-xs font-medium text-sidebar-foreground underline underline-offset-[3px] hover:text-text-2"
                >
                    Add a folder
                </button>
            </div>
        );
    }

    function handleArchive(sessionId: string) {
        archiveSession.mutate(sessionId, {
            onError: (err) =>
                errorToast(`Couldn't archive: ${errorMessage(err)}`),
        });
    }

    return (
        <ScrollArea className="h-full">
            <div className="flex flex-col gap-1 px-3 pb-3">
                {sessionsError && (
                    <div className="mx-2.5 mb-1 rounded-md border border-line bg-paper px-2.5 py-2">
                        <p className="text-xs text-text-2">
                            Couldn't load reviews.
                        </p>
                        <button
                            type="button"
                            onClick={() => void refetchSessions()}
                            className="mt-0.5 text-xs font-medium underline underline-offset-[3px]"
                        >
                            Retry
                        </button>
                    </div>
                )}
                {groups.map((group) => (
                    <FolderGroup
                        key={group.key}
                        group={group}
                        selectedSessionId={selectedSessionId}
                        onToggle={(open) => {
                            if (group.repo) {
                                setSidebarOpen.mutate({
                                    repoId: group.repo.id,
                                    open,
                                });
                            }
                        }}
                        onSelect={setSelectedSession}
                        onArchive={handleArchive}
                    />
                ))}
            </div>
        </ScrollArea>
    );
}

interface FolderGroupProps {
    group: SessionGroup;
    selectedSessionId: string | undefined;
    onToggle: (open: boolean) => void;
    onSelect: (sessionId: string) => void;
    onArchive: (sessionId: string) => void;
}

function FolderGroup({
    group,
    selectedSessionId,
    onToggle,
    onSelect,
    onArchive,
}: FolderGroupProps) {
    // The "Other" group (sessions without a listed folder) is always open.
    const open = group.repo ? group.repo.sidebarOpen : true;

    return (
        <div className="flex flex-col gap-0.5">
            <button
                type="button"
                onClick={() => onToggle(!open)}
                aria-expanded={open}
                title={group.repo?.path}
                className="flex h-9 items-center gap-2 rounded-[7px] px-2.5 text-left text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
                <ChevronRight
                    className={cn(
                        "h-3 w-3 shrink-0 transition-transform duration-100",
                        open && "rotate-90",
                    )}
                    strokeWidth={2}
                />
                <Folder
                    className="h-[15px] w-[15px] shrink-0"
                    strokeWidth={1.6}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {group.name}
                </span>
                <span className="font-mono text-[11px] text-text-3">
                    {group.sessions.length}
                </span>
            </button>
            {open && (
                <div className="ml-[15px] flex flex-col gap-0.5 border-l border-line pl-[18px]">
                    {group.sessions.length === 0 ? (
                        <p className="px-2.5 py-1.5 text-xs text-text-3">
                            No reviews yet
                        </p>
                    ) : (
                        group.sessions.map((session) => (
                            <SessionItem
                                key={session.id}
                                session={session}
                                isSelected={session.id === selectedSessionId}
                                onSelect={() => onSelect(session.id)}
                                onArchive={() => onArchive(session.id)}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
