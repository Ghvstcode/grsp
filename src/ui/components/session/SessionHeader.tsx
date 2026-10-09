import { ArrowUpRight } from "lucide-react";
import type { Repo, ReviewSession } from "@core/types/grsp";
import {
    commitsGithubUrl,
    commitsLabel,
    commitsRange,
} from "@core/utils/commits";
import { cn } from "@ui/lib/utils";
import { externalLinkClick } from "./lib/openExternal";
import { verdictLabel } from "./lib/review";
import { ciLabel, prOf } from "./lib/status";
import { plural } from "./lib/text";

export type SessionTab = "gist" | "walkthrough" | "review" | "code";

const TABS: { id: SessionTab; label: string }[] = [
    { id: "gist", label: "Gist" },
    { id: "walkthrough", label: "Walkthrough" },
    { id: "review", label: "Review" },
    { id: "code", label: "Code" },
];

const pill = "rounded-full border px-2.5 py-[2px] text-xs";
const headerButton =
    "flex shrink-0 items-center gap-1.5 self-center rounded-lg border px-3 py-2 text-[13px]";

interface SessionHeaderProps {
    session: ReviewSession;
    /** The session's repo folder, for links to its GitHub remote. */
    repo: Repo | undefined;
    /** From discovery; undefined until it has run. */
    mismatchCount: number | undefined;
    tab: SessionTab;
    onTab: (tab: SessionTab) => void;
    /** Tabs are hidden while the session is preparing or failed. */
    showTabs: boolean;
    notesCount: number;
    notesOpen: boolean;
    onToggleNotes: () => void;
}

/**
 * What is being reviewed (`#482`, a short SHA or "5 commits") + title, the
 * meta row, and the Gist · Walkthrough · Review · Code tabs.
 */
export function SessionHeader({
    session,
    repo,
    mismatchCount,
    tab,
    onTab,
    showTabs,
    notesCount,
    notesOpen,
    onToggleNotes,
}: SessionHeaderProps) {
    const pr = prOf(session);
    const commits =
        session.source.kind === "commits" ? session.source : undefined;
    const ci = pr ? ciLabel(session.ci) : undefined;
    const commitsUrl = commitsGithubUrl(session, repo);
    const link = pr
        ? { href: pr.url, label: "Open on GitHub" }
        : commitsUrl && commits
          ? {
                href: commitsUrl,
                label:
                    commits.count === 1
                        ? "Open commit on GitHub"
                        : "Compare on GitHub",
            }
          : undefined;
    return (
        <header className="flex shrink-0 flex-col gap-2.5 border-b px-9 pt-[22px]">
            <div className="flex items-baseline gap-3">
                {pr && (
                    <span className="font-mono text-sm text-muted-foreground">
                        #{pr.number}
                    </span>
                )}
                {commits && (
                    <span
                        className={cn(
                            "shrink-0 text-sm text-muted-foreground",
                            commits.count === 1 && "font-mono",
                        )}
                        title={
                            commits.count === 1
                                ? commits.head
                                : commitsRange(commits)
                        }
                    >
                        {commitsLabel(commits)}
                    </span>
                )}
                <h1 className="m-0 min-w-0 grow text-[22px] font-semibold leading-normal tracking-[-0.02em]">
                    {session.title}
                </h1>
                {showTabs && (
                    <button
                        type="button"
                        onClick={onToggleNotes}
                        aria-pressed={notesOpen}
                        title="Your private notes on this review"
                        className={cn(
                            headerButton,
                            notesOpen
                                ? "border-foreground bg-foreground text-background"
                                : "hover:border-foreground",
                        )}
                    >
                        Notes
                        {notesCount > 0 && (
                            <span
                                className={cn(
                                    "font-mono text-[11px]",
                                    notesOpen
                                        ? "text-background/70"
                                        : "text-muted-foreground",
                                )}
                            >
                                {notesCount}
                            </span>
                        )}
                    </button>
                )}
                {link && (
                    <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={externalLinkClick}
                        className={cn(headerButton, "hover:border-foreground")}
                    >
                        {link.label}
                        <ArrowUpRight size={12} strokeWidth={2} />
                    </a>
                )}
            </div>
            <div className="grsp-text-2 flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-[13px]">
                {pr && session.author && <span>@{session.author}</span>}
                {session.source.kind === "branches" && (
                    <span>Branch comparison</span>
                )}
                {/* A commit's author is a git name, not a GitHub login. */}
                {commits && session.author && <span>{session.author}</span>}
                {commits ? (
                    <span className="font-mono text-xs">
                        {commits.branch ?? commitsRange(commits)}
                    </span>
                ) : (
                    <span className="font-mono text-xs">
                        {session.headRef} → {session.baseRef}
                    </span>
                )}
                {ci && session.ci && (
                    <span className="flex items-center gap-1.5">
                        <span
                            className={cn(
                                "h-[7px] w-[7px] rounded-full border border-foreground",
                                session.ci.state === "passing" &&
                                    "bg-foreground",
                                session.ci.state === "failing" &&
                                    "rounded-none",
                            )}
                            aria-hidden
                        />
                        {ci}
                    </span>
                )}
                <span className="text-muted-foreground">
                    {plural(session.filesChanged, "file")} · +
                    {session.linesAdded} −{session.linesRemoved}
                </span>
                {mismatchCount !== undefined && mismatchCount > 0 && (
                    <span
                        className={cn(
                            pill,
                            "inline-flex items-center gap-1.5 border-foreground bg-foreground text-background",
                        )}
                    >
                        <span
                            aria-hidden
                            className="h-[7px] w-[7px] rounded-full bg-background"
                        />
                        {plural(mismatchCount, "mismatch", "mismatches")}
                    </span>
                )}
                {session.prState !== "open" && (
                    <span className={pill}>
                        {session.prState === "merged" ? "Merged" : "Closed"}
                    </span>
                )}
                {session.postedReview && (
                    <span
                        className={cn(
                            pill,
                            "border-foreground text-foreground",
                        )}
                    >
                        You: {verdictLabel(session.postedReview.event)}
                    </span>
                )}
            </div>
            {showTabs ? (
                <nav className="mt-1 flex gap-7" aria-label="Session views">
                    {TABS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onTab(item.id)}
                            aria-current={tab === item.id ? "page" : undefined}
                            className={cn(
                                "h-10 text-sm",
                                tab === item.id
                                    ? "font-semibold shadow-[inset_0_-2px_0_hsl(var(--foreground))]"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {item.label}
                        </button>
                    ))}
                </nav>
            ) : (
                <div className="h-3" />
            )}
        </header>
    );
}
