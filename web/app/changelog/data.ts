export interface ChangelogImage {
    src: string;
    alt: string;
}

export interface ChangelogEntry {
    version: string;
    date: string; // e.g. "Feb 23rd, 2026"
    title: string;
    description?: string;
    image?: ChangelogImage;
    features?: string[];
    improvements?: string[];
    fixes?: string[];
}

export const changelog: ChangelogEntry[] = [
    {
        version: "0.1.0",
        date: "Oct 3rd, 2026",
        title: "First release — understand pull requests instead of reading diffs",
        description:
            "grsp opens a pull request in a read-only worktree, lets your own Claude Code or Codex explore it, and verifies everything the agent says against git before showing it to you.",
        features: [
            "Review sessions — paste a GitHub PR URL, pick from a repo's open PRs, or compare two branches",
            'Gist — "Author says" next to "Code does", a mismatch callout when they disagree, the affected entry points (including the ones the PR should have touched and didn\'t), comprehension questions, and a digest of the GitHub discussion',
            "Ask — questions answered from the code, with an excerpt and verified `file:line` references",
            'Walkthrough — step through the changed behaviour block by block, with "what if" inputs that re-route the path',
            "Review — an AI review with your own prompt, editable findings (Blocking / Should fix / Nit), and one-click posting to GitHub with inline comments where the line is part of the diff",
            "Verification layer — every code reference is checked against the worktree; change status, line numbers and excerpts come from git, never from the agent",
            "Runs on your existing Claude Code or Codex subscription — no API keys",
            "Per-repo review prompt in `.grsp/prompt.md` and analysis excludes in `.grsp/config.toml`",
        ],
    },
];
