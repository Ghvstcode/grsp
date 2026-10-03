import { Reveal } from "./components/reveal";
import { DownloadDropdown } from "./components/download-dropdown";

function Logo({
    size = 20,
    className = "",
}: {
    size?: number;
    className?: string;
}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 42 42"
            fill="none"
            className={className}
        >
            <path
                d="M24.3012 1.73511V19.0934M24.3012 36.4518V19.0934M36.5754 6.81925L12.027 31.3676M24.3012 19.0934L6.94287 19.0934M36.5754 31.3676L12.027 6.81925"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/* ─── Activity Ticker ─── */

const tickerItems = [
    {
        status: "done",
        text: "Added error handling to auth middleware",
        repo: "api-service",
    },
    { status: "active", text: "Scanning for dead code", repo: "web-frontend" },
    {
        status: "done",
        text: "Removed 3 unused exports from helpers.ts",
        repo: "api-service",
    },
    {
        status: "done",
        text: "Fixed N+1 query in user listing",
        repo: "web-frontend",
    },
    {
        status: "active",
        text: "Adding unit tests for payment flow",
        repo: "api-service",
    },
    {
        status: "done",
        text: "Updated stale JSDoc in router module",
        repo: "api-service",
    },
];

function Ticker() {
    const items = [...tickerItems, ...tickerItems];
    return (
        <div className="border-y border-gray-100 overflow-hidden py-3">
            <div className="flex animate-scroll-left whitespace-nowrap">
                {items.map((item, i) => (
                    <span
                        key={i}
                        className="inline-flex items-center gap-2 px-6 text-[12px] mono text-gray-400 shrink-0"
                    >
                        <span
                            className={
                                item.status === "done"
                                    ? "text-emerald-400"
                                    : "text-amber-400"
                            }
                        >
                            {item.status === "done" ? "✓" : "→"}
                        </span>
                        <span>{item.text}</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-300">{item.repo}</span>
                    </span>
                ))}
            </div>
        </div>
    );
}

/* ─── Page ─── */

export default function Home() {
    return (
        <div className="min-h-screen bg-white text-black font-sans">
            {/* ─── Nav ─── */}
            <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
                <div className="max-w-5xl mx-auto flex items-center justify-between px-6 h-[52px]">
                    <a href="/" className="flex items-center gap-2">
                        <Logo size={16} className="animate-slow-spin" />
                        <span className="font-semibold tracking-tight">
                            sustn
                        </span>
                    </a>
                    <div className="flex items-center gap-6">
                        <a
                            href="/changelog"
                            className="text-sm text-gray-400 hover:text-black transition-colors hidden sm:block"
                        >
                            Changelog
                        </a>
                        <a
                            href="/docs"
                            className="text-sm text-gray-400 hover:text-black transition-colors hidden sm:block"
                        >
                            Docs
                        </a>
                        <a
                            href="/docs"
                            className="text-sm text-gray-400 hover:text-black transition-colors hidden sm:block"
                        >
                            How it works
                        </a>
                        <a
                            href="https://github.com/Ghvstcode/sustn"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-black transition-colors hidden sm:block"
                            aria-label="GitHub"
                        >
                            <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                            >
                                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                            </svg>
                        </a>
                        <DownloadDropdown
                            align="right"
                            className="text-sm bg-black text-white font-medium px-3.5 py-1.5 rounded-lg hover:bg-gray-800 transition-colors mono"
                        >
                            Download
                        </DownloadDropdown>
                    </div>
                </div>
            </nav>

            {/* ─── Hero ─── */}
            <header className="relative z-10 pt-32 sm:pt-40 pb-16 sm:pb-20 px-6 sm:px-16">
                <div className="max-w-3xl mx-auto flex flex-col items-center text-center">
                    {/* Logo */}
                    <div className="animate-fade-in-up mb-8">
                        <div className="animate-float">
                            <Logo size={48} className="animate-slow-spin" />
                        </div>
                    </div>

                    {/* Headline */}
                    <h1 className="text-[clamp(2.25rem,6vw,4.25rem)] font-bold tracking-[-0.035em] leading-[1.05] animate-fade-in-up delay-150">
                        Stop prompting.
                        <br />
                        Start approving.
                    </h1>

                    {/* Sub */}
                    <p className="mt-5 text-gray-600 text-lg sm:text-xl leading-relaxed max-w-lg animate-fade-in-up delay-200">
                        Every AI coding tool waits for you to tell it what to
                        do. <span className="font-semibold">sustn</span>{" "}
                        doesn&apos;t. It scans your codebase, finds what needs
                        fixing, and does the work — you just review the&nbsp;PR.
                    </p>

                    {/* CTAs - Conductor style */}
                    <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md animate-fade-in-up delay-300">
                        <DownloadDropdown className="bg-black text-white font-semibold text-sm px-5 py-3 rounded-lg hover:bg-gray-800 transition-colors mono inline-flex items-center justify-between gap-2 w-full">
                            Download for Mac
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth={2}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                />
                            </svg>
                        </DownloadDropdown>
                        <a
                            href="/docs"
                            className="border border-gray-200 bg-white text-black font-semibold text-sm px-5 py-3 rounded-lg hover:bg-gray-50 transition-colors mono inline-flex items-center justify-between gap-2"
                        >
                            Learn how it works
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth={2}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                                />
                            </svg>
                        </a>
                    </div>
                </div>
            </header>

            {/* ─── Video ─── */}
            <section className="pb-16 sm:pb-20 px-6 sm:px-16">
                <Reveal>
                    <div className="relative w-full max-w-3xl mx-auto">
                        <div className="relative pb-[56.25%] h-0 overflow-hidden rounded-lg shadow-lg">
                            <iframe
                                src="https://www.loom.com/embed/c845cfd02d2b4d449637c4938bf03a4b"
                                className="absolute top-0 left-0 w-full h-full border-0"
                                allowFullScreen={true}
                                title="SUSTN Demo Video"
                            />
                        </div>
                    </div>
                </Reveal>
            </section>

            {/* ─── Ticker ─── */}
            <Ticker />

            {/* ════════════════════════════════════════════
                Below here: styled exactly like Zyg
               ════════════════════════════════════════════ */}

            {/* ─── The Shift ─── */}
            <section className="py-16 px-6 sm:px-16 border-t border-gray-100">
                <h2 className="text-xl font-black mb-8 text-center mono tracking-tight underline decoration-2 underline-offset-4">
                    The Shift
                </h2>
                <div className="max-w-3xl mx-auto">
                    <p className="text-gray-700 mb-4 leading-relaxed">
                        There are two ways to work with AI agents.
                    </p>
                    <p className="text-gray-700 mb-4 leading-relaxed">
                        <span className="font-semibold">Reactive:</span> You
                        open a terminal. You describe a task. You wait. You
                        review. You do it again. The agent is powerful but inert
                        — a tool that only moves when you push it. When
                        you&apos;re not prompting, nothing happens. Your
                        subscription tokens expire unused. The work piles up.
                    </p>
                    <p className="text-gray-700 mb-4 leading-relaxed">
                        <span className="font-semibold">Proactive:</span> The
                        agent understands your codebase. It maintains a living
                        backlog of what needs doing. It picks up work when
                        resources are available and delivers results you can
                        approve or discard. You stay in control, but you&apos;re
                        no longer the bottleneck.
                    </p>
                    <p className="text-gray-700 font-semibold">
                        Every AI coding tool today is reactive.{" "}
                        <span className="font-black">sustn</span> isn&apos;t.
                    </p>
                </div>
            </section>

            {/* ─── How it works ─── */}
            <section
                id="how-it-works"
                className="py-16 px-6 sm:px-16 border-t border-gray-100"
            >
                <h2 className="text-xl font-black mb-8 text-center mono tracking-tight underline decoration-2 underline-offset-4">
                    How it works
                </h2>
                <div className="max-w-3xl mx-auto space-y-6">
                    <div className="flex items-start gap-4">
                        <div className="text-lg font-black text-black mono">
                            1.
                        </div>
                        <div>
                            <div className="font-semibold text-lg mb-2">
                                Point it at your repos
                            </div>
                            <p className="text-gray-600 leading-relaxed">
                                Add your repositories and{" "}
                                <span className="font-semibold">sustn</span>{" "}
                                runs a deep scan using Claude Code or Codex. It
                                finds dead code, missing tests, doc drift,
                                security gaps, and tech debt — then ranks
                                everything by impact.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4">
                        <div className="text-lg font-black text-black mono">
                            2.
                        </div>
                        <div>
                            <div className="font-semibold text-lg mb-2">
                                Review, reorder, refine
                            </div>
                            <p className="text-gray-600 leading-relaxed">
                                Your backlog appears as a task list you actually
                                control. Drag tasks to reprioritize. Click into
                                any task to see exactly what the agent found and
                                why it matters. Add your own notes or
                                constraints before work begins.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4">
                        <div className="text-lg font-black text-black mono">
                            3.
                        </div>
                        <div>
                            <div className="font-semibold text-lg mb-2">
                                Work happens automatically
                            </div>
                            <p className="text-gray-600 leading-relaxed">
                                <span className="font-semibold">sustn</span>{" "}
                                monitors your remaining Claude Code or Codex
                                subscription budget and picks up tasks when
                                tokens are available. It works through your
                                backlog continuously — no prompts, no
                                babysitting, no wasted tokens.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4">
                        <div className="text-lg font-black text-black mono">
                            4.
                        </div>
                        <div>
                            <div className="font-semibold text-lg mb-2">
                                Approve and merge
                            </div>
                            <p className="text-gray-600 leading-relaxed">
                                Every completed task lands as a branch. Review
                                the changes, then create a PR with one click —
                                or configure{" "}
                                <span className="font-semibold">sustn</span> to
                                open PRs automatically. Nothing touches main
                                without your say-so.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ─── CTA ─── */}
            <section id="download" className="py-16 px-6 sm:px-16">
                <div className="max-w-3xl mx-auto text-center">
                    <h2 className="text-xl font-black mb-6 mono tracking-tight">
                        Ready to stop being the bottleneck?
                    </h2>
                    <p className="text-lg text-gray-600 mb-8">
                        <span className="font-semibold">sustn</span> runs on the
                        tools you already have. No extra infrastructure
                        required.
                    </p>
                    <DownloadDropdown className="bg-black text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-800 transition-colors inline-flex items-center gap-3 mono">
                        Get Started
                        <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17 8l4 4m0 0l-4 4m4-4H3"
                            />
                        </svg>
                    </DownloadDropdown>
                </div>
            </section>

            {/* ─── Footer ─── */}
            <footer className="py-12 px-6 sm:px-16 border-t border-gray-100">
                <div className="max-w-3xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-2 text-gray-500 font-medium">
                        <Logo size={12} className="animate-slow-spin" />©{" "}
                        {new Date().getFullYear()} sustn
                    </div>
                    <div className="flex gap-8 text-gray-500">
                        <a
                            href="/changelog"
                            className="hover:text-black transition-colors font-medium"
                        >
                            Changelog
                        </a>
                        <a
                            href="/docs"
                            className="hover:text-black transition-colors font-medium"
                        >
                            Docs
                        </a>
                        <a
                            href="https://x.com/sustnapp"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-black transition-colors font-medium"
                        >
                            Follow us on X
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
