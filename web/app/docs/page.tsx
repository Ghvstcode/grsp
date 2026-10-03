"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Logo } from "../components/logo";

/* ────────────────────────────────────────
   Types
   ──────────────────────────────────────── */

interface NavItem {
    id: string;
    title: string;
    children?: { id: string; title: string }[];
}

/* ────────────────────────────────────────
   Navigation Structure
   ──────────────────────────────────────── */

const navigation: NavItem[] = [
    { id: "introduction", title: "Introduction" },
    {
        id: "getting-started",
        title: "Getting Started",
        children: [
            { id: "installation", title: "Install" },
            { id: "onboarding", title: "Onboarding" },
            { id: "agents", title: "Agents" },
            { id: "github", title: "GitHub via gh" },
            { id: "first-review", title: "Your first review" },
        ],
    },
    {
        id: "how-it-works",
        title: "How it works",
        children: [
            { id: "agent-first", title: "Agent-first" },
            { id: "verification", title: "Verification" },
            { id: "passes", title: "What runs when" },
            { id: "caching", title: "What's cached" },
            { id: "cost", title: "Cost" },
        ],
    },
    {
        id: "tabs",
        title: "The three tabs",
        children: [
            { id: "gist", title: "Gist" },
            { id: "ask", title: "Ask" },
            { id: "walkthrough", title: "Walkthrough" },
            { id: "review", title: "Review" },
        ],
    },
    {
        id: "settings",
        title: "Settings",
        children: [
            { id: "review-prompt", title: "Review prompt" },
            { id: "repo-prompt", title: ".grsp/prompt.md" },
            { id: "excludes", title: ".grsp/config.toml" },
            { id: "agent-settings", title: "Agent" },
            { id: "analysis-settings", title: "Analysis" },
            { id: "hosts-repos", title: "Hosts & repositories" },
        ],
    },
    { id: "privacy", title: "Privacy" },
    { id: "faq", title: "FAQ" },
];

/* ────────────────────────────────────────
   Helper Components
   ──────────────────────────────────────── */

function CodeBlock({ children, title }: { children: string; title?: string }) {
    return (
        <div className="my-4 rounded-lg overflow-hidden border border-gray-200">
            {title && (
                <div className="bg-gray-50 px-4 py-2 text-xs mono text-gray-500 border-b border-gray-200">
                    {title}
                </div>
            )}
            <pre className="bg-white text-gray-900 p-4 overflow-x-auto text-[13px] leading-relaxed">
                <code className="mono">{children}</code>
            </pre>
        </div>
    );
}

function Code({ children }: { children: ReactNode }) {
    return (
        <code className="mono text-[0.85em] bg-gray-100 px-1 py-0.5 rounded">
            {children}
        </code>
    );
}

function Callout({ title, children }: { title?: string; children: ReactNode }) {
    return (
        <div className="my-6 rounded-lg border border-black bg-gray-50 p-4">
            {title && (
                <div className="font-semibold mb-1 text-sm text-black">
                    {title}
                </div>
            )}
            <div className="text-sm text-gray-700 leading-relaxed">
                {children}
            </div>
        </div>
    );
}

function FlowStep({
    number,
    title,
    description,
    isLast = false,
}: {
    number: number;
    title: string;
    description: string;
    isLast?: boolean;
}) {
    return (
        <div className="flex gap-4">
            <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-sm font-bold mono shrink-0">
                    {number}
                </div>
                {!isLast && <div className="w-px flex-1 bg-gray-200 my-1" />}
            </div>
            <div className={isLast ? "pb-0" : "pb-8"}>
                <div className="font-semibold text-black">{title}</div>
                <p className="text-gray-600 text-sm leading-relaxed mt-1">
                    {description}
                </p>
            </div>
        </div>
    );
}

type ChipTone = "new" | "changed" | "unchanged" | "gap";

