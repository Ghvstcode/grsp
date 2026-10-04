import { Reveal } from "./components/reveal";
import { DownloadDropdown } from "./components/download-dropdown";
import { GITHUB_URL, GitHubIcon, Logo, Wordmark } from "./components/logo";
import { DotField } from "./components/dot-field";
import { Showcase } from "./components/showcase";

function Eyebrow({ children }: { children: React.ReactNode }) {
    return (
        <div className="mono text-[11px] tracking-[0.1em] uppercase text-text-3">
            {children}
        </div>
    );
}

function ArrowIcon() {
    return (
        <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 8l4 4m0 0l-4 4m4-4H3"
            />
        </svg>
    );
}

/** One line of the "git confirms" list: the dot, then the rule. */
function Rule({ title, children }: { title: string; children: string }) {
    return (
        <li className="flex gap-4 py-5 border-t border-white/15">
            <span className="mt-[9px] h-2 w-2 shrink-0 rounded-full bg-white" />
            <div>
                <div className="font-semibold text-white">{title}</div>
                <p className="mt-1 text-[15px] leading-relaxed text-white/65">
                    {children}
                </p>
            </div>
        </li>
    );
}

function Fact({ title, children }: { title: string; children: string }) {
    return (
        <div className="border-t-[1.5px] border-ink pt-5">
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-text-2">
                {children}
            </p>
        </div>
    );
}

