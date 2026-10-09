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
        version: "0.2.0",
        date: "Oct 9th, 2026",
        title: "Review commits, read the code, keep notes",
        description:
            "grsp no longer needs a pull request. Point it at a commit, or at everything pushed to a branch since you last looked.",
        features: [
            "Commits — a fourth way to start a review. Pick a branch and review one commit, a commit and everything newer, or everything since you last looked. The commit message stands in for the PR description",
            "Code tab — the whole diff, file by file, in split or unified view. File references elsewhere in the app jump straight to the line",
            "Notes — private notes on a review, on a line of code or on a walkthrough step, with copy and export as Markdown",
        ],
        improvements: [
            "Commit reviews link to the commit or comparison on GitHub when the repository has a GitHub remote",
        ],
    },
    {
        version: "0.1.2",
        date: "Oct 8th, 2026",
        title: "Git LFS repositories, properly this time",
        fixes: [
            "Pull requests in Git LFS repositories still failed to open, now with \"This repository is configured for Git LFS but 'git-lfs' was not found\". 0.1.1 turned off the LFS filter but not the checkout hook that Git LFS installs. grsp no longer runs a repository's git hooks at all.",
        ],
    },
    {
        version: "0.1.1",
        date: "Oct 8th, 2026",
        title: "Git LFS repositories, cleaner discussions, a new look",
        description:
            "Fixes from the first days of real use, plus grsp's own logo.",
        features: [
            "Paste a PR link for a repository you don't have locally and grsp offers to clone it for you",
            "New logo and wordmark, with an animated intro on the welcome screen",
        ],
        improvements: [
            "GitHub comments render as markdown; bot comments from CI, linkbacks and auto-summaries are folded as Automated and left out of the thread counts",
            "Long file paths in discussion threads shorten to their file name instead of pushing the summary off the row",
        ],
        fixes: [
            'Pull requests in repositories that use Git LFS failed to open with "smudge filter lfs failed"',
            "The New review dialog spilled past its edge when a pull request had a long title",
            "A newly created review was deselected a moment after opening",
        ],
    },
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
