import { useCallback, useState } from "react";
import { Check } from "lucide-react";
import type { CodeRef, NoteAnchor, ReviewSession } from "@core/types/grsp";
import { useAnalyses } from "@core/api/useAnalysis";
import { useNotes } from "@core/api/useNotes";
import { useRepos } from "@core/api/useRepos";
import {
    errorMessage,
    useRefreshSession,
    useSession,
} from "@core/api/useSession";
import { CodeJumpContext, type CodeTarget } from "./code/CodeJumpContext";
import { CodeTab } from "./code/CodeTab";
import { GistTab } from "./gist/GistTab";
import { sourceWording } from "./lib/status";
import { plural } from "./lib/text";
import { NotesPanel } from "./notes/NotesPanel";
import { ReviewTab } from "./review/ReviewTab";
import { SessionHeader, type SessionTab } from "./SessionHeader";
import { SectionError } from "./shared/AnalysisSection";
import { ProgressLine } from "./shared/ProgressLine";
import { useSessionSettings } from "./useSessionSettings";
import { useWalkState } from "./walkthrough/useWalkState";
import { WalkthroughTab } from "./walkthrough/WalkthroughTab";
import "./session.css";

const shell =
    "grsp-session flex h-full min-h-0 min-w-0 flex-col bg-background font-sans text-sm leading-normal text-foreground";

const AGENT_NAMES = { claude: "Claude Code", codex: "Codex" } as const;

/** Plain-language steps while the worktree and diff are built (SPEC §2.2). */
function Preparing({
    session,
    progress,
}: {
    session: ReviewSession;
    progress: string[];
}) {
    const done = progress.slice(0, -1);
    const current = progress.at(-1) ?? "Getting the change ready";
    return (
        <div className="flex grow flex-col gap-4 px-9 pt-8">
            <h2 className="m-0 text-[15px] font-semibold">
                {sourceWording(session).preparing}
            </h2>
            <div className="flex flex-col gap-1.5">
                {done.map((line) => (
                    <div
                        key={line}
                        className="flex min-h-6 items-center gap-2.5 font-mono text-xs text-muted-foreground"
                    >
                        <Check size={12} strokeWidth={2} className="-ml-0.5" />
                        {line}
                    </div>
                ))}
                <ProgressLine text={current} />
            </div>
            <p className="m-0 max-w-[520px] text-[13px] text-muted-foreground">
                grsp checks the change out into a read-only worktree, then your
                agent reads it. Nothing in your working copy is touched.
            </p>
        </div>
    );
}

function StaleBar({
    session,
    onRefresh,
    pending,
}: {
    session: ReviewSession;
    onRefresh: () => void;
    pending: boolean;
}) {
    return (
        <div
            role="status"
            className="grsp-bg-wash flex shrink-0 items-center gap-2 border-b px-9 py-2.5 text-[13px]"
        >
            <span>
                {session.newCommits > 0
                    ? `${plural(session.newCommits, "new commit")} since you started.`
                    : "This change has moved on since you started."}
            </span>
            <button
                type="button"
                onClick={onRefresh}
                disabled={pending}
                className="font-medium underline underline-offset-[3px] disabled:opacity-60"
            >
                {pending ? "Refreshing" : "Refresh analysis."}
            </button>
        </div>
    );
}

