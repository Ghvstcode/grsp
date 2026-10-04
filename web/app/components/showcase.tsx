"use client";

import { useState, type ReactNode } from "react";
import { GistMock, ReviewMock, WalkthroughMock } from "./mocks";

const TABS: {
    id: string;
    title: string;
    line: string;
    mock: () => ReactNode;
}[] = [
    {
        id: "gist",
        title: "Gist",
        line: "What the author says, what the code does, and where the two disagree.",
        mock: () => <GistMock />,
    },
    {
        id: "walkthrough",
        title: "Walkthrough",
        line: "Step through the changed behaviour like a debugger, and ask “what if”.",
        mock: () => <WalkthroughMock />,
    },
    {
        id: "review",
        title: "Review",
        line: "Findings with the code beside them. Edit, choose a verdict, post to GitHub.",
        mock: () => <ReviewMock />,
    },
];

/** The three tabs of the app, switchable, each with its product mock. */
export function Showcase() {
    const [active, setActive] = useState(0);
    const tab = TABS[active];

    return (
        <div>
            <div
                role="tablist"
                aria-label="What grsp shows you"
                className="grid grid-cols-1 sm:grid-cols-3 gap-x-8"
            >
                {TABS.map((t, i) => {
                    const selected = i === active;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            onClick={() => setActive(i)}
                            className={`group text-left pt-5 pb-6 border-t-[1.5px] transition-colors ${
                                selected
                                    ? "border-ink"
                                    : "border-line hover:border-line-strong"
                            }`}
                        >
                            <div className="flex items-center gap-2.5">
                                <span
                                    className={`h-2 w-2 rounded-full transition-all ${
                                        selected
                                            ? "bg-ink scale-150"
                                            : "bg-line-strong"
                                    }`}
                                />
                                <span className="mono text-[11px] tracking-[0.08em] text-text-3">
                                    0{i + 1}
                                </span>
                                <span
                                    className={`text-lg font-semibold tracking-tight ${
                                        selected ? "text-ink" : "text-text-3"
                                    }`}
                                >
                                    {t.title}
                                </span>
                            </div>
                            <p
                                className={`mt-2 text-[15px] leading-relaxed ${
                                    selected ? "text-text-2" : "text-text-3"
                                }`}
                            >
                                {t.line}
                            </p>
                        </button>
                    );
                })}
            </div>

            <div role="tabpanel" className="mt-6">
                {tab.mock()}
            </div>
        </div>
    );
}
