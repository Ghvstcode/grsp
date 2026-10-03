import { Reveal } from "./components/reveal";
import { DownloadDropdown } from "./components/download-dropdown";
import { GITHUB_URL, GitHubIcon, Logo } from "./components/logo";
import {
    GistMock,
    NewReviewMock,
    ReviewMock,
    WalkthroughMock,
} from "./components/mocks";

/* ─── Activity Ticker ─── */

const tickerItems = [
    {
        status: "done",
        text: "41 references verified against the worktree",
        repo: "orders-api",
    },
    {
        status: "active",
        text: "Reading orders/services.py",
        repo: "orders-api",
    },
    {
        status: "done",
        text: "Found 1 mismatch between the description and the code",
        repo: "orders-api",
    },
    {
        status: "done",
        text: "Traced POST /orders → ApprovalPolicy.check",
        repo: "orders-api",
    },
    {
        status: "active",
        text: "Searching for bulk_create",
        repo: "orders-api",
    },
    {
        status: "done",
        text: "Dropped 2 references that didn't match the code",
        repo: "payments-service",
    },
    {
        status: "done",
        text: "Review posted · 3 comments",
        repo: "web-dashboard",
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
                                    ? "text-black"
                                    : "text-gray-400"
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

function Step({
    number,
    title,
    children,
    visual,
}: {
    number: number;
    title: string;
    children: React.ReactNode;
    visual: React.ReactNode;
}) {
    return (
        <div>
            <div className="max-w-3xl mx-auto flex items-start gap-4">
                <div className="text-lg font-black text-black mono">
                    {number}.
                </div>
                <div>
                    <div className="font-semibold text-lg mb-2">{title}</div>
                    <p className="text-gray-600 leading-relaxed">{children}</p>
                </div>
            </div>
            <Reveal className="mt-8">{visual}</Reveal>
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
                            grsp
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
                            href="#how-it-works"
                            className="text-sm text-gray-400 hover:text-black transition-colors hidden sm:block"
                        >
                            How it works
                        </a>
                        <a
                            href={GITHUB_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-black transition-colors hidden sm:block"
                            aria-label="GitHub"
                        >
                            <GitHubIcon />
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
                        Stop reading diffs.
                        <br />
                        Understand the change.
                    </h1>

                    {/* Sub */}
                    <p className="mt-5 text-gray-600 text-lg sm:text-xl leading-relaxed max-w-xl animate-fade-in-up delay-200">
                        A diff shows you which lines moved.{" "}
                        <span className="font-semibold">grsp</span> shows you
                        what the system does differently now: what a pull
                        request actually changes, the paths it forgot, and
                        whether the description is&nbsp;true.
                    </p>

                    {/* CTAs */}
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

                    <p className="mt-4 text-[12px] text-gray-400 mono animate-fade-in-up delay-400">
                        Runs on your Claude Code or Codex subscription. No API
                        keys.
                    </p>
                </div>
            </header>

            {/* ─── Product ─── */}
            <section className="pb-16 sm:pb-20 px-4 sm:px-10">
                <Reveal>
                    <div className="w-full max-w-6xl mx-auto">
                        <GistMock />
                    </div>
                </Reveal>
            </section>

            {/* ─── Ticker ─── */}
            <Ticker />

            {/* ─── The Shift ─── */}
            <section className="py-16 px-6 sm:px-16">
                <h2 className="text-xl font-black mb-8 text-center mono tracking-tight underline decoration-2 underline-offset-4">
                    The Shift
                </h2>
                <div className="max-w-3xl mx-auto">
                    <p className="text-gray-700 mb-4 leading-relaxed">
                        There are two ways to review a pull request.
                    </p>
                    <p className="text-gray-700 mb-4 leading-relaxed">
                        <span className="font-semibold">Reading:</span> You
                        scroll the diff top to bottom, file by file, in
                        alphabetical order. You rebuild the call graph in your
                        head. You take the description&apos;s word for
                        everything the diff doesn&apos;t show. And the code that
                        should have changed and didn&apos;t isn&apos;t in the
                        diff at all, so you never see it.
                    </p>
                    <p className="text-gray-700 mb-4 leading-relaxed">
                        <span className="font-semibold">Understanding:</span>{" "}
                        You start from behaviour. Which entry points act
                        differently now? What path does a request take, and
                        where does it branch? Does the code do what the author
                        says it does? What else writes to the same table? Then
                        you review, knowing what you&apos;re looking at.
                    </p>
                    <p className="text-gray-700 font-semibold">
                        AI made writing code fast. Reviewing it is still
                        reading. <span className="font-black">grsp</span> is for
                        understanding.
                    </p>
                </div>
            </section>

            {/* ─── How it works ─── */}
            <section
                id="how-it-works"
                className="py-16 px-6 sm:px-16 border-t border-gray-100 scroll-mt-12"
            >
                <h2 className="text-xl font-black mb-10 text-center mono tracking-tight underline decoration-2 underline-offset-4">
                    How it works
                </h2>
                <div className="space-y-16">
                    <Step
                        number={1}
                        title="Point it at a PR"
                        visual={
                            <div className="max-w-xl mx-auto">
                                <NewReviewMock />
                            </div>
                        }
                    >
                        Paste a GitHub PR URL, pick from a repo&apos;s open PRs,
                        or choose two branches.{" "}
                        <span className="font-semibold">grsp</span> fetches the
                        refs and checks out a read-only worktree at the PR head,
                        then lets your own Claude Code or Codex explore it.
                        Nothing is uploaded and nothing is modified.
                    </Step>

                    <Step
                        number={2}
                        title="See what it actually does"
                        visual={
                            <div className="max-w-5xl mx-auto">
                                <WalkthroughMock />
                            </div>
                        }
                    >
                        The Gist puts &ldquo;Author says&rdquo; next to
                        &ldquo;Code does&rdquo; and calls out where they
                        disagree. It lists every entry point whose behaviour
                        changes, including the ones the PR should have touched
                        and didn&apos;t. Open any of them and step through the
                        change like a debugger: route, service, policy, write,
                        event. Change the input and watch the path re-route. Or
                        just ask, and get an answer with the code it came from.
                    </Step>

                    <Step
                        number={3}
                        title="Review with confidence"
                        visual={
                            <div className="max-w-3xl mx-auto">
                                <ReviewMock />
                            </div>
                        }
                    >
                        Run an AI review with your own prompt. Each finding
                        comes with its severity, the code, and a comment you can
                        edit or leave out. Pick a verdict and{" "}
                        <span className="font-semibold">grsp</span> posts it to
                        GitHub as a normal review, inline where the line is part
                        of the diff.
                    </Step>
                </div>
            </section>

            {/* ─── Trust ─── */}
            <section className="py-16 px-6 sm:px-16 border-t border-gray-100">
                <h2 className="text-xl font-black mb-8 text-center mono tracking-tight underline decoration-2 underline-offset-4">
                    The agent discovers. Git confirms.
                </h2>
                <div className="max-w-3xl mx-auto">
                    <p className="text-gray-700 mb-4 leading-relaxed">
                        Your agent does the understanding.{" "}
                        <span className="font-semibold">grsp</span> checks its
                        work. Every{" "}
                        <span className="mono text-[0.9em]">file:line</span> the
                        agent returns is verified against the worktree before
                        you see it. What changed, the line numbers and every
                        code excerpt come from git, never from the model. A
                        claim that can&apos;t be verified is dropped, and the
                        Gist tells you how many were.
                    </p>
                    <p className="text-gray-700 mb-8 leading-relaxed">
                        There&apos;s no language parser inside, so it works on
                        any codebase your agent can read.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                        {[
                            [
                                "Your subscription",
                                "Runs on the Claude Code or Codex subscription you already have. No API keys, no second bill.",
                            ],
                            [
                                "Your machine",
                                "A local, read-only worktree. No code leaves your Mac except through your own agent.",
                            ],
                            [
                                "Your call",
                                "Nothing is posted until you press Post. Every comment is yours to edit first.",
                            ],
                        ].map(([title, body]) => (
                            <div key={title} className="bg-white p-5">
                                <div className="font-semibold mono text-sm mb-1.5">
                                    {title}
                                </div>
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    {body}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─── CTA ─── */}
            <section
                id="download"
                className="py-16 px-6 sm:px-16 border-t border-gray-100 scroll-mt-12"
            >
                <div className="max-w-3xl mx-auto text-center">
                    <h2 className="text-xl font-black mb-6 mono tracking-tight">
                        Ready to understand the next PR?
                    </h2>
                    <p className="text-lg text-gray-600 mb-8">
                        <span className="font-semibold">grsp</span> runs on the
                        Claude Code or Codex subscription you already have. No
                        API keys. No extra infrastructure.
                    </p>
                    <DownloadDropdown className="bg-black text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-800 transition-colors inline-flex items-center gap-3 mono">
                        Download for Mac
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
                        {new Date().getFullYear()} grsp
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
                            href={GITHUB_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-black transition-colors font-medium"
                        >
                            GitHub
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