function SessionScreen({ sessionId }: { sessionId: string }) {
    const { data: session, error, isLoading, progress } = useSession(sessionId);
    const { data: analyses } = useAnalyses(sessionId);
    const refresh = useRefreshSession(sessionId);
    const settings = useSessionSettings();
    const walk = useWalkState();
    const [tab, setTab] = useState<SessionTab>("gist");
    const { data: repos } = useRepos();
    const notes = useNotes(sessionId, session?.headSha);
    const [notesOpen, setNotesOpen] = useState(false);
    // Where the Code tab is; `nonce` makes a repeated jump scroll again.
    const [codeTarget, setCodeTarget] = useState<
        (CodeTarget & { nonce: number }) | undefined
    >(undefined);
    const showCode = useCallback((target: CodeTarget) => {
        setCodeTarget((current) => ({
            ...target,
            nonce: (current?.nonce ?? 0) + 1,
        }));
    }, []);
    const jumpToCode = useCallback(
        (target: CodeTarget) => {
            showCode(target);
            setTab("code");
        },
        [showCode],
    );

    if (!session) {
        return (
            <div className={shell}>
                <div className="px-9 pt-8">
                    {isLoading ? (
                        <ProgressLine text="Opening the session" />
                    ) : (
                        <SectionError
                            title="This session couldn't be opened."
                            message={error ? errorMessage(error) : undefined}
                        />
                    )}
                </div>
            </div>
        );
    }

    const discovery = analyses?.discovery;
    const mismatchCount =
        discovery?.status === "done"
            ? discovery.result?.mismatches.length
            : undefined;
    const usable = session.status === "ready" || session.status === "stale";
    const openWalk = (entryPointId: string, refs?: CodeRef[]) => {
        walk.openEntry(entryPointId, refs);
        setTab("walkthrough");
    };
    const repo = repos?.find((r) => r.id === session.repoId);
    const jumpToAnchor = (anchor: NoteAnchor) => {
        if (anchor.kind === "line") {
            jumpToCode({
                file: anchor.file,
                line: anchor.line,
                side: anchor.side,
            });
        } else {
            walk.openBlock(anchor.entryPointId, anchor.blockId);
            setTab("walkthrough");
        }
    };

    return (
        <div className={shell}>
            <SessionHeader
                session={session}
                repo={repo}
                mismatchCount={mismatchCount}
                tab={tab}
                onTab={setTab}
                showTabs={usable}
                notesCount={notes.notes.length}
                notesOpen={notesOpen}
                onToggleNotes={() => setNotesOpen((open) => !open)}
            />
            {session.status === "stale" && (
                <StaleBar
                    session={session}
                    onRefresh={() => refresh.mutate()}
                    pending={refresh.isPending}
                />
            )}
            <div className="flex min-h-0 min-w-0 grow">
                {session.status === "preparing" && (
                    <Preparing session={session} progress={progress} />
                )}
                {session.status === "error" && (
                    <div className="grow px-9 pt-8">
                        <SectionError
                            title="This change couldn't be prepared."
                            message={session.error}
                            onRetry={() => refresh.mutate()}
                        />
                    </div>
                )}
                {session.status === "closed" && (
                    <p className="m-0 px-9 pt-8 text-muted-foreground">
                        This session is archived.
                    </p>
                )}
                <CodeJumpContext.Provider value={jumpToCode}>
                    {usable && tab === "gist" && (
                        <GistTab
                            session={session}
                            analyses={analyses}
                            settings={settings}
                            onWalk={openWalk}
                            showAsk={!notesOpen}
                        />
                    )}
                    {usable && tab === "walkthrough" && (
                        <WalkthroughTab
                            session={session}
                            analyses={analyses}
                            settings={settings}
                            walk={walk}
                            notes={notes}
                            onOpenCode={() => setTab("code")}
                        />
                    )}
                    {usable && tab === "review" && (
                        <ReviewTab session={session} settings={settings} />
                    )}
                    {usable && tab === "code" && (
                        <CodeTab
                            session={session}
                            target={codeTarget}
                            onTarget={showCode}
                            notes={notes}
                        />
                    )}
                </CodeJumpContext.Provider>
                {usable && notesOpen && (
                    <NotesPanel
                        session={session}
                        repoName={
                            repo?.remote
                                ? `${repo.remote.owner}/${repo.remote.name}`
                                : repo?.name
                        }
                        notes={notes}
                        onClose={() => setNotesOpen(false)}
                        onJump={jumpToAnchor}
                    />
                )}
            </div>
            <footer className="flex h-8 shrink-0 items-center gap-2 border-t px-9 text-[11px] text-muted-foreground">
                <span>
                    {plural(session.agentPasses, "agent pass", "agent passes")}
                </span>
                {session.headSha && (
                    <>
                        <span aria-hidden>·</span>
                        <span className="font-mono">
                            {session.headSha.slice(0, 7)}
                        </span>
                    </>
                )}
                <span className="ml-auto">
                    Runs on your {AGENT_NAMES[settings.agent]} subscription
                </span>
            </footer>
        </div>
    );
}

/**
 * One review session: header, then Gist · Walkthrough · Review · Code, with
 * the reader's notes on the right of any of them. The shell
 * renders this in the main area for the selected session.
 */
export function SessionView({ sessionId }: { sessionId: string }) {
    // Keyed so tab, walkthrough position and drafts reset per session.
    return <SessionScreen key={sessionId} sessionId={sessionId} />;
}
