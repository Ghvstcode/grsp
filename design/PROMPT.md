# Build grsp

You are building **grsp**, a macOS desktop app for *understanding* pull requests instead of reading diffs. Work autonomously until every milestone below is done and verified. Don't stop to ask me questions: when something is ambiguous, make the reasonable call, note it in `DECISIONS.md`, and keep going.

## Sources of truth

1. **`design/SPEC.md`** is the functional spec: what every feature computes, where its data comes from, the agent JSON schemas, edge cases and acceptance criteria. It is the source of truth for behaviour. Read it fully before writing any code, and when you implement a feature, re-read its section first.
2. **`design/DESIGN.md`** is the UI spec: screens, states and visual tokens.
3. **`design/prototype.html`** is the clickable design prototype. It runs on a design-tool runtime, so don't execute or port it. Read its markup and inline styles for exact layout and spacing, and lift the demo data in its `<script>` block (walkthrough blocks, findings, threads, ask answers) as fixtures.
4. **The sustn codebase** (https://github.com/Ghvstcode/sustn) is the foundation. Clone it next to this repo (`git clone https://github.com/Ghvstcode/sustn ../sustn`) and treat it as the reference implementation for everything foundational. Read its `CLAUDE.md`, `CONTRIBUTING.md` and `docs/` first. Never modify `../sustn`.

When you're unsure how to do something, check how sustn does it before inventing a new pattern. Consistency with sustn beats novelty.

## What to carry over from sustn

Copy these, then adapt and rename (sustn → grsp in app name, bundle identifier, window titles, URLs, env vars, package names and icons/placeholders):

- **Repo scaffolding:** `package.json` scripts, pnpm setup, Vite, TypeScript config, ESLint, Prettier, Husky and lint-staged, `.github/workflows` (CI, release and nightly), `.env.example`, `CLAUDE.md` (rewritten for grsp), and `CONTRIBUTING.md`.
- **Desktop shell:** the `src-tauri` setup (Tauri v2), plugins, capabilities and permissions, the SQLite setup via `tauri-plugin-sql` with its migration pattern, and the app updater if present.
- **Frontend foundations:** React 19, Tailwind, the shadcn/ui components in `components.json` and `src/components/ui`, the Zustand store patterns, TanStack Query setup, layout primitives, theming, and fonts.
- **Onboarding flow:** reuse its structure and components. Adapt the steps to: welcome → detect agent (Claude Code or Codex) → connect GitHub → add a repo folder → done.
- **Agent CLI integration in Rust:** detecting the Claude Code and Codex binaries, checking sign-in, spawning headless runs, streaming output, cancellation, and error handling. grsp uses the user's existing subscription. **No API keys anywhere.** This is grsp's core engine, so study sustn's implementation closely.
- **GitHub auth:** however sustn authenticates with GitHub, reuse it.
- **`server/`:** the backend for signups and waitlist. Rename it and keep its behaviour.
- **`web/`:** the marketing site and docs. Rebuild the landing page for grsp with the same structure and quality, using the copy direction below.

**Do not carry over** sustn's product logic: scanning, the task backlog, budget tracking and scheduling, the implement → review → retry loop, or branch creation. Remove anything that only served those.

## The product (summary; SPEC.md has the behaviour, DESIGN.md has the look)

The user adds repo folders. They open a **review session** for a PR, either by pasting a PR URL, picking from open PRs in the repo, or choosing two branches. grsp then shows three tabs.

- **Gist:**
  - "Author says" vs "Code does", with a **mismatch** callout when they disagree.
  - Affected entry points.
  - Comprehension questions.
  - The existing GitHub discussion, collapsed and summarised.
  - An **Ask** panel on the right that answers questions grounded in the code, with code excerpts and `file:line` refs.
- **Walkthrough:** a debugger for behaviour. The user picks an entry point and steps through a chain of blocks (route → service → policy → DB write → event → external call). Each block has a plain-English note, any decision with the taken branch, and its code. "What if" inputs re-route the path.
- **Review:** runs an AI review with the user's configurable prompt. It produces findings (Blocking / Should fix / Nit), each with code and an editable comment. The user picks Comment / Approve / Request changes and posts the review to GitHub.

The sidebar groups sessions by repo folder. Settings covers:

- The review prompt, with a per-repo override in `.grsp/prompt.md`.
- Agent selection (Claude Code / Codex) with detection status.
- Analysis toggles and trace depth.
- Git hosts.
- Repositories.

Visual direction: strict black and white, Geist and Geist Mono, as specified in DESIGN.md. Where DESIGN.md and sustn's styling conflict, DESIGN.md wins for grsp screens. Restyle the shadcn components with grsp's tokens rather than writing new ones.

## Architecture

grsp is **agent-first** (SPEC.md §0). The user's Claude Code or Codex does all of the code understanding. grsp's Rust core does **no language parsing**: no tree-sitter, no framework detection. It provides git facts, verification and orchestration. The non-negotiable rule: **the agent discovers and interprets; git and the worktree confirm.** Change status, line numbers, code excerpts, comment threads and CI are never taken from agent output, and every `file:line` the agent returns is verified before it's shown.

**Rust (`src-tauri`) modules:**

- `git`:
  - Resolve a GitHub PR to base and head refs and fetch them.
  - Create a **read-only worktree** at head, and clean it up.
  - Build the **DiffMap** from the merge base, with renames and vendored or generated exclusions.
- `verify`: the trust layer and the most important code in the app (SPEC.md §3).
  - CodeRef verification with anchor matching, snapping and dropping.
  - Change status computed from the DiffMap.
  - Edge spot-checks.
  - Excerpt reading.
  - VerificationReports.
  - Unit-test this module heavily.
- `agent`: one runner for Claude Code (`claude -p`, read/search/list tools only) and Codex (`codex exec`, read-only sandbox), reusing sustn's CLI integration.
  - Prompt layering as specified.
  - JSON output parsed with serde, with one repair retry.
  - Streamed tool activity as progress lines.
  - Timeouts, cancellation, at most 2 concurrent passes, and sharding for large PRs.
- `pipelines`: `discovery`, `questions`, `walkthrough`, `ask`, `discussion` and `review`, each following its SPEC.md §5 section exactly. Every pipeline is: build the prompt → run the agent → parse → **verify** → persist.
- `github`:
  - List open PRs.
  - Fetch PR metadata, CI status and comments, including GraphQL review threads.
  - Post reviews via the "create a review" endpoint.

**SQLite tables** (follow sustn's migration pattern): `repos`, `review_sessions`, `analyses`, `ask_messages`, `question_state`, `findings`, `settings`. Everything is cached by `headSha`.

**Frontend:** TanStack Query wraps the Tauri commands, and Zustand holds UI state. Pipelines stream progress events. Sections render progressively, and each has its own loading, error and Retry state.

## Milestones

Commit at the end of each milestone, and run `pnpm validate` and `pnpm test` before every commit. Fix failures before moving on.

1. **Foundation:** carry over sustn's scaffolding, shell, DB, onboarding, server and web, renamed to grsp, with sustn's product logic removed. The app launches to an empty grsp shell.
2. **UI on fixtures:**
   - Build every screen in DESIGN.md (sidebar, PR header, Gist + Ask, Walkthrough, Review, Settings) using fixture data lifted from `prototype.html`.
   - Match the prototype closely, and make every interaction in it work.
3. **git + verify:** PR resolution, worktrees, the DiffMap, and the full verification layer, with the unit tests and contract tests from SPEC.md §8, including the deliberately bad agent responses.
4. **Agent pipelines:**
   - Build the runner, then discovery, questions, walkthrough, ask, discussion and review, in that order. Each one is wired to the UI and replaces its fixture data, with fixtures kept behind a dev flag.
   - Build `pnpm eval` with the fixture repos from SPEC.md §8. Run it, and iterate on the prompts until the prototype-scenario expectations pass.
5. **GitHub write-back:** post reviews with diff-line anchoring, the own-PR rules and the double-post guard, and show the posted verdict in the header.
6. **Web:** a grsp landing page, docs for getting started and how it works, and signup via `server/`.
7. **Polish:**
   - Empty, loading and error states for every section.
   - Agent-not-installed and not-signed-in states in onboarding and settings.
   - The large-PR sharding message, the stale-session bar, and the agent-pass count.

## Landing page copy direction

The headline is about understanding, not reviewing faster. Use something in the spirit of "Stop reading diffs. Understand the change." Then a three-step "how it works" (point it at a PR → see what it actually does → review with confidence), a short "runs on the Claude Code or Codex subscription you already have" note, and a Download for Mac button. Keep the tone and layout consistent with sustn.app.

## Done means

- `pnpm tauri:dev` launches grsp, onboarding completes, and a real PR from a GitHub repo produces a Gist, at least one Walkthrough, Ask answers, and an AI review that posts to GitHub.
- `pnpm validate` and `pnpm test` pass.
- `README.md` and `CLAUDE.md` describe grsp.
- `DECISIONS.md` lists every judgement call you made.
- Every acceptance criterion in SPEC.md §5 is met, or is listed as not met with the reason.
- A final summary lists what works, what's stubbed, and known limitations.
