"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";

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
            { id: "prerequisites", title: "Prerequisites" },
            { id: "installation", title: "Installation" },
            { id: "onboarding", title: "Onboarding" },
        ],
    },
    {
        id: "core-concepts",
        title: "Core Concepts",
        children: [
            { id: "projects", title: "Projects & Repositories" },
            { id: "tasks", title: "Tasks & Backlog" },
            { id: "agent-engine", title: "The Agent Engine" },
            { id: "budget", title: "Budget Management" },
        ],
    },
    {
        id: "scanning",
        title: "Scanning & Discovery",
        children: [
            { id: "how-scanning-works", title: "How Scanning Works" },
            { id: "scan-categories", title: "What Gets Detected" },
            { id: "scan-frequency", title: "Scan Frequency" },
        ],
    },
    {
        id: "task-management",
        title: "Task Management",
        children: [
            { id: "task-lifecycle", title: "Task Lifecycle" },
            { id: "task-properties", title: "Task Properties" },
            { id: "prioritization", title: "Prioritization" },
        ],
    },
    {
        id: "execution",
        title: "Automated Execution",
        children: [
            { id: "work-phases", title: "Work Phases" },
            { id: "retry-logic", title: "Retry & Error Handling" },
        ],
    },
    {
        id: "review",
        title: "Code Review & PRs",
        children: [
            { id: "diff-viewer", title: "Diff Viewer" },
            { id: "creating-prs", title: "Creating Pull Requests" },
        ],
    },
    {
        id: "configuration",
        title: "Configuration",
        children: [
            { id: "general-settings", title: "General" },
            { id: "git-branches", title: "Git & Branches" },
            { id: "scheduling", title: "Scheduling" },
            { id: "budget-controls", title: "Budget Controls" },
            { id: "project-overrides", title: "Per-Project Overrides" },
        ],
    },
    {
        id: "architecture",
        title: "Architecture",
        children: [
            { id: "tech-stack", title: "Tech Stack" },
            { id: "data-flow", title: "Data Flow" },
            { id: "engine-modules", title: "Engine Modules" },
        ],
    },
];

/* ────────────────────────────────────────
   Helper Components
   ──────────────────────────────────────── */

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

function CodeBlock({ children, title }: { children: string; title?: string }) {
    return (
        <div className="my-4 rounded-lg overflow-hidden border border-gray-200">
            {title && (
                <div className="bg-gray-100 px-4 py-2 text-xs mono text-gray-500 border-b border-gray-200">
                    {title}
                </div>
            )}
            <pre className="bg-gray-950 text-gray-100 p-4 overflow-x-auto text-sm leading-relaxed">
                <code className="mono">{children}</code>
            </pre>
        </div>
    );
}

function Callout({
    type = "info",
    title,
    children,
}: {
    type?: "info" | "warning" | "tip";
    title?: string;
    children: ReactNode;
}) {
    const styles = {
        info: "border-blue-200 bg-blue-50 text-blue-500 text-blue-900",
        warning: "border-amber-200 bg-amber-50 text-amber-500 text-amber-900",
        tip: "border-emerald-200 bg-emerald-50 text-emerald-500 text-emerald-900",
    };
    const icons = { info: "i", warning: "!", tip: "✦" };
    const iconColors = {
        info: "text-blue-500",
        warning: "text-amber-500",
        tip: "text-emerald-500",
    };
    const titleColors = {
        info: "text-blue-900",
        warning: "text-amber-900",
        tip: "text-emerald-900",
    };
    const [border, bg] = styles[type].split(" ");

    return (
        <div className={`my-6 rounded-lg border ${border} ${bg} p-4`}>
            <div className="flex items-start gap-3">
                <span
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${iconColors[type]} border-current`}
                >
                    {icons[type]}
                </span>
                <div>
                    {title && (
                        <div
                            className={`font-semibold mb-1 text-sm ${titleColors[type]}`}
                        >
                            {title}
                        </div>
                    )}
                    <div className="text-sm text-gray-700 leading-relaxed">
                        {children}
                    </div>
                </div>
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

function Badge({
    children,
    variant = "default",
}: {
    children: ReactNode;
    variant?: "default" | "success" | "warning" | "danger" | "info";
}) {
    const styles = {
        default: "bg-gray-100 text-gray-700",
        success: "bg-emerald-100 text-emerald-700",
        warning: "bg-amber-100 text-amber-700",
        danger: "bg-red-100 text-red-700",
        info: "bg-blue-100 text-blue-700",
    };
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mono ${styles[variant]}`}
        >
            {children}
        </span>
    );
}

