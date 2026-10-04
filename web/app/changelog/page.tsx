import type { Metadata } from "next";
import { GITHUB_URL, GitHubIcon, Logo, Wordmark } from "../components/logo";
import { changelog, type ChangelogEntry } from "./data";

export const metadata: Metadata = {
    title: "Changelog — grsp",
    description:
        "What's new in grsp. Release notes, features, improvements, and fixes.",
};

function EntrySection({
    heading,
    items,
}: {
    heading: string;
    items: string[];
}) {
    if (items.length === 0) return null;
    return (
        <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
                {heading}
            </h4>
            <ul className="space-y-1.5">
                {items.map((item, i) => (
                    <li
                        key={i}
                        className="flex items-start gap-2.5 text-sm text-gray-600 leading-relaxed"
                    >
                        <span className="mt-[7px] w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                        <span
                            dangerouslySetInnerHTML={{
                                __html: formatInlineCode(item),
                            }}
                        />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function formatInlineCode(text: string): string {
    return text.replace(
        /`([^`]+)`/g,
        '<code class="bg-gray-100 text-gray-800 text-xs px-1.5 py-0.5 rounded font-mono">$1</code>',
    );
}

function Entry({ entry, isLast }: { entry: ChangelogEntry; isLast: boolean }) {
    return (
        <article
            className={`relative grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-4 sm:gap-8 pb-12 ${!isLast ? "border-b border-gray-100 mb-12" : ""}`}
        >
            {/* Date + version sidebar */}
            <div className="sm:text-right">
                <div className="mono text-sm font-semibold text-black">
                    {entry.version}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{entry.date}</div>
            </div>

            {/* Content */}
            <div className="min-w-0">
                <h3 className="text-lg font-bold tracking-tight text-black">
                    {entry.title}
                </h3>

                {entry.description && (
                    <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                        {entry.description}
                    </p>
                )}

                {entry.image && (
                    <div className="mt-5 rounded-lg overflow-hidden border border-gray-100">
                        <img
                            src={entry.image.src}
                            alt={entry.image.alt}
                            className="w-full h-auto"
                            loading="lazy"
                        />
                    </div>
                )}

                {entry.features && (
                    <EntrySection heading="Features" items={entry.features} />
                )}
                {entry.improvements && (
                    <EntrySection
                        heading="Improvements"
                        items={entry.improvements}
                    />
                )}
                {entry.fixes && (
                    <EntrySection heading="Fixes" items={entry.fixes} />
                )}
            </div>
        </article>
    );
}

export default function ChangelogPage() {
    return (
        <div className="min-h-screen bg-white text-black font-sans">
            {/* Nav */}
            <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
                <div className="max-w-5xl mx-auto flex items-center justify-between px-6 h-[52px]">
                    <a href="/" className="flex items-center gap-2">
                        <Logo size={20} />
                        <Wordmark className="text-[1.05em]" />
                    </a>
                    <div className="flex items-center gap-6">
                        <a
                            href="/changelog"
                            className="text-sm text-black font-medium transition-colors hidden sm:block"
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
                            href={GITHUB_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-black transition-colors hidden sm:block"
                            aria-label="GitHub"
                        >
                            <GitHubIcon />
                        </a>
                        <a
                            href="/#download"
                            className="text-sm bg-black text-white font-medium px-3.5 py-1.5 rounded-lg hover:bg-gray-800 transition-colors mono"
                        >
                            Download
                        </a>
                    </div>
                </div>
            </nav>

            {/* Header */}
            <header className="pt-28 pb-12 px-6 sm:px-16">
                <div className="max-w-3xl mx-auto">
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                        Changelog
                    </h1>
                    <p className="mt-2 text-gray-500 text-sm">
                        New features, improvements, and fixes shipped in each
                        release.
                    </p>
                </div>
            </header>

            {/* Entries */}
            <main className="px-6 sm:px-16 pb-20">
                <div className="max-w-3xl mx-auto">
                    {changelog.map((entry, i) => (
                        <Entry
                            key={entry.version}
                            entry={entry}
                            isLast={i === changelog.length - 1}
                        />
                    ))}
                </div>
            </main>

            {/* Footer */}
            <footer className="py-12 px-6 sm:px-16 border-t border-gray-100">
                <div className="max-w-3xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-2 text-gray-500 font-medium">
                        <Logo size={12} />© {new Date().getFullYear()} grsp
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