export default function Home() {
    return (
        <div className="min-h-screen bg-white text-ink font-sans">
            {/* ─── Nav ─── */}
            <nav className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-line">
                <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-14">
                    <a href="/" className="flex items-center gap-2.5">
                        <Logo size={22} />
                        <Wordmark className="text-[19px]" />
                    </a>
                    <div className="flex items-center gap-7">
                        <a
                            href="#how-it-works"
                            className="text-sm text-text-2 hover:text-ink transition-colors hidden sm:block"
                        >
                            How it works
                        </a>
                        <a
                            href="/docs"
                            className="text-sm text-text-2 hover:text-ink transition-colors hidden sm:block"
                        >
                            Docs
                        </a>
                        <a
                            href="/changelog"
                            className="text-sm text-text-2 hover:text-ink transition-colors hidden sm:block"
                        >
                            Changelog
                        </a>
                        <a
                            href={GITHUB_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-text-2 hover:text-ink transition-colors hidden sm:block"
                            aria-label="GitHub"
                        >
                            <GitHubIcon />
                        </a>
                        <DownloadDropdown
                            align="right"
                            className="text-sm bg-ink text-white font-medium px-4 py-2 rounded-full hover:bg-black/80 transition-colors"
                        >
                            Download
                        </DownloadDropdown>
                    </div>
                </div>
            </nav>

            {/* ─── Hero ─── */}
            <header className="px-6">
                <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-14 lg:gap-16 items-center pt-16 sm:pt-24 pb-20 sm:pb-28">
                    <div>
                        <div className="animate-fade-in-up">
                            <Eyebrow>Pull requests · macOS</Eyebrow>
                        </div>
                        <h1 className="mt-6 text-[clamp(2.6rem,6.2vw,4.9rem)] font-bold tracking-[-0.045em] leading-[0.98] animate-fade-in-up delay-75">
                            Stop reading diffs.
                            <br />
                            <span className="text-text-3">
                                Understand the change.
                            </span>
                        </h1>
                        <p className="mt-7 max-w-[30rem] text-lg leading-relaxed text-text-2 animate-fade-in-up delay-150">
                            A diff shows which lines moved. grsp shows what the
                            system does differently now: what a pull request
                            really changes, the paths it forgot, and whether the
                            description is true.
                        </p>
                        <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4 animate-fade-in-up delay-200">
                            <DownloadDropdown
                                align="left"
                                className="bg-ink text-white pl-6 pr-5 py-3.5 rounded-full font-medium hover:bg-black/80 transition-colors inline-flex items-center gap-2.5"
                            >
                                Download for Mac
                                <ArrowIcon />
                            </DownloadDropdown>
                            <a
                                href="#how-it-works"
                                className="text-[15px] font-medium underline decoration-line-strong underline-offset-[5px] hover:decoration-ink transition-colors"
                            >
                                See what it shows you
                            </a>
                        </div>
                        <p className="mt-6 mono text-xs text-text-3 animate-fade-in-up delay-300">
                            Runs on your Claude Code or Codex subscription. No
                            API keys.
                        </p>
                    </div>

                    <div className="animate-fade-in-up delay-150">
                        <DotField />
                    </div>
                </div>
            </header>

            {/* ─── What it shows you ─── */}
            <section
                id="how-it-works"
                className="px-6 py-20 sm:py-28 border-t border-line scroll-mt-14"
            >
                <div className="max-w-6xl mx-auto">
                    <div className="max-w-2xl">
                        <Eyebrow>What it shows you</Eyebrow>
                        <h2 className="mt-5 text-[clamp(1.9rem,4vw,3rem)] font-bold tracking-[-0.035em] leading-[1.05]">
                            Point it at a pull request. Get the behaviour, not
                            the lines.
                        </h2>
                        <p className="mt-5 text-lg leading-relaxed text-text-2">
                            Paste a link, pick an open PR, or choose two
                            branches. grsp gives you three ways into the change.
                        </p>
                    </div>
                    <Reveal className="mt-14">
                        <Showcase />
                    </Reveal>
                </div>
            </section>

            {/* ─── Trust ─── */}
            <section className="px-6 py-20 sm:py-28 bg-ink text-white">
                <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-14 lg:gap-20">
                    <div>
                        <div className="mono text-[11px] tracking-[0.1em] uppercase text-white/55">
                            Why you can trust it
                        </div>
                        <h2 className="mt-5 text-[clamp(2.1rem,4.6vw,3.6rem)] font-bold tracking-[-0.04em] leading-[1.02]">
                            The agent discovers.
                            <br />
                            <span className="text-white/55">Git confirms.</span>
                        </h2>
                        <p className="mt-6 max-w-md text-lg leading-relaxed text-white/65">
                            Your coding agent does the reading. Nothing it says
                            about your code reaches the screen until grsp has
                            checked it against the repository.
                        </p>
                        <div className="mt-10 inline-flex items-center gap-2.5 rounded-full border border-white/20 px-4 py-2 mono text-xs text-white/75">
                            <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            Agent explored 23 files · 41 references verified · 2
                            unverified
                        </div>
                    </div>
                    <ul className="border-b border-white/15 self-end">
                        <Rule title="Every file and line is checked">
                            Each reference the agent gives is matched against
                            the code at the PR’s head. If the line doesn’t say
                            what the agent claims, the reference is dropped.
                        </Rule>
                        <Rule title="Change status comes from the diff">
                            New, changed, unchanged, not covered: grsp works
                            these out from git, never from the model.
                        </Rule>
                        <Rule title="All code on screen is read from disk">
                            Excerpts come from the worktree, with diff markers
                            from git. The agent never supplies code text.
                        </Rule>
                        <Rule title="It tells you what it couldn’t verify">
                            Every analysis shows how much was explored, verified
                            and left unverified.
                        </Rule>
                    </ul>
                </div>
            </section>

            {/* ─── Facts ─── */}
            <section className="px-6 py-20 sm:py-28">
                <div className="max-w-6xl mx-auto">
                    <div className="max-w-2xl">
                        <Eyebrow>How it runs</Eyebrow>
                        <h2 className="mt-5 text-[clamp(1.9rem,4vw,3rem)] font-bold tracking-[-0.035em] leading-[1.05]">
                            On your Mac, with the agent you already pay for.
                        </h2>
                    </div>
                    <div className="mt-14 grid sm:grid-cols-3 gap-x-8 gap-y-10">
                        <Fact title="No API keys">
                            grsp runs the Claude Code or Codex CLI you are
                            already signed in to, in read-only mode. It never
                            asks for, uses or stores a model key.
                        </Fact>
                        <Fact title="Any language">
                            There is no parser and no list of supported
                            frameworks. If your agent can read the code, grsp
                            can verify what it says about it.
                        </Fact>
                        <Fact title="Your code stays put">
                            The repository is read from a worktree on your disk.
                            The only place it goes is your own agent, under the
                            terms you already have.
                        </Fact>
                    </div>
                </div>
            </section>

            {/* ─── CTA ─── */}
            <section
                id="download"
                className="px-6 py-24 sm:py-32 border-t border-line scroll-mt-14"
            >
                <div className="max-w-3xl mx-auto flex flex-col items-center text-center">
                    <Reveal>
                        <Logo size={88} animated />
                    </Reveal>
                    <h2 className="mt-10 text-[clamp(2.1rem,5vw,3.6rem)] font-bold tracking-[-0.04em] leading-[1.02]">
                        Nine changes.
                        <br />
                        <span className="text-text-3">
                            One of them matters.
                        </span>
                    </h2>
                    <p className="mt-6 text-lg text-text-2">
                        Find it before you approve.
                    </p>
                    <DownloadDropdown className="mt-9 bg-ink text-white pl-7 pr-6 py-4 rounded-full font-medium text-lg hover:bg-black/80 transition-colors inline-flex items-center gap-3">
                        Download for Mac
                        <ArrowIcon />
                    </DownloadDropdown>
                    <p className="mt-5 mono text-xs text-text-3">
                        Open source · macOS · Apple silicon and Intel
                    </p>
                </div>
            </section>

            {/* ─── Footer ─── */}
            <footer className="px-6 py-10 border-t border-line">
                <div className="max-w-6xl mx-auto flex flex-wrap justify-between items-center gap-4 text-sm text-text-3">
                    <div className="flex items-center gap-2">
                        <Logo size={14} />© {new Date().getFullYear()} grsp
                    </div>
                    <div className="flex gap-7">
                        <a
                            href="/docs"
                            className="hover:text-ink transition-colors"
                        >
                            Docs
                        </a>
                        <a
                            href="/changelog"
                            className="hover:text-ink transition-colors"
                        >
                            Changelog
                        </a>
                        <a
                            href={GITHUB_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-ink transition-colors"
                        >
                            GitHub
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