function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
    const styles: Record<ChipTone, string> = {
        new: "bg-black text-white border border-black",
        changed: "border border-black text-black",
        unchanged: "border border-gray-200 text-gray-500",
        gap: "border border-dashed border-black text-black",
    };
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] uppercase tracking-wide mono whitespace-nowrap ${styles[tone]}`}
        >
            {children}
        </span>
    );
}

function FeatureCard({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    return (
        <div className="border border-gray-200 rounded-lg p-4 hover:border-gray-400 transition-colors">
            <div className="font-semibold text-sm mb-1">{title}</div>
            <p className="text-gray-500 text-sm leading-relaxed">
                {description}
            </p>
        </div>
    );
}

function Faq({
    question,
    children,
}: {
    question: string;
    children: ReactNode;
}) {
    return (
        <div className="py-5 border-b border-gray-100 last:border-b-0">
            <div className="font-semibold text-black mb-1.5">{question}</div>
            <div className="text-sm text-gray-600 leading-relaxed">
                {children}
            </div>
        </div>
    );
}

/* ────────────────────────────────────────
   Main Page
   ──────────────────────────────────────── */

export default function DocsPage() {
    const [activeSection, setActiveSection] = useState("introduction");
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const allIds = navigation.flatMap((n) => [
            n.id,
            ...(n.children?.map((c) => c.id) ?? []),
        ]);

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((e) => e.isIntersecting);
                if (visible.length > 0) {
                    setActiveSection(visible[0].target.id);
                }
            },
            { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
        );

        allIds.forEach((id) => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, []);

    const scrollTo = useCallback((id: string) => {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: "smooth" });
            setSidebarOpen(false);
        }
    }, []);

    const isActive = (item: NavItem) => {
        if (item.id === activeSection) return true;
        return item.children?.some((c) => c.id === activeSection) ?? false;
    };

    return (
        <div className="min-h-screen bg-white text-black">
            {/* ─── Nav ─── */}
            <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
                <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-[52px]">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="lg:hidden -ml-1 p-1 rounded hover:bg-gray-100"
                            aria-label="Toggle navigation"
                        >
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                {sidebarOpen ? (
                                    <path
                                        strokeLinecap="round"
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                ) : (
                                    <path
                                        strokeLinecap="round"
                                        d="M4 6h16M4 12h16M4 18h16"
                                    />
                                )}
                            </svg>
                        </button>
                        <a href="/" className="flex items-center gap-2">
                            <Logo size={16} className="animate-slow-spin" />
                            <span className="font-semibold tracking-tight">
                                grsp
                            </span>
                        </a>
                        <span className="text-gray-300">/</span>
                        <span className="text-sm text-gray-500 mono">docs</span>
                    </div>
                    <a
                        href="/"
                        className="text-sm text-gray-400 hover:text-black transition-colors hidden sm:flex items-center gap-1"
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M10 19l-7-7m0 0l7-7m-7 7h18"
                            />
                        </svg>
                        Back to home
                    </a>
                </div>
            </nav>

            {/* ─── Mobile Sidebar Overlay ─── */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/20 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* ─── Sidebar ─── */}
            <aside
                className={`fixed top-[52px] bottom-0 left-0 z-40 w-64 bg-gray-50/80 backdrop-blur-xl border-r border-gray-100 overflow-y-auto transition-transform duration-300 lg:translate-x-0 ${
                    sidebarOpen ? "translate-x-0" : "-translate-x-full"
                }`}
            >
                <nav className="p-4 pt-6">
                    <ul className="space-y-1">
                        {navigation.map((item) => (
                            <li key={item.id}>
                                <button
                                    onClick={() => scrollTo(item.id)}
                                    className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                                        isActive(item)
                                            ? "text-black font-semibold bg-gray-100"
                                            : "text-gray-500 hover:text-black hover:bg-gray-100/50"
                                    }`}
                                >
                                    {item.title}
                                </button>
                                {item.children && (
                                    <ul className="ml-3 mt-1 space-y-0.5 border-l border-gray-200 pl-3">
                                        {item.children.map((child) => (
                                            <li key={child.id}>
                                                <button
                                                    onClick={() =>
                                                        scrollTo(child.id)
                                                    }
                                                    className={`w-full text-left px-2 py-1 rounded text-[13px] transition-colors ${
                                                        activeSection ===
                                                        child.id
                                                            ? "text-black font-medium"
                                                            : "text-gray-400 hover:text-gray-700"
                                                    }`}
                                                >
                                                    {child.title}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        ))}
                    </ul>
                </nav>
            </aside>

            {/* ─── Content ─── */}
            <main className="lg:pl-64 pt-[52px]">
                <div className="max-w-3xl mx-auto px-6 sm:px-12 py-12 sm:py-16">
                    {/* === INTRODUCTION === */}
                    <section id="introduction" className="docs-section">
                        <div className="mb-8">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-xs mono text-gray-500 mb-4">
                                Early Access
                            </div>
                            <h1 className="text-4xl sm:text-5xl font-bold tracking-[-0.035em] leading-[1.1]">
                                Documentation
                            </h1>
                            <p className="mt-4 text-lg text-gray-500 leading-relaxed max-w-2xl">
                                Everything you need to know about grsp, the
                                macOS app for understanding pull requests
                                instead of reading diffs.
                            </p>
                        </div>

                        <h2 className="section-heading">What is grsp?</h2>
                        <p className="docs-p">
                            <strong>grsp</strong> is a native macOS app that
                            opens a pull request and tells you what it actually
                            does. You point it at a PR. It checks the PR out
                            into a read-only worktree, lets the Claude Code or
                            Codex you already have explore the change, and
                            checks every claim the agent makes against git
                            before showing it to you.
                        </p>
                        <p className="docs-p">
                            You get three views of the same change: a{" "}
                            <strong>Gist</strong> that compares what the author
                            says with what the code does, a{" "}
                            <strong>Walkthrough</strong> that steps through the
                            changed behaviour like a debugger, and a{" "}
                            <strong>Review</strong> you can edit and post back
                            to GitHub.
                        </p>

                        <h3 className="subsection-heading">Why</h3>
                        <p className="docs-p">
                            A diff is ordered by file name, not by what happens.
                            It shows the lines that changed and hides everything
                            else: the callers, the other code that writes to the
                            same table, the job that should have been updated
                            and wasn&apos;t. Reviewing by reading means
                            rebuilding all of that in your head and trusting the
                            description for the rest.
                        </p>
                        <p className="docs-p">
                            grsp starts from behaviour instead. Which entry
                            points act differently now? What path does a request
                            take? Does the code do what the description says?
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-8">
                            <FeatureCard
                                title="Author says vs Code does"
                                description="The description next to a plain-language summary of the behaviour, with a callout when they disagree."
                            />
                            <FeatureCard
                                title="What's affected"
                                description="Every entry point whose behaviour changes, and the ones the PR should have touched and didn't."
                            />
                            <FeatureCard
                                title="Step-through walkthroughs"
                                description="Route, service, policy, write, event. Each block has a note, its code, and the branch that's taken."
                            />
                            <FeatureCard
                                title="Ask anything"
                                description="Answers grounded in the code, with an excerpt and file:line references you can check."
                            />
                            <FeatureCard
                                title="Review you control"
                                description="AI findings with your own prompt. Edit, exclude, pick a verdict, post to GitHub."
                            />
                            <FeatureCard
                                title="Verified, not trusted"
                                description="Every reference the agent returns is checked against the worktree. What fails is dropped."
                            />
                        </div>
                    </section>

                    <hr className="section-divider" />

                    {/* === GETTING STARTED === */}
                    <section id="getting-started" className="docs-section">
                        <h2 className="section-heading">Getting Started</h2>
                        <p className="docs-p">
                            You need a Mac, a coding agent you&apos;re already
                            signed in to, and (for GitHub pull requests) the
                            GitHub CLI. There are no API keys to create and
                            nothing to configure per project.
                        </p>
                        <div className="my-6 overflow-x-auto">
                            <table className="docs-table">
                                <thead>
                                    <tr>
                                        <th>Requirement</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="font-medium">macOS</td>
                                        <td className="text-gray-600">
                                            Apple Silicon or Intel
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="font-medium">
                                            Claude Code or Codex
                                        </td>
                                        <td className="text-gray-600">
                                            Installed and signed in with your
                                            subscription. One is enough.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="font-medium">Git</td>
                                        <td className="text-gray-600">
                                            Your repos are local clones
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="font-medium">
                                            GitHub CLI (<Code>gh</Code>)
                                        </td>
                                        <td className="text-gray-600">
                                            Optional. Needed for PR sessions,
                                            the discussion and posting reviews.
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section id="installation" className="docs-section">
                        <h3 className="subsection-heading">Install</h3>
                        <p className="docs-p">
                            Download the <Code>.dmg</Code> for your Mac from the{" "}
                            <a href="/#download" className="underline">
                                home page
                            </a>
                            , open it and drag grsp into Applications. The app
                            updates itself.
                        </p>
                        <p className="docs-p">Or build it from source:</p>
                        <CodeBlock title="Terminal">
                            {`git clone https://github.com/ghvstcode/grsp.git
cd grsp
pnpm install
pnpm tauri:dev`}
                        </CodeBlock>
                        <p className="docs-p">
                            Building needs Node.js 22+, pnpm and stable Rust.
                        </p>
                    </section>

                    <section id="onboarding" className="docs-section">
                        <h3 className="subsection-heading">Onboarding</h3>
                        <p className="docs-p">
                            The first launch walks you through five short steps.
                        </p>
                        <div className="my-6">
                            <FlowStep
                                number={1}
                                title="Welcome"
                                description="What grsp does and what it needs from you."
                            />
                            <FlowStep
                                number={2}
                                title="Agent"
                                description="grsp looks for Claude Code and Codex and shows what it found. Pick one. If neither is installed you get install instructions and a Re-check button; you can't continue without an agent."
                            />
                            <FlowStep
                                number={3}
                                title="Connect GitHub"
                                description="Checks that gh is installed and signed in. You can skip this; grsp is then limited to comparing two branches."
                            />
                            <FlowStep
                                number={4}
                                title="Add a repo folder"
                                description="Choose a local clone. It has to be a git repository. The GitHub owner and name are read from its origin remote."
                            />
                            <FlowStep
                                number={5}
                                title="Open a PR"
                                description="Optionally start your first review straight away from that repo's open pull requests."
                                isLast
                            />
                        </div>
                    </section>

                    <section id="agents" className="docs-section">
                        <h3 className="subsection-heading">Agents</h3>
                        <p className="docs-p">
                            grsp doesn&apos;t talk to a model API. It runs the
                            agent CLI you already use, headless and read-only,
                            with its working directory set to the PR&apos;s
                            worktree.
                        </p>
                        <div className="my-6 overflow-x-auto">
                            <table className="docs-table">
                                <thead>
                                    <tr>
                                        <th>Agent</th>
                                        <th>Runs as</th>
                                        <th>Restricted to</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="font-medium">
                                            Claude Code
                                        </td>
                                        <td>
                                            <Code>claude -p</Code>
                                        </td>
                                        <td className="text-gray-600">
                                            Read, search and list tools. No
                                            editing, no shell.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="font-medium">Codex</td>
                                        <td>
                                            <Code>codex exec</Code>
                                        </td>
                                        <td className="text-gray-600">
                                            Its read-only sandbox.
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p className="docs-p">
                            Detection checks your <Code>PATH</Code> and then the
                            usual install locations (<Code>~/.local/bin</Code>,{" "}
                            <Code>/opt/homebrew/bin</Code>, node version
                            managers). If the agent isn&apos;t installed or
                            isn&apos;t signed in, grsp says so in onboarding and
                            in Settings and tells you what to run:
                        </p>
                        <CodeBlock title="Terminal">
                            {`# Claude Code
claude            # then /login

# Codex
codex login`}
                        </CodeBlock>
                    </section>

                    <section id="github" className="docs-section">
                        <h3 className="subsection-heading">
                            GitHub via <span className="mono">gh</span>
                        </h3>
                        <p className="docs-p">
                            grsp uses the GitHub CLI for everything it does on
                            GitHub: listing open PRs, reading PR metadata, CI
                            status and review threads, and posting your review.
                            It uses the account <Code>gh</Code> is signed in to,
                            so grsp itself stores no GitHub token.
                        </p>
                        <CodeBlock title="Terminal">
                            {`brew install gh
gh auth login`}
                        </CodeBlock>
                        <p className="docs-p">
                            Without <Code>gh</Code> you can still compare two
                            branches of any repository, on any git host. That
                            mode has no discussion and no posting, and the app
                            says so where those features would appear.
                        </p>
                    </section>

                    <section id="first-review" className="docs-section">
                        <h3 className="subsection-heading">
                            Your first review
                        </h3>
                        <p className="docs-p">
                            Press <strong>New review</strong> in the sidebar.
                            There are three ways to start a session:
                        </p>
                        <ul className="docs-list">
                            <li>
                                <strong>Paste a URL.</strong>{" "}
                                <Code>
                                    https://github.com/owner/repo/pull/123
                                </Code>
                                , with or without <Code>/files</Code> on the
                                end. If you haven&apos;t added that repo&apos;s
                                folder yet, grsp asks you to.
                            </li>
                            <li>
                                <strong>Pick an open PR</strong> from the list
                                for a repo you&apos;ve added.
                            </li>
                            <li>
                                <strong>Choose two branches</strong>, local or
                                remote, as base and head.
                            </li>
                        </ul>
                        <p className="docs-p">
                            grsp fetches the refs, creates the worktree, works
                            out what changed against the merge base, and starts
                            the first analysis. Each step is shown in plain
                            language as it happens, and each section of the Gist
                            appears as soon as it&apos;s ready.
                        </p>
                        <p className="docs-p">
                            If the author pushes while you&apos;re reviewing,
                            the session shows a bar like &ldquo;3 new commits
                            since you started. Refresh analysis.&rdquo; Nothing
                            re-runs until you press it.
                        </p>
                    </section>

                    <hr className="section-divider" />

                    {/* === HOW IT WORKS === */}
                    <section id="how-it-works" className="docs-section">
                        <h2 className="section-heading">How it works</h2>
                        <Callout title="The rule">
                            <strong>
                                The agent discovers and interprets. git and the
                                worktree confirm.
                            </strong>{" "}
                            Change status, line numbers, code excerpts, comment
                            threads and CI are never taken from agent output.
                            Every <Code>file:line</Code> the agent returns is
                            verified before it&apos;s shown.
                        </Callout>
                    </section>

                    <section id="agent-first" className="docs-section">
                        <h3 className="subsection-heading">Agent-first</h3>
                        <p className="docs-p">
                            All of the understanding is done by your coding
                            agent. It explores the worktree, finds the entry
                            points, traces paths, spots gaps, answers questions
                            and reviews. grsp itself has no language parser and
                            no framework detection, which is why it works on any
                            repository your agent can read, in any language,
                            with no per-project setup.
                        </p>
                        <p className="docs-p">
                            Around the agent, grsp&apos;s Rust core provides
                            three things:
                        </p>
                        <ul className="docs-list">
                            <li>
                                <strong>Git facts.</strong> What changed and
                                exactly where, computed from the merge base so
                                changes on the base branch don&apos;t leak into
                                the PR.
                            </li>
                            <li>
                                <strong>Verification.</strong> Every claim about
                                the code is checked against the worktree and the
                                diff.
                            </li>
                            <li>
                                <strong>Orchestration.</strong> Worktrees,
                                caching, progress, cancellation and GitHub.
                            </li>
                        </ul>
                        <CodeBlock title="Every analysis">
                            {`build the prompt → run the agent → parse JSON → verify → save → show`}
                        </CodeBlock>
                    </section>

                    <section id="verification" className="docs-section">
                        <h3 className="subsection-heading">Verification</h3>
                        <p className="docs-p">
                            The agent is asked to back every claim with a code
                            reference: a file, a line, and a short{" "}
                            <em>anchor</em> copied from that line, such as a
                            function name or{" "}
                            <Code>order.total &gt; THRESHOLD</Code>. grsp then
                            checks each one.
                        </p>
                        <div className="my-6 overflow-x-auto">
                            <table className="docs-table">
                                <thead>
                                    <tr>
                                        <th>Outcome</th>
                                        <th>When</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="font-medium">
                                            Verified
                                        </td>
                                        <td className="text-gray-600">
                                            The file exists, the lines are in
                                            range, and the anchor is on that
                                            line or within 2 lines of it.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="font-medium">Snapped</td>
                                        <td className="text-gray-600">
                                            The anchor is found within 10 lines.
                                            The reference is moved to where the
                                            code really is and counts as
                                            verified.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="font-medium">Dropped</td>
                                        <td className="text-gray-600">
                                            Anything else: a file that
                                            doesn&apos;t exist, a line out of
                                            range, an anchor that isn&apos;t
                                            there.
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p className="docs-p">
                            A mismatch, a gap or a review finding with no
                            verified reference is never shown. Softer claims
                            that are still useful without one stay visible and
                            are marked unverified.
                        </p>
                        <p className="docs-p">
                            The same goes for everything else you see about the
                            code:
                        </p>
                        <ul className="docs-list">
                            <li>
                                <strong>Change status</strong> is computed from
                                the diff, not reported by the agent:{" "}
                                <Chip tone="new">New</Chip>{" "}
                                <Chip tone="changed">Changed</Chip>{" "}
                                <Chip tone="unchanged">Unchanged</Chip>{" "}
                                <Chip tone="gap">Not covered</Chip>. A
                                &ldquo;gap&rdquo; that turns out to be part of
                                the diff isn&apos;t a gap.
                            </li>
                            <li>
                                <strong>Code excerpts</strong> are read from the
                                worktree by grsp. The agent never supplies code
                                text.
                            </li>
                            <li>
                                <strong>Edges</strong> between walkthrough
                                blocks are spot-checked: if block A is said to
                                call block B, A&apos;s code has to mention B.
                                Edges that can&apos;t be confirmed are drawn
                                dotted.
                            </li>
                            <li>
                                <strong>Discussion and CI</strong> come from the
                                GitHub API. The agent only summarises them.
                            </li>
                        </ul>
                        <p className="docs-p">
                            Under &ldquo;Code does&rdquo; the Gist shows one
                            quiet line with the result, for example{" "}
                            <em>
                                Agent explored 23 files · 41 references verified
                                · 2 unverified
                            </em>
                            .
                        </p>
                    </section>

                    <section id="passes" className="docs-section">
                        <h3 className="subsection-heading">What runs when</h3>
                        <p className="docs-p">
                            Each analysis is one headless agent run, called a
                            pass. grsp runs as few as it can, and at most two at
                            a time.
                        </p>
                        <div className="my-6 overflow-x-auto">
                            <table className="docs-table">
                                <thead>
                                    <tr>
                                        <th>Pass</th>
                                        <th>Runs</th>
                                        <th>Produces</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="font-medium">
                                            Discovery
                                        </td>
                                        <td className="text-gray-600">
                                            When a session opens
                                        </td>
                                        <td className="text-gray-600">
                                            Code does, mismatches, what&apos;s
                                            affected, gaps
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="font-medium">
                                            Questions
                                        </td>
                                        <td className="text-gray-600">
                                            After discovery (can be turned off)
                                        </td>
                                        <td className="text-gray-600">
                                            Can you answer these?
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="font-medium">
                                            Discussion
                                        </td>
                                        <td className="text-gray-600">
                                            After discovery, PRs with comments
                                        </td>
                                        <td className="text-gray-600">
                                            The digest and one-line thread gists
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="font-medium">
                                            Walkthrough
                                        </td>
                                        <td className="text-gray-600">
                                            The first time you open an entry
                                            point
                                        </td>
                                        <td className="text-gray-600">
                                            The block chain and what-if paths
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="font-medium">Ask</td>
                                        <td className="text-gray-600">
                                            Each question you ask
                                        </td>
                                        <td className="text-gray-600">
                                            One grounded answer
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="font-medium">Review</td>
                                        <td className="text-gray-600">
                                            When you press Run
                                        </td>
                                        <td className="text-gray-600">
                                            Findings and a summary
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p className="docs-p">
                            While a pass runs, its section shows what the agent
                            is doing (&ldquo;Reading orders/services.py&rdquo;,
                            &ldquo;Searching for bulk_create&rdquo;) rather than
                            a bare spinner. A pass that fails shows the error
                            and a Retry button and never blocks the other
                            sections. Passes time out after 5 minutes and can be
                            cancelled.
                        </p>
                        <p className="docs-p">
                            Very large PRs (more than 60 changed files or 3,000
                            changed lines) are analysed in up to four parts by
                            top-level directory and then merged. The Gist says
                            so: &ldquo;Large PR: analysed in 4 parts.&rdquo;
                        </p>
                    </section>

                    <section id="caching" className="docs-section">
                        <h3 className="subsection-heading">
                            What&apos;s cached
                        </h3>
                        <p className="docs-p">
                            Everything is stored locally in SQLite and keyed by
                            the PR&apos;s head commit. Reopening a session, or
                            switching tabs, never re-runs an agent. A result
                            computed for one commit is never shown for another.
                        </p>
                        <ul className="docs-list">
                            <li>
                                <strong>Kept:</strong> every analysis, your Ask
                                history, which questions you&apos;ve opened,
                                your edits to findings, and the reviews
                                you&apos;ve posted.
                            </li>
                            <li>
                                <strong>On a new push:</strong> the session is
                                marked stale. Refreshing builds a new worktree
                                and re-runs only the analyses that had already
                                run. Older Ask answers stay, marked &ldquo;from
                                an earlier version&rdquo;.
                            </li>
                            <li>
                                <strong>Worktrees</strong> live in grsp&apos;s
                                app data folder, not in your clone. They are
                                removed when you archive a session or leave it
                                untouched for 14 days, and recreated on demand.
                            </li>
                        </ul>
                    </section>

                    <section id="cost" className="docs-section">
                        <h3 className="subsection-heading">Cost</h3>
                        <p className="docs-p">
                            grsp is free and has no usage of its own. Every pass
                            runs on your Claude Code or Codex subscription and
                            counts against its limits the same way a session in
                            your terminal would. So grsp is frugal:
                        </p>
                        <ul className="docs-list">
                            <li>Results are cached by commit.</li>
                            <li>
                                Walkthroughs and the review run only when you
                                ask for them.
                            </li>
                            <li>
                                Nothing re-runs when the window gets focus. Only
                                Refresh and Retry start a pass.
                            </li>
                            <li>
                                The session footer shows how many agent passes
                                the session has used.
                            </li>
                        </ul>
                        <p className="docs-p">
                            A typical PR is one discovery pass, one questions
                            pass, one discussion pass, a walkthrough or two, and
                            a review.
                        </p>
                    </section>

                    <hr className="section-divider" />

                    {/* === TABS === */}
                    <section id="tabs" className="docs-section">
                        <h2 className="section-heading">The three tabs</h2>
                        <p className="docs-p">
                            Every session has the same header (PR number and
                            title, author, branches, CI status, files changed, a
                            mismatch pill, your posted verdict) and three tabs.
                        </p>
                    </section>

                    <section id="gist" className="docs-section">
                        <h3 className="subsection-heading">Gist</h3>
                        <p className="docs-p">
                            The Gist answers &ldquo;what is this PR,
                            really?&rdquo; in one screen.
                        </p>
                        <ul className="docs-list">
                            <li>
                                <strong>Author says / Code does.</strong> The PR
                                description beside a short plain-language
                                summary of the behaviour, written from the code.
                            </li>
                            <li>
                                <strong>Mismatch.</strong> Shown only when the
                                description makes a checkable claim that the
                                code contradicts or doesn&apos;t fully
                                implement. <em>Walk through it</em> jumps to the
                                step where it goes wrong. An empty description
                                produces no mismatches.
                            </li>
                            <li>
                                <strong>What&apos;s affected.</strong> Up to 12
                                entry points whose behaviour changes: HTTP
                                routes, UI actions, jobs, consumers, scheduled
                                tasks, CLI commands, public APIs. Each has a
                                one-line effect and a tag. Entry points with
                                gaps come first.
                            </li>
                            <li>
                                <strong>Not covered.</strong> For everything the
                                PR writes to (a table, a model, a file, a state
                                field), the agent searches the repo for{" "}
                                <em>other</em> code that writes to it and
                                bypasses the new behaviour. Those are gaps, and
                                they are the part of a change a diff can&apos;t
                                show you.
                            </li>
                            <li>
                                <strong>Can you answer these?</strong> Three to
                                six questions about behaviour a reviewer should
                                be able to answer: edge cases, failure modes,
                                permissions, migrations, concurrency. Opening
                                one reveals the answer with its references and
                                marks it checked.
                            </li>
                            <li>
                                <strong>Discussion on GitHub.</strong> Collapsed
                                to a one-line digest; expanded, a &ldquo;Where
                                it stands&rdquo; summary and the threads, open
                                ones first. Suggested changes render as diffs.
                            </li>
                        </ul>
                    </section>

                    <section id="ask" className="docs-section">
                        <h3 className="subsection-heading">Ask</h3>
                        <p className="docs-p">
                            The panel on the right of the Gist answers questions
                            about the change. The agent can read anything in the
                            worktree, not just the diff, and follow-ups take the
                            last few questions into account.
                        </p>
                        <p className="docs-p">
                            Each answer comes with a trace line (how many files
                            were explored and how many references verified), an
                            optional code excerpt with the key line highlighted,
                            and <Code>file:line</Code> chips.
                        </p>
                        <p className="docs-p">
                            When a question can&apos;t be answered from the
                            code, the answer says so plainly and names the
                            closest relevant code. grsp never answers from
                            general knowledge as if it were about your repo.
                            Shaky answers carry a quiet &ldquo;Low
                            confidence&rdquo; label.
                        </p>
                    </section>

                    <section id="walkthrough" className="docs-section">
                        <h3 className="subsection-heading">Walkthrough</h3>
                        <p className="docs-p">
                            A debugger for behaviour. Pick an entry point and
                            step through what happens, one block at a time:
                        </p>
                        <CodeBlock>
                            {`POST /orders → CreateOrderSchema.validate → OrderService.create
  → ApprovalPolicy.check → orders.insert → emit approval.requested → Mailer.send`}
                        </CodeBlock>
                        <p className="docs-p">
                            Each block shows what kind of step it is, whether
                            it&apos;s new, changed or unchanged, a one or two
                            sentence note on what happens there, its code at the
                            PR head with diff markers, and, where the code
                            branches, the <strong>decision</strong>: the
                            condition and which side is taken.
                        </p>
                        <p className="docs-p">
                            When a changed decision depends on an input, the
                            walkthrough offers a <strong>What if</strong> with
                            two or three values. Choosing another value
                            re-routes the rest of the chain. This is reasoning
                            over the code, not execution, and it&apos;s labelled
                            &ldquo;Based on reading the code.&rdquo;
                        </p>
                        <p className="docs-p">
                            Paths are at most 12 blocks and only follow branches
                            that reach changed code, a gap, or an external
                            effect such as a payment or an email. Turn off{" "}
                            <em>Show unchanged blocks</em> in Settings to step
                            only through what the PR touches.
                        </p>
                    </section>

                    <section id="review" className="docs-section">
                        <h3 className="subsection-heading">Review</h3>
                        <p className="docs-p">
                            Press <strong>Run</strong> to get an AI review using
                            your review prompt. It knows what discovery found
                            and what the discussion has already settled, so it
                            doesn&apos;t repeat resolved points.
                        </p>
                        <ul className="docs-list">
                            <li>
                                Findings are grouped as{" "}
                                <strong>Blocking</strong>,{" "}
                                <strong>Should fix</strong> or{" "}
                                <strong>Nit</strong>. Each has a title, why it
                                matters, the code with the line highlighted, and
                                a comment you can edit.
                            </li>
                            <li>
                                Untick <em>Include in review</em> to leave a
                                finding out.
                            </li>
                            <li>
                                Choose <strong>Comment</strong>,{" "}
                                <strong>Approve</strong> or{" "}
                                <strong>Request changes</strong>, edit the
                                summary, and post.
                            </li>
                        </ul>
                        <p className="docs-p">
                            GitHub only accepts inline comments on lines that
                            are part of the PR&apos;s diff. A finding on such a
                            line posts inline. A finding about code the PR
                            didn&apos;t touch (often the most important kind) is
                            marked &ldquo;Posts in summary&rdquo; and goes into
                            the review body under &ldquo;Not in this diff&rdquo;
                            with its <Code>file:line</Code> written out.
                        </p>
                        <p className="docs-p">
                            On your own PR, GitHub doesn&apos;t allow Approve or
                            Request changes, so grsp disables them and says why.
                            If the PR has moved on since the review was
                            generated, grsp warns you before posting. And it
                            checks for an existing review of yours on the same
                            commit first, so a retry after a network error
                            can&apos;t post twice.
                        </p>
                    </section>

                    <hr className="section-divider" />

                    {/* === SETTINGS === */}
                    <section id="settings" className="docs-section">
                        <h2 className="section-heading">Settings</h2>
                        <p className="docs-p">
                            Open Settings from the bottom of the sidebar. Two
                            optional files in a repository let a team share its
                            configuration: <Code>.grsp/prompt.md</Code> and{" "}
                            <Code>.grsp/config.toml</Code>.
                        </p>
                    </section>

                    <section id="review-prompt" className="docs-section">
                        <h3 className="subsection-heading">Review prompt</h3>
                        <p className="docs-p">
                            The instructions the AI review follows. It&apos;s
                            global, plain text, and yours to rewrite.{" "}
                            <em>Reset to default</em> restores this:
                        </p>
                        <CodeBlock title="Default review prompt">
                            {`You are reviewing a pull request. Prioritise correctness and data
integrity over style. Flag any path where state changes without the
checks the PR description promises. Group findings as Blocking,
Should fix or Nit. Keep each comment under 80 words and say what to
change, not just what is wrong.`}
                        </CodeBlock>
                    </section>

                    <section id="repo-prompt" className="docs-section">
                        <h3 className="subsection-heading mono">
                            .grsp/prompt.md
                        </h3>
                        <p className="docs-p">
                            Commit a <Code>.grsp/prompt.md</Code> to a
                            repository to give every agent pass in that repo
                            extra context: the architecture in a paragraph, what
                            your team cares about in review, what to ignore. It
                            is appended to your review prompt for that repo, and
                            the Review tab shows &ldquo;Repo prompt
                            active&rdquo; when one is in use.
                        </p>
                        <CodeBlock title=".grsp/prompt.md">
                            {`This is a payments-adjacent backend. Money moves in orders/ and payments/.

- Anything that changes an order's status must go through OrderService.
- Flag new writes that skip the audit log.
- We don't care about import order or docstring style.`}
                        </CodeBlock>
                        <p className="docs-p">
                            The file is read from the PR&apos;s head, so a PR
                            that changes it is reviewed with the new version.
                        </p>
                    </section>

                    <section id="excludes" className="docs-section">
                        <h3 className="subsection-heading mono">
                            .grsp/config.toml
                        </h3>
                        <p className="docs-p">
                            grsp leaves vendored, generated and lock files out
                            of the analysis so the agent spends its time on code
                            people wrote. Out of the box it skips:
                        </p>
                        <ul className="docs-list">
                            <li>
                                paths marked <Code>linguist-generated</Code> or{" "}
                                <Code>linguist-vendored</Code> in{" "}
                                <Code>.gitattributes</Code>;
                            </li>
                            <li>
                                <Code>node_modules</Code>, <Code>vendor</Code>,{" "}
                                <Code>dist</Code>, <Code>build</Code>,{" "}
                                <Code>*.min.*</Code> and lockfiles.
                            </li>
                        </ul>
                        <p className="docs-p">
                            Add your own globs with an <Code>exclude</Code> list
                            in <Code>.grsp/config.toml</Code>:
                        </p>
                        <CodeBlock title=".grsp/config.toml">
                            {`exclude = [
    "api/generated/**",
    "**/*.snap",
    "fixtures/**",
]`}
                        </CodeBlock>
                        <p className="docs-p">
                            Excluded files don&apos;t count towards the changed
                            files and aren&apos;t included in the diff the agent
                            is given. They are still in the worktree, so the
                            agent can read them if a path leads there.
                        </p>
                    </section>

                    <section id="agent-settings" className="docs-section">
                        <h3 className="subsection-heading">Agent</h3>
                        <p className="docs-p">
                            Switch between Claude Code and Codex. The status
                            card shows whether the agent was detected, where its
                            binary is, whether it&apos;s signed in, and the
                            command grsp runs it with. <em>Re-check</em> runs
                            detection again. Switching agents takes effect on
                            the next pass; existing results stay.
                        </p>
                    </section>

                    <section id="analysis-settings" className="docs-section">
                        <h3 className="subsection-heading">Analysis</h3>
                        <div className="my-6 overflow-x-auto">
                            <table className="docs-table">
                                <thead>
                                    <tr>
                                        <th>Setting</th>
                                        <th>Default</th>
                                        <th>What it does</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="font-medium">
                                            Generate comprehension questions
                                        </td>
                                        <td>On</td>
                                        <td className="text-gray-600">
                                            Adds &ldquo;Can you answer
                                            these?&rdquo; to every Gist. Off
                                            hides the section and skips the
                                            pass.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="font-medium">
                                            Show unchanged blocks in
                                            walkthroughs
                                        </td>
                                        <td>On</td>
                                        <td className="text-gray-600">
                                            Off steps only through what the PR
                                            touches. Numbering doesn&apos;t
                                            change.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="font-medium">
                                            Run AI review when a session opens
                                        </td>
                                        <td>Off</td>
                                        <td className="text-gray-600">
                                            Uses your subscription on every PR
                                            you open.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="font-medium">
                                            Trace depth
                                        </td>
                                        <td>2 hops</td>
                                        <td className="text-gray-600">
                                            How far from the changed code the
                                            agent follows callers and callees.
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section id="hosts-repos" className="docs-section">
                        <h3 className="subsection-heading">
                            Hosts &amp; repositories
                        </h3>
                        <p className="docs-p">
                            <strong>Git hosts.</strong> GitHub is supported for
                            PR sessions. GitLab and Bitbucket are marked
                            &ldquo;Coming soon&rdquo;; until then, comparing two
                            branches works with any host.
                        </p>
                        <p className="docs-p">
                            <strong>Repositories.</strong> The folders grsp
                            knows about. Adding one requires a git repository;
                            the GitHub owner and name come from its{" "}
                            <Code>origin</Code> remote. Removing a repo archives
                            its sessions and never touches the folder itself.
                        </p>
                    </section>

                    <hr className="section-divider" />

                    {/* === PRIVACY === */}
                    <section id="privacy" className="docs-section">
                        <h2 className="section-heading">Privacy</h2>
                        <Callout>
                            <strong>
                                No code leaves your machine except through your
                                own agent.
                            </strong>{" "}
                            grsp has no server that sees your repositories.
                        </Callout>
                        <ul className="docs-list">
                            <li>
                                <strong>Your code</strong> is read locally, from
                                a worktree on your disk. The only place it goes
                                is to Claude Code or Codex, running under your
                                account, under the terms you already have with
                                that provider.
                            </li>
                            <li>
                                <strong>The agent is read-only.</strong> Claude
                                Code is limited to read, search and list tools;
                                Codex runs in its read-only sandbox. Neither can
                                edit files or run commands that change state,
                                and the worktree is separate from your working
                                copy.
                            </li>
                            <li>
                                <strong>No API keys.</strong> grsp never asks
                                for, uses or stores model API keys.
                            </li>
                            <li>
                                <strong>GitHub</strong> is reached through{" "}
                                <Code>gh</Code> with the account you signed in
                                to. Nothing is posted until you press Post.
                            </li>
                            <li>
                                <strong>Analyses and history</strong> are stored
                                in a SQLite database in the app&apos;s data
                                folder on your Mac.
                            </li>
                            <li>
                                <strong>grsp&apos;s own server</strong> handles
                                sign-in and anonymous product metrics (which
                                features are used, never repository names, code,
                                diffs, prompts or agent output).
                            </li>
                        </ul>
                    </section>

                    <hr className="section-divider" />

                    {/* === FAQ === */}
                    <section id="faq" className="docs-section">
                        <h2 className="section-heading">FAQ</h2>
                        <div>
                            <Faq question="Which languages does it support?">
                                Any your agent can read. grsp has no parser of
                                its own: the agent does the understanding and
                                grsp verifies it with git and plain text. There
                                is no list of supported languages or frameworks
                                to check.
                            </Faq>
                            <Faq question="Do I need an API key?">
                                No. grsp runs the Claude Code or Codex CLI you
                                are already signed in to and uses that
                                subscription.
                            </Faq>
                            <Faq question="Can the agent be wrong?">
                                Yes. It can misread code like any reviewer. What
                                it can&apos;t do is show you a location that
                                doesn&apos;t exist or call unchanged code
                                changed: references are verified, change status
                                and excerpts come from git, and what fails is
                                dropped. Treat the notes as a well-read
                                colleague&apos;s explanation, and the code
                                beside them as the fact.
                            </Faq>
                            <Faq question="Does it modify my repository or my working copy?">
                                No. It fetches the PR&apos;s refs into your
                                clone and creates a detached worktree in its own
                                data folder. Your branches and uncommitted work
                                are untouched.
                            </Faq>
                            <Faq question="It says the agent isn't installed or isn't signed in.">
                                Open a terminal and run <Code>claude</Code> or{" "}
                                <Code>codex</Code> to check it starts and
                                you&apos;re logged in, then press Re-check in
                                Settings → Agent. If the binary is somewhere
                                unusual, make sure it&apos;s on your{" "}
                                <Code>PATH</Code>.
                            </Faq>
                            <Faq question="Can I use it without GitHub?">
                                Yes. Choose two branches as base and head. You
                                get the Gist, Ask, walkthroughs and the AI
                                review; there&apos;s no discussion and no
                                posting.
                            </Faq>
                            <Faq question="Why is a finding marked “Posts in summary”?">
                                Its line isn&apos;t part of the PR&apos;s diff,
                                and GitHub only allows inline comments on diff
                                lines. The comment is included in the review
                                body with the file and line written out.
                            </Faq>
                            <Faq question="How much of my subscription does a review use?">
                                A handful of agent passes per PR; the session
                                footer shows the count. Nothing runs in the
                                background and nothing re-runs unless you press
                                Refresh or Retry.
                            </Faq>
                            <Faq question="A section failed. Now what?">
                                Press Retry on that section.
                                &ldquo;Details&rdquo; shows an excerpt of what
                                the agent returned. The other sections
                                aren&apos;t affected.
                            </Faq>
                            <Faq question="Is it open source?">
                                Yes. The app, this site and the eval fixtures
                                are on{" "}
                                <a
                                    href="https://github.com/ghvstcode/grsp"
                                    className="underline"
                                >
                                    GitHub
                                </a>
                                .
                            </Faq>
                        </div>
                    </section>

                    {/* ─── Footer ─── */}
                    <div className="mt-16 pt-8 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-gray-400 text-sm">
                                <Logo size={12} className="animate-slow-spin" />
                                <span className="mono">grsp docs</span>
                            </div>
                            <a
                                href="/"
                                className="text-sm text-gray-400 hover:text-black transition-colors"
                            >
                                ← Back to home
                            </a>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