function FeatureCard({
    icon,
    title,
    description,
}: {
    icon: string;
    title: string;
    description: string;
}) {
    return (
        <div className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
            <div className="text-2xl mb-2">{icon}</div>
            <div className="font-semibold text-sm mb-1">{title}</div>
            <p className="text-gray-500 text-sm leading-relaxed">
                {description}
            </p>
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
                                sustn
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
                                Everything you need to know about sustn — the
                                background conductor for AI coding agents that
                                continuously improves your codebase.
                            </p>
                        </div>

                        <h2 className="section-heading">What is sustn?</h2>
                        <p className="docs-p">
                            <strong>sustn</strong> is a native macOS desktop
                            application that acts as a background conductor for
                            AI coding agents. Instead of waiting for you to open
                            a terminal and type a prompt, sustn continuously
                            monitors your repositories, identifies improvements,
                            and executes them autonomously — all using your
                            existing Claude Code subscription.
                        </p>
                        <p className="docs-p">
                            Every change lands as a branch. Nothing touches your
                            main branch without your explicit approval. You
                            review the work, create a pull request with one
                            click, and merge when you&apos;re ready.
                        </p>

                        <h3 className="subsection-heading">Core Philosophy</h3>
                        <p className="docs-p">
                            Every AI coding tool today follows the same pattern:
                            you prompt, it responds. This{" "}
                            <strong>reactive</strong> model means the agent only
                            works when you&apos;re actively driving it. When
                            you&apos;re not prompting, your subscription tokens
                            go unused. The backlog grows.
                        </p>
                        <p className="docs-p">
                            sustn takes a different approach. It&apos;s{" "}
                            <strong>proactive</strong>. The agent understands
                            your codebase. It maintains a living backlog of
                            improvements. It picks up work when budget is
                            available and delivers results you can approve or
                            discard. You stay in control, but you&apos;re no
                            longer the bottleneck.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-8">
                            <FeatureCard
                                icon="🔍"
                                title="Intelligent Scanning"
                                description="Two-pass scanning identifies dead code, missing tests, security gaps, tech debt, and more."
                            />
                            <FeatureCard
                                icon="🤖"
                                title="Autonomous Execution"
                                description="Plan → implement → review workflow runs automatically with retry logic and error handling."
                            />
                            <FeatureCard
                                icon="🌿"
                                title="Branch-Based Safety"
                                description="Every change lands on a feature branch. Main is never touched without your approval."
                            />
                            <FeatureCard
                                icon="💰"
                                title="Budget-Aware"
                                description="Monitors your Claude subscription usage and works only when tokens are available."
                            />
                            <FeatureCard
                                icon="📋"
                                title="Task Backlog"
                                description="Visual task board with drag-and-drop prioritization, categories, and effort estimates."
                            />
                            <FeatureCard
                                icon="🔔"
                                title="Desktop Notifications"
                                description="Native macOS notifications and sound effects keep you informed without interrupting flow."
                            />
                        </div>
                    </section>

                    <hr className="section-divider" />

                    {/* === GETTING STARTED === */}
                    <section id="getting-started" className="docs-section">
                        <h2 className="section-heading">Getting Started</h2>
                        <p className="docs-p">
                            Get up and running with sustn in under five minutes.
                            This guide walks you through prerequisites,
                            installation, and your first project setup.
                        </p>
                    </section>

                    <section id="prerequisites" className="docs-section">
                        <h3 className="subsection-heading">Prerequisites</h3>
                        <p className="docs-p">
                            sustn requires the following tools installed on your
                            machine:
                        </p>
                        <div className="my-6 space-y-3">
                            {[
                                {
                                    name: "Git",
                                    desc: "Version control. Required for branch management and repository operations.",
                                    check: "git --version",
                                },
                                {
                                    name: "Claude CLI",
                                    desc: "The Claude Code command-line tool. sustn uses this to invoke the AI agent for scanning and code generation.",
                                    check: "claude --version",
                                },
                                {
                                    name: "GitHub CLI",
                                    desc: "Used for authentication, creating pull requests, and interacting with GitHub repositories.",
                                    check: "gh --version",
                                },
                                {
                                    name: "Node.js 22+",
                                    desc: "Required for building and running the application from source.",
                                    check: "node --version",
                                },
                            ].map((item) => (
                                <div
                                    key={item.name}
                                    className="flex items-start gap-3 p-3 rounded-lg border border-gray-100"
                                >
                                    <div className="w-2 h-2 rounded-full bg-black mt-2 shrink-0" />
                                    <div>
                                        <div className="font-semibold text-sm">
                                            {item.name}
                                        </div>
                                        <p className="text-gray-500 text-sm">
                                            {item.desc}
                                        </p>
                                        <code className="text-xs mono text-gray-400 mt-1 block">
                                            {item.check}
                                        </code>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Callout type="info" title="Preflight checks">
                            Don&apos;t worry about verifying each tool manually.
                            sustn runs automatic preflight checks during
                            onboarding and will tell you exactly what&apos;s
                            missing.
                        </Callout>
                    </section>

                    <section id="installation" className="docs-section">
                        <h3 className="subsection-heading">Installation</h3>
                        <p className="docs-p">
                            Download the latest sustn release for macOS. The app
                            ships as a standard{" "}
                            <code className="mono text-sm bg-gray-100 px-1.5 py-0.5 rounded">
                                .dmg
                            </code>{" "}
                            installer.
                        </p>
                        <CodeBlock title="Or build from source">
                            {`git clone https://github.com/sustn/sustn.git
cd sustn
nvm use 22
pnpm install
pnpm tauri:dev`}
                        </CodeBlock>
                        <p className="docs-p">
                            The application supports three build environments:
                        </p>
                        <div className="my-4 overflow-x-auto">
                            <table className="docs-table">
                                <thead>
                                    <tr>
                                        <th>Command</th>
                                        <th>Environment</th>
                                        <th>Identifier</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>
                                            <code className="mono text-sm">
                                                pnpm tauri:prod
                                            </code>
                                        </td>
                                        <td>Production</td>
                                        <td>
                                            <code className="mono text-sm text-gray-400">
                                                app.sustn.desktop
                                            </code>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <code className="mono text-sm">
                                                pnpm tauri:dev
                                            </code>
                                        </td>
                                        <td>Development</td>
                                        <td>
                                            <code className="mono text-sm text-gray-400">
                                                app.sustn.desktop.dev
                                            </code>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <code className="mono text-sm">
                                                pnpm tauri:qa
                                            </code>
                                        </td>
                                        <td>QA / Testing</td>
                                        <td>
                                            <code className="mono text-sm text-gray-400">
                                                app.sustn.desktop.qa
                                            </code>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section id="onboarding" className="docs-section">
                        <h3 className="subsection-heading">Onboarding</h3>
                        <p className="docs-p">
                            When you first launch sustn, you&apos;ll be guided
                            through a four-step onboarding flow:
                        </p>
                        <div className="my-6">
                            <FlowStep
                                number={1}
                                title="Welcome & Authentication"
                                description="Connect your GitHub account. sustn uses GitHub OAuth to authenticate and interact with your repositories. Your credentials are stored securely in the local SQLite database."
                            />
                            <FlowStep
                                number={2}
                                title="Preflight Checks"
                                description="sustn automatically verifies that Git, Claude CLI, and GitHub CLI are installed and properly configured. If anything is missing, you'll see clear instructions to resolve it."
                            />
                            <FlowStep
                                number={3}
                                title="Add Your First Project"
                                description="Point sustn at a local repository or clone a remote one. You can add as many repositories as you like — each one becomes a managed project in your sidebar."
                            />
                            <FlowStep
                                number={4}
                                title="Ready to Go"
                                description="That's it. sustn will immediately offer to run your first scan. From here, the agent takes over — finding improvements and adding them to your backlog."
                                isLast
                            />
                        </div>
                    </section>

                    <hr className="section-divider" />

                    {/* === CORE CONCEPTS === */}
                    <section id="core-concepts" className="docs-section">
                        <h2 className="section-heading">Core Concepts</h2>
                        <p className="docs-p">
                            Understanding these foundational concepts will help
                            you get the most out of sustn.
                        </p>
                    </section>

                    <section id="projects" className="docs-section">
                        <h3 className="subsection-heading">
                            Projects & Repositories
                        </h3>
                        <p className="docs-p">
                            A <strong>project</strong> in sustn corresponds to a
                            Git repository on your machine. Each project has its
                            own task backlog, scan history, and configuration.
                            Projects appear in the sidebar and can be reordered
                            by dragging.
                        </p>
                        <p className="docs-p">
                            When you add a project, sustn tracks:
                        </p>
                        <ul className="docs-list">
                            <li>The local filesystem path to the repository</li>
                            <li>
                                The default branch (usually{" "}
                                <code className="mono text-sm bg-gray-100 px-1 rounded">
                                    main
                                </code>{" "}
                                or{" "}
                                <code className="mono text-sm bg-gray-100 px-1 rounded">
                                    master
                                </code>
                                )
                            </li>
                            <li>
                                The base branch for creating feature branches
                            </li>
                            <li>The remote origin URL</li>
                            <li>
                                When the project was last scanned and worked on
                            </li>
                        </ul>
                        <Callout type="tip" title="Multiple projects">
                            sustn&apos;s prioritizer automatically decides which
                            project to work on next based on priority settings,
                            task urgency, and how long since each project
                            received attention. You don&apos;t need to manually
                            switch between projects.
                        </Callout>
                    </section>

                    <section id="tasks" className="docs-section">
                        <h3 className="subsection-heading">
                            Tasks & the Backlog
                        </h3>
                        <p className="docs-p">
                            Tasks are the fundamental unit of work in sustn.
                            Each task represents a specific improvement or fix
                            that the agent has identified (or that you&apos;ve
                            manually created). Tasks have two origins:
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4">
                            <div className="p-4 rounded-lg border border-gray-200">
                                <Badge variant="info">scan</Badge>
                                <p className="text-sm text-gray-600 mt-2">
                                    Discovered automatically by the scanner. The
                                    agent analyzed your codebase and identified
                                    this as a worthwhile improvement.
                                </p>
                            </div>
                            <div className="p-4 rounded-lg border border-gray-200">
                                <Badge>manual</Badge>
                                <p className="text-sm text-gray-600 mt-2">
                                    Created by you. Add tasks directly when you
                                    know what needs doing but want the agent to
                                    handle the implementation.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section id="agent-engine" className="docs-section">
                        <h3 className="subsection-heading">The Agent Engine</h3>
                        <p className="docs-p">
                            The engine is the core runtime that coordinates all
                            automated work. Built in Rust, it manages the
                            lifecycle of scanning and task execution through
                            several specialized modules:
                        </p>
                        <div className="my-6 space-y-2">
                            {[
                                {
                                    module: "Scanner",
                                    desc: "Analyzes your codebase to discover improvement opportunities using a two-pass system.",
                                },
                                {
                                    module: "Prioritizer",
                                    desc: "Scores and ranks projects and tasks to determine what to work on next.",
                                },
                                {
                                    module: "Scheduler",
                                    desc: "Controls when the agent is allowed to work based on your time and schedule preferences.",
                                },
                                {
                                    module: "Worker",
                                    desc: "Executes tasks through the plan → implement → review workflow.",
                                },
                                {
                                    module: "Budget",
                                    desc: "Monitors your Claude subscription usage to ensure sustn only works when tokens are available.",
                                },
                                {
                                    module: "Git",
                                    desc: "Manages branches, commits, diffs, and pull request creation.",
                                },
                            ].map((m) => (
                                <div
                                    key={m.module}
                                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    <code className="mono text-sm font-semibold text-black bg-gray-100 px-2 py-0.5 rounded shrink-0">
                                        {m.module}
                                    </code>
                                    <p className="text-sm text-gray-600">
                                        {m.desc}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <p className="docs-p">
                            The engine runs as a managed state within the Tauri
                            application, communicating with the frontend through
                            IPC commands and event emitters.
                        </p>
                    </section>

                    <section id="budget" className="docs-section">
                        <h3 className="subsection-heading">
                            Budget Management
                        </h3>
                        <p className="docs-p">
                            sustn is designed to use your <em>existing</em>{" "}
                            Claude Code subscription — specifically the tokens
                            you&apos;re not using. It reads Claude&apos;s usage
                            statistics and calculates how many tokens are
                            available for background work.
                        </p>
                        <div className="my-6 p-4 rounded-lg bg-gray-50 border border-gray-100">
                            <div className="text-sm font-semibold mb-3">
                                Budget Calculation
                            </div>
                            <div className="space-y-2 text-sm mono">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">
                                        Weekly token budget
                                    </span>
                                    <span>700,000</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">
                                        Max usage percent
                                    </span>
                                    <span>80%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">
                                        Reserve percent
                                    </span>
                                    <span>10%</span>
                                </div>
                                <hr className="border-gray-200" />
                                <div className="flex justify-between font-semibold">
                                    <span className="text-gray-700">
                                        Available for sustn
                                    </span>
                                    <span className="text-emerald-600">
                                        = budget × max% − used − reserve
                                    </span>
                                </div>
                            </div>
                        </div>
                        <p className="docs-p">
                            The budget module reads from Claude&apos;s{" "}
                            <code className="mono text-sm bg-gray-100 px-1.5 py-0.5 rounded">
                                stats-cache.json
                            </code>{" "}
                            file, which tracks daily token consumption. When
                            tokens are exhausted, sustn gracefully pauses until
                            more budget becomes available.
                        </p>
                        <Callout type="warning" title="Budget safety">
                            sustn will never exceed your configured budget
                            ceiling. The reserve percentage ensures you always
                            have tokens available for your own interactive
                            Claude use.
                        </Callout>
                    </section>

                    <hr className="section-divider" />

                    {/* === SCANNING === */}
                    <section id="scanning" className="docs-section">
                        <h2 className="section-heading">
                            Scanning & Discovery
                        </h2>
                        <p className="docs-p">
                            Scanning is how sustn builds your task backlog. The
                            scanner analyzes your entire codebase and identifies
                            concrete improvements — from missing test coverage
                            to security vulnerabilities.
                        </p>
                    </section>

                    <section id="how-scanning-works" className="docs-section">
                        <h3 className="subsection-heading">
                            How Scanning Works
                        </h3>
                        <p className="docs-p">
                            sustn uses a sophisticated{" "}
                            <strong>two-pass scanning system</strong> to balance
                            speed with depth:
                        </p>
                        <div className="my-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-5 rounded-lg border-2 border-gray-200">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold mono">
                                        1
                                    </div>
                                    <div className="font-semibold">
                                        Quick Scan
                                    </div>
                                </div>
                                <ul className="text-sm text-gray-600 space-y-1.5">
                                    <li>
                                        Walks directory tree (skips
                                        node_modules, .git, etc.)
                                    </li>
                                    <li>
                                        Pre-reads source files up to size limits
                                    </li>
                                    <li>Invokes Claude for rapid analysis</li>
                                    <li>Returns results immediately to UI</li>
                                    <li>Takes seconds to minutes</li>
                                </ul>
                            </div>
                            <div className="p-5 rounded-lg border-2 border-black">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold mono">
                                        2
                                    </div>
                                    <div className="font-semibold">
                                        Deep Scan
                                    </div>
                                </div>
                                <ul className="text-sm text-gray-600 space-y-1.5">
                                    <li>Runs in the background after Pass 1</li>
                                    <li>Full Claude reasoning with tool use</li>
                                    <li>Deeper analysis of each finding</li>
                                    <li>Results saved directly to database</li>
                                    <li>More thorough but budget-aware</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    <section id="scan-categories" className="docs-section">
                        <h3 className="subsection-heading">
                            What Gets Detected
                        </h3>
                        <p className="docs-p">
                            The scanner identifies improvements across nine
                            categories:
                        </p>
                        <div className="my-6 overflow-x-auto">
                            <table className="docs-table">
                                <thead>
                                    <tr>
                                        <th>Category</th>
                                        <th>Weight</th>
                                        <th>Examples</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        {
                                            cat: "Security",
                                            weight: "5.0",
                                            examples:
                                                "Input validation gaps, hardcoded secrets, dependency vulnerabilities",
                                        },
                                        {
                                            cat: "Tests",
                                            weight: "3.0",
                                            examples:
                                                "Missing unit tests, untested edge cases, low coverage areas",
                                        },
                                        {
                                            cat: "Tech Debt",
                                            weight: "2.0",
                                            examples:
                                                "Dead code, deprecated APIs, code duplication",
                                        },
                                        {
                                            cat: "Performance",
                                            weight: "2.0",
                                            examples:
                                                "N+1 queries, unnecessary re-renders, unoptimized assets",
                                        },
                                        {
                                            cat: "Feature",
                                            weight: "1.5",
                                            examples:
                                                "Missing functionality, incomplete implementations",
                                        },
                                        {
                                            cat: "DX",
                                            weight: "1.5",
                                            examples:
                                                "Poor error messages, missing type definitions, confusing APIs",
                                        },
                                        {
                                            cat: "General",
                                            weight: "1.5",
                                            examples:
                                                "Code quality, readability, best practice violations",
                                        },
                                        {
                                            cat: "Observability",
                                            weight: "1.5",
                                            examples:
                                                "Missing logging, monitoring gaps, error tracking",
                                        },
                                        {
                                            cat: "Docs",
                                            weight: "1.0",
                                            examples:
                                                "Outdated comments, missing JSDoc, stale README",
                                        },
                                    ].map((r) => (
                                        <tr key={r.cat}>
                                            <td>
                                                <Badge>{r.cat}</Badge>
                                            </td>
                                            <td className="mono text-sm">
                                                {r.weight}
                                            </td>
                                            <td className="text-sm text-gray-600">
                                                {r.examples}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="docs-p">
                            Category weights are used by the prioritizer to rank
                            tasks. Security issues are weighted 5x more heavily
                            than documentation improvements, ensuring critical
                            fixes surface first.
                        </p>
                    </section>

                    <section id="scan-frequency" className="docs-section">
                        <h3 className="subsection-heading">Scan Frequency</h3>
                        <p className="docs-p">
                            Configure how often sustn scans your repositories:
                        </p>
                        <div className="my-4 space-y-2">
                            {[
                                {
                                    mode: "On Push",
                                    desc: "Scan whenever new commits are pushed to the repository.",
                                },
                                {
                                    mode: "Every 6h",
                                    desc: "Scan four times per day on a rolling schedule.",
                                },
                                {
                                    mode: "Every 12h",
                                    desc: "Scan twice per day.",
                                },
                                {
                                    mode: "Daily",
                                    desc: "Scan once per day, typically at the start of your work window.",
                                },
                                {
                                    mode: "Manual",
                                    desc: "Only scan when you explicitly click the scan button.",
                                },
                            ].map((f) => (
                                <div
                                    key={f.mode}
                                    className="flex items-baseline gap-3"
                                >
                                    <code className="mono text-sm bg-gray-100 px-2 py-0.5 rounded shrink-0 w-28 text-center">
                                        {f.mode}
                                    </code>
                                    <span className="text-sm text-gray-600">
                                        {f.desc}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <hr className="section-divider" />

                    {/* === TASK MANAGEMENT === */}
                    <section id="task-management" className="docs-section">
                        <h2 className="section-heading">Task Management</h2>
                        <p className="docs-p">
                            The task system is at the heart of sustn. It&apos;s
                            where discovered improvements are tracked,
                            prioritized, and managed through their entire
                            lifecycle.
                        </p>
                    </section>

                    <section id="task-lifecycle" className="docs-section">
                        <h3 className="subsection-heading">Task Lifecycle</h3>
                        <p className="docs-p">
                            Every task moves through a defined set of states:
                        </p>
                        <div className="my-8">
                            <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                                <Badge variant="default">pending</Badge>
                                <span className="text-gray-300">→</span>
                                <Badge variant="warning">in_progress</Badge>
                                <span className="text-gray-300">→</span>
                                <Badge variant="info">review</Badge>
                                <span className="text-gray-300">→</span>
                                <Badge variant="success">done</Badge>
                            </div>
                            <div className="flex justify-center gap-8 mt-3 text-sm text-gray-400">
                                <span>
                                    ↘ <Badge variant="danger">failed</Badge>
                                </span>
                                <span>
                                    ↘ <Badge>dismissed</Badge>
                                </span>
                            </div>
                        </div>
                        <div className="my-6 overflow-x-auto">
                            <table className="docs-table">
                                <thead>
                                    <tr>
                                        <th>State</th>
                                        <th>Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>
                                            <Badge>pending</Badge>
                                        </td>
                                        <td className="text-sm">
                                            Waiting in the backlog. The agent
                                            hasn&apos;t started working on this
                                            task yet.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <Badge variant="warning">
                                                in_progress
                                            </Badge>
                                        </td>
                                        <td className="text-sm">
                                            The agent is actively working —
                                            planning, implementing, or
                                            reviewing.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <Badge variant="info">review</Badge>
                                        </td>
                                        <td className="text-sm">
                                            Work is complete. The changes are on
                                            a branch, ready for your review.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <Badge variant="success">
                                                done
                                            </Badge>
                                        </td>
                                        <td className="text-sm">
                                            You&apos;ve approved the work. The
                                            PR has been merged or the task is
                                            resolved.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <Badge variant="danger">
                                                failed
                                            </Badge>
                                        </td>
                                        <td className="text-sm">
                                            The agent couldn&apos;t complete the
                                            work after maximum retries.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <Badge>dismissed</Badge>
                                        </td>
                                        <td className="text-sm">
                                            You&apos;ve decided this task
                                            isn&apos;t worth pursuing. The
                                            branch is cleaned up.
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section id="task-properties" className="docs-section">
                        <h3 className="subsection-heading">Task Properties</h3>
                        <p className="docs-p">
                            Each task carries detailed metadata to help you
                            understand and manage it:
                        </p>
                        <div className="my-6 space-y-3">
                            {[
                                {
                                    prop: "Title",
                                    desc: "A concise description of the improvement.",
                                },
                                {
                                    prop: "Description",
                                    desc: "Detailed explanation of what needs to change and why.",
                                },
                                {
                                    prop: "Category",
                                    desc: "Classification (security, tests, tech_debt, performance, etc.).",
                                },
                                {
                                    prop: "Priority",
                                    desc: "1 (critical) through 5 (trivial), set by the scanner or manually.",
                                },
                                {
                                    prop: "Effort",
                                    desc: "Low, medium, or high — helps plan which tasks to tackle first.",
                                },
                                {
                                    prop: "Files",
                                    desc: "List of files the agent identified as relevant to the task.",
                                },
                                {
                                    prop: "Branch",
                                    desc: "The Git branch where work will be (or has been) done.",
                                },
                                {
                                    prop: "Commit SHA",
                                    desc: "The commit hash of the completed work.",
                                },
                                {
                                    prop: "Tokens Used",
                                    desc: "How many Claude tokens were consumed for this task.",
                                },
                                {
                                    prop: "Retry Count",
                                    desc: "Number of implementation attempts (max 2 retries).",
                                },
                                {
                                    prop: "PR URL",
                                    desc: "Link to the GitHub pull request, if created.",
                                },
                                {
                                    prop: "Notes",
                                    desc: "Your own notes and constraints for the agent to consider.",
                                },
                            ].map((p) => (
                                <div
                                    key={p.prop}
                                    className="flex items-start gap-3"
                                >
                                    <code className="mono text-sm bg-gray-100 px-2 py-0.5 rounded shrink-0 min-w-[100px]">
                                        {p.prop}
                                    </code>
                                    <span className="text-sm text-gray-600">
                                        {p.desc}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <Callout type="tip" title="Task messages">
                            Each task has a chat timeline where you can see the
                            agent&apos;s progress, add feedback, and communicate
                            constraints. Messages from the agent include
                            detailed explanations of what was done and why.
                        </Callout>
                    </section>

                    <section id="prioritization" className="docs-section">
                        <h3 className="subsection-heading">Prioritization</h3>
                        <p className="docs-p">
                            sustn&apos;s prioritizer uses a multi-factor scoring
                            system to decide what to work on next. Both projects
                            and tasks are scored independently.
                        </p>
                        <div className="my-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <div className="font-semibold text-sm mb-3">
                                    Project Scoring
                                </div>
                                <ul className="text-sm text-gray-600 space-y-1.5">
                                    <li>User-set priority (1-5)</li>
                                    <li>Hours since last work (staleness)</li>
                                    <li>Number of pending tasks</li>
                                    <li>Highest task priority in backlog</li>
                                    <li>Tasks completed today (negative)</li>
                                </ul>
                            </div>
                            <div>
                                <div className="font-semibold text-sm mb-3">
                                    Task Scoring
                                </div>
                                <ul className="text-sm text-gray-600 space-y-1.5">
                                    <li>Priority (1-5 from scanner)</li>
                                    <li>
                                        Category weight (security=5x, tests=3x)
                                    </li>
                                    <li>Days since created (age bonus)</li>
                                    <li>Estimated effort level</li>
                                    <li>Manual user override</li>
                                </ul>
                            </div>
                        </div>
                        <p className="docs-p">
                            You can override automatic prioritization at any
                            time by dragging tasks to reorder them or setting
                            manual priorities.
                        </p>
                    </section>

                    <hr className="section-divider" />

                    {/* === EXECUTION === */}
                    <section id="execution" className="docs-section">
                        <h2 className="section-heading">Automated Execution</h2>
                        <p className="docs-p">
                            When the scheduler and budget allow, the
                            engine&apos;s worker module picks up tasks and
                            executes them through a structured three-phase
                            workflow.
                        </p>
                    </section>

                    <section id="work-phases" className="docs-section">
                        <h3 className="subsection-heading">Work Phases</h3>
                        <p className="docs-p">
                            Every task goes through three distinct phases, each
                            with a 30-minute timeout:
                        </p>
                        <div className="my-8">
                            <FlowStep
                                number={1}
                                title="Planning"
                                description="Claude reads the task description, examines the relevant files, and develops a plan of attack. It understands the codebase context, identifies dependencies, and scopes the exact changes needed."
                            />
                            <FlowStep
                                number={2}
                                title="Implementation"
                                description="Claude writes the code. It creates or modifies files, adds tests if appropriate, and commits the changes to the feature branch. The output includes a list of modified files, a summary of changes, and any tests added."
                            />
                            <FlowStep
                                number={3}
                                title="Review"
                                description="Claude self-reviews the implementation. It checks for correctness, style consistency, potential issues, and whether the original task requirements were fully addressed. The review outputs a pass/fail verdict with detailed feedback."
                                isLast
                            />
                        </div>
                        <CodeBlock title="Work output structure">
                            {`// Implementation output
{
  files_modified: ["src/auth/middleware.ts", "src/auth/middleware.test.ts"],
  summary: "Added input validation to auth middleware...",
  tests_added: true
}

// Review output
{
  passed: true,
  feedback: "Implementation correctly addresses the task...",
  issues: []
}`}
                        </CodeBlock>
                    </section>

                    <section id="retry-logic" className="docs-section">
                        <h3 className="subsection-heading">
                            Retry & Error Handling
                        </h3>
                        <p className="docs-p">
                            If the review phase fails or an error occurs during
                            implementation, the worker automatically retries up
                            to <strong>2 times</strong>. Each retry includes the
                            error feedback from the previous attempt, giving
                            Claude context to fix its approach.
                        </p>
                        <div className="my-6 p-4 rounded-lg bg-gray-50 border border-gray-100">
                            <div className="text-sm space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-emerald-500 font-bold mono">
                                        ✓
                                    </span>
                                    <span>
                                        Attempt 1 — Review passes → task moves
                                        to <Badge variant="info">review</Badge>
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-amber-500 font-bold mono">
                                        ↻
                                    </span>
                                    <span>
                                        Attempt 1 fails → retry with error
                                        context
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-amber-500 font-bold mono">
                                        ↻
                                    </span>
                                    <span>
                                        Attempt 2 fails → retry with accumulated
                                        feedback
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-red-500 font-bold mono">
                                        ✗
                                    </span>
                                    <span>
                                        Attempt 3 fails → task moves to{" "}
                                        <Badge variant="danger">failed</Badge>
                                    </span>
                                </div>
                            </div>
                        </div>
                        <p className="docs-p">
                            On failure, the branch is cleaned up and the agent
                            returns to the original branch. The error details
                            are stored in the task&apos;s{" "}
                            <code className="mono text-sm bg-gray-100 px-1 rounded">
                                lastError
                            </code>{" "}
                            field for debugging.
                        </p>
                    </section>

                    <hr className="section-divider" />

                    {/* === REVIEW === */}
                    <section id="review" className="docs-section">
                        <h2 className="section-heading">
                            Code Review & Pull Requests
                        </h2>
                        <p className="docs-p">
                            Once the agent completes a task, the changes land on
                            a feature branch. sustn provides a full code review
                            experience right inside the app.
                        </p>
                    </section>

                    <section id="diff-viewer" className="docs-section">
                        <h3 className="subsection-heading">Diff Viewer</h3>
                        <p className="docs-p">
                            The built-in diff viewer shows exactly what changed,
                            presented in a familiar side-by-side format:
                        </p>
                        <ul className="docs-list">
                            <li>
                                <strong>Changed files sidebar</strong> — Browse
                                all modified files with addition/deletion stats
                            </li>
                            <li>
                                <strong>Side-by-side diff</strong> — View old
                                and new code next to each other with syntax
                                highlighting
                            </li>
                            <li>
                                <strong>File content viewer</strong> — Read the
                                full file with syntax highlighting for deeper
                                context
                            </li>
                            <li>
                                <strong>Lines added/removed</strong> — Quick
                                stats on the scope of changes
                            </li>
                        </ul>
                        <Callout type="info">
                            The diff viewer uses the{" "}
                            <code className="mono text-sm">
                                react-diff-view
                            </code>{" "}
                            library for a GitHub-quality code review experience,
                            with unified or split-view modes.
                        </Callout>
                    </section>

                    <section id="creating-prs" className="docs-section">
                        <h3 className="subsection-heading">
                            Creating Pull Requests
                        </h3>
                        <p className="docs-p">
                            When you&apos;re satisfied with the agent&apos;s
                            work, you can create a pull request with one click.
                            sustn uses the GitHub CLI under the hood, so the PR
                            appears in your repository just like any other.
                        </p>
                        <div className="my-6">
                            <FlowStep
                                number={1}
                                title="Review the diff"
                                description="Examine the changes in the built-in diff viewer. Make sure everything looks correct."
                            />
                            <FlowStep
                                number={2}
                                title="Push the branch"
                                description="Click 'Push' to push the feature branch to your remote. sustn handles the git push with upstream tracking."
                            />
                            <FlowStep
                                number={3}
                                title="Create the PR"
                                description="Click 'Create PR' and sustn opens a pull request on GitHub with a title and description derived from the task."
                                isLast
                            />
                        </div>
                        <Callout type="tip" title="Auto-create PRs">
                            Enable the{" "}
                            <code className="mono text-sm">
                                Auto-create PRs
                            </code>{" "}
                            setting to have sustn automatically create pull
                            requests when tasks are completed — no manual step
                            required.
                        </Callout>
                    </section>

                    <hr className="section-divider" />

                    {/* === CONFIGURATION === */}
                    <section id="configuration" className="docs-section">
                        <h2 className="section-heading">Configuration</h2>
                        <p className="docs-p">
                            sustn is highly configurable. Global settings apply
                            to all projects by default, and individual projects
                            can override specific settings.
                        </p>
                    </section>

                    <section id="general-settings" className="docs-section">
                        <h3 className="subsection-heading">General Settings</h3>
                        <div className="my-6 overflow-x-auto">
                            <table className="docs-table">
                                <thead>
                                    <tr>
                                        <th>Setting</th>
                                        <th>Default</th>
                                        <th>Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="mono text-sm">
                                            Notifications
                                        </td>
                                        <td>
                                            <Badge variant="success">
                                                Enabled
                                            </Badge>
                                        </td>
                                        <td className="text-sm">
                                            Desktop notifications for scan
                                            completions, task ready for review,
                                            errors.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="mono text-sm">
                                            Sound Effects
                                        </td>
                                        <td>
                                            <Badge variant="success">
                                                Enabled
                                            </Badge>
                                        </td>
                                        <td className="text-sm">
                                            Audio feedback for events. Three
                                            presets: chime, ding, pop.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="mono text-sm">
                                            Auto-create PRs
                                        </td>
                                        <td>
                                            <Badge variant="danger">
                                                Disabled
                                            </Badge>
                                        </td>
                                        <td className="text-sm">
                                            Automatically open a GitHub PR when
                                            a task completes.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="mono text-sm">
                                            Delete branch on dismiss
                                        </td>
                                        <td>
                                            <Badge variant="success">
                                                Enabled
                                            </Badge>
                                        </td>
                                        <td className="text-sm">
                                            Clean up the feature branch when you
                                            dismiss a task.
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <Callout type="info" title="Sound presets">
                            All sound effects are synthesized in real-time using
                            the Web Audio API — no audio files needed.{" "}
                            <strong>Chime</strong> plays two ascending tones,{" "}
                            <strong>Ding</strong> is a bell-like tone, and{" "}
                            <strong>Pop</strong> is a short percussive sound.
                        </Callout>
                    </section>

                    <section id="git-branches" className="docs-section">
                        <h3 className="subsection-heading">
                            Git & Branch Settings
                        </h3>
                        <div className="my-6 overflow-x-auto">
                            <table className="docs-table">
                                <thead>
                                    <tr>
                                        <th>Setting</th>
                                        <th>Options</th>
                                        <th>Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="mono text-sm">
                                            Branch Prefix
                                        </td>
                                        <td>
                                            <code className="mono text-xs">
                                                sustn/
                                            </code>{" "}
                                            <code className="mono text-xs">
                                                custom/
                                            </code>{" "}
                                            <code className="mono text-xs">
                                                none
                                            </code>
                                        </td>
                                        <td className="text-sm">
                                            Prefix added to all feature branches
                                            created by the agent.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="mono text-sm">
                                            Branch Name Style
                                        </td>
                                        <td>
                                            <code className="mono text-xs">
                                                slug
                                            </code>{" "}
                                            <code className="mono text-xs">
                                                short-hash
                                            </code>{" "}
                                            <code className="mono text-xs">
                                                task-id
                                            </code>
                                        </td>
                                        <td className="text-sm">
                                            How the branch name is generated
                                            from the task title.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="mono text-sm">
                                            Default Base Branch
                                        </td>
                                        <td>
                                            <code className="mono text-xs">
                                                main
                                            </code>
                                        </td>
                                        <td className="text-sm">
                                            The branch from which feature
                                            branches are created.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="mono text-sm">
                                            Remote Origin
                                        </td>
                                        <td>
                                            <code className="mono text-xs">
                                                origin
                                            </code>
                                        </td>
                                        <td className="text-sm">
                                            The git remote used for push and PR
                                            operations.
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <CodeBlock title="Example branch names">
                            {`# slug style (default)
sustn/add-error-handling-to-auth-middleware

# short-hash style
sustn/a3f8b2

# task-id style
sustn/task-01j8k2m4n5`}
                        </CodeBlock>
                    </section>

                    <section id="scheduling" className="docs-section">
                        <h3 className="subsection-heading">Scheduling</h3>
                        <p className="docs-p">
                            Control exactly when the agent is allowed to work.
                            Three scheduling modes are available:
                        </p>
                        <div className="my-6 space-y-4">
                            <div className="p-4 rounded-lg border border-gray-200">
                                <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="success">Always</Badge>
                                    <span className="font-semibold text-sm">
                                        Work anytime
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600">
                                    The agent can work 24/7 as long as budget is
                                    available. Best for non-critical
                                    repositories where you want maximum
                                    throughput.
                                </p>
                            </div>
                            <div className="p-4 rounded-lg border-2 border-black">
                                <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="info">Scheduled</Badge>
                                    <span className="font-semibold text-sm">
                                        Work within time window
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600 mb-3">
                                    Set specific days and a time range. Supports
                                    overnight windows (e.g., 22:00–06:00). Ideal
                                    for working while you sleep.
                                </p>
                                <CodeBlock>
                                    {`Schedule: Mon-Fri, 22:00 - 06:00
Timezone: America/New_York`}
                                </CodeBlock>
                            </div>
                            <div className="p-4 rounded-lg border border-gray-200">
                                <div className="flex items-center gap-2 mb-2">
                                    <Badge>Manual</Badge>
                                    <span className="font-semibold text-sm">
                                        Work on demand
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600">
                                    The agent only works when you explicitly
                                    start a task. Full manual control over when
                                    work happens.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section id="budget-controls" className="docs-section">
                        <h3 className="subsection-heading">Budget Controls</h3>
                        <div className="my-6 overflow-x-auto">
                            <table className="docs-table">
                                <thead>
                                    <tr>
                                        <th>Setting</th>
                                        <th>Default</th>
                                        <th>Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="mono text-sm">
                                            Budget Ceiling %
                                        </td>
                                        <td className="mono">80%</td>
                                        <td className="text-sm">
                                            Maximum percentage of your weekly
                                            Claude token budget that sustn can
                                            use.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="mono text-sm">
                                            Reserve %
                                        </td>
                                        <td className="mono">10%</td>
                                        <td className="text-sm">
                                            Tokens reserved for your personal
                                            interactive Claude use.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="mono text-sm">
                                            Show in Sidebar
                                        </td>
                                        <td>
                                            <Badge variant="success">Yes</Badge>
                                        </td>
                                        <td className="text-sm">
                                            Display remaining budget in the
                                            sidebar status card.
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section id="project-overrides" className="docs-section">
                        <h3 className="subsection-heading">
                            Per-Project Overrides
                        </h3>
                        <p className="docs-p">
                            Any global setting can be overridden on a
                            per-project basis. This lets you apply different
                            strategies to different repositories:
                        </p>
                        <ul className="docs-list">
                            <li>
                                <strong>Agent Preferences</strong> — Free-form
                                text instructions that Claude considers when
                                working on this project (e.g., &quot;Always use
                                TypeScript strict mode&quot;).
                            </li>
                            <li>
                                <strong>Scan Preferences</strong> — Custom
                                instructions for how the scanner should analyze
                                this project (e.g., &quot;Focus on test
                                coverage&quot;).
                            </li>
                            <li>
                                <strong>Base Branch</strong> — Override the
                                default base branch for this project.
                            </li>
                            <li>
                                <strong>Remote Origin</strong> — Use a different
                                git remote.
                            </li>
                            <li>
                                <strong>Budget Ceiling</strong> — Set a
                                project-specific token limit.
                            </li>
                        </ul>
                    </section>

                    <hr className="section-divider" />

                    {/* === ARCHITECTURE === */}
                    <section id="architecture" className="docs-section">
                        <h2 className="section-heading">Architecture</h2>
                        <p className="docs-p">
                            For contributors and technically curious users,
                            here&apos;s a deep dive into how sustn is built.
                        </p>
                    </section>

                    <section id="tech-stack" className="docs-section">
                        <h3 className="subsection-heading">Tech Stack</h3>
                        <div className="my-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 rounded-lg border border-gray-200">
                                <div className="text-xs mono text-gray-400 mb-2">
                                    FRONTEND
                                </div>
                                <ul className="text-sm space-y-1.5">
                                    <li>React 19 + TypeScript 5</li>
                                    <li>Vite 6 (build tool)</li>
                                    <li>Tailwind CSS 3</li>
                                    <li>shadcn/ui (component library)</li>
                                    <li>TanStack Query v5 (async state)</li>
                                    <li>Zustand v5 (client state)</li>
                                    <li>React Router v6 (routing)</li>
                                </ul>
                            </div>
                            <div className="p-4 rounded-lg border border-gray-200">
                                <div className="text-xs mono text-gray-400 mb-2">
                                    BACKEND
                                </div>
                                <ul className="text-sm space-y-1.5">
                                    <li>Tauri v2 (native shell)</li>
                                    <li>Rust (backend logic)</li>
                                    <li>SQLite (database)</li>
                                    <li>Claude CLI (AI agent)</li>
                                    <li>GitHub CLI (git operations)</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    <section id="data-flow" className="docs-section">
                        <h3 className="subsection-heading">Data Flow</h3>
                        <p className="docs-p">
                            Data flows through the application in a predictable
                            pattern:
                        </p>
                        <div className="my-8 p-6 bg-gray-50 rounded-lg border border-gray-100">
                            <div className="space-y-3 text-sm mono">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="bg-white border border-gray-200 px-3 py-1 rounded">
                                        User Action
                                    </span>
                                    <span className="text-gray-300">→</span>
                                    <span className="bg-white border border-gray-200 px-3 py-1 rounded">
                                        React Component
                                    </span>
                                    <span className="text-gray-300">→</span>
                                    <span className="bg-white border border-gray-200 px-3 py-1 rounded">
                                        TanStack Query
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 pl-8 flex-wrap">
                                    <span className="text-gray-300">→</span>
                                    <span className="bg-white border border-gray-200 px-3 py-1 rounded">
                                        Tauri IPC
                                    </span>
                                    <span className="text-gray-300">→</span>
                                    <span className="bg-black text-white px-3 py-1 rounded">
                                        Rust Handler
                                    </span>
                                    <span className="text-gray-300">→</span>
                                    <span className="bg-white border border-gray-200 px-3 py-1 rounded">
                                        SQLite
                                    </span>
                                </div>
                                <div className="text-center text-gray-400">
                                    ↕ response
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="bg-white border border-gray-200 px-3 py-1 rounded">
                                        SQLite
                                    </span>
                                    <span className="text-gray-300">→</span>
                                    <span className="bg-black text-white px-3 py-1 rounded">
                                        Rust Response
                                    </span>
                                    <span className="text-gray-300">→</span>
                                    <span className="bg-white border border-gray-200 px-3 py-1 rounded">
                                        Query Cache
                                    </span>
                                    <span className="text-gray-300">→</span>
                                    <span className="bg-white border border-gray-200 px-3 py-1 rounded">
                                        UI Update
                                    </span>
                                </div>
                            </div>
                        </div>
                        <p className="docs-p">
                            The Tauri IPC layer provides type-safe communication
                            between the React frontend and Rust backend. Events
                            flow bidirectionally — the backend emits events
                            (like scan progress) that the frontend subscribes to
                            through TanStack Query&apos;s event integration.
                        </p>
                    </section>

                    <section id="engine-modules" className="docs-section">
                        <h3 className="subsection-heading">Engine Modules</h3>
                        <p className="docs-p">
                            The agent engine is built from six specialized Rust
                            modules, each with a clear responsibility:
                        </p>
                        <CodeBlock title="src-tauri/src/engine/">
                            {`engine/
├── mod.rs          Core EngineState, Claude CLI invocation
├── scanner.rs      Two-pass codebase analysis
├── worker.rs       Task execution (plan → implement → review)
├── scheduler.rs    Time window & schedule validation
├── prioritizer.rs  Project & task scoring algorithms
├── budget.rs       Token usage tracking & budget calculations
├── git.rs          Git operations wrapper
└── db.rs           Direct database operations from Rust`}
                        </CodeBlock>
                        <p className="docs-p">
                            The engine state is managed as a thread-safe
                            singleton using{" "}
                            <code className="mono text-sm bg-gray-100 px-1 rounded">
                                Arc&lt;EngineState&gt;
                            </code>
                            , shared across all Tauri command handlers. It
                            tracks the current running status, active task, and
                            cancellation token for the scheduler loop.
                        </p>
                        <CodeBlock title="EngineState structure">
                            {`pub struct EngineState {
    pub running: RwLock<bool>,
    pub current_task: Mutex<Option<CurrentTask>>,
    pub cancel_token: Mutex<Option<CancellationToken>>,
}`}
                        </CodeBlock>
                        <p className="docs-p">
                            Claude CLI is invoked as a subprocess with the{" "}
                            <code className="mono text-sm bg-gray-100 px-1 rounded">
                                --print
                            </code>{" "}
                            and{" "}
                            <code className="mono text-sm bg-gray-100 px-1 rounded">
                                --output-format json
                            </code>{" "}
                            flags, enabling structured output parsing. Each
                            invocation has a 30-minute timeout to prevent
                            runaway processes.
                        </p>
                    </section>

                    {/* ─── Footer ─── */}
                    <div className="mt-16 pt-8 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-gray-400 text-sm">
                                <Logo size={12} className="animate-slow-spin" />
                                <span className="mono">sustn docs</span>
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
