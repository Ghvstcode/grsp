# grsp Architecture

## Overview

grsp is a Tauri v2 desktop application with a React frontend and a Rust core. It is **agent-first**: the user's own coding agent (Claude Code or Codex, on their subscription) does all the code understanding. The Rust core does no language parsing. It provides three things around the agent:

- **git facts** — what changed, exactly where;
- **verification** — every claim the agent makes about the code is checked against the worktree and the diff before it's shown;
- **orchestration** — worktrees, caching, progress, GitHub.

> **The agent discovers and interprets. git and the worktree confirm.**
> Change status, line numbers, code excerpts, comment threads and CI are never taken from agent output. Every `file:line` the agent returns is verified before it's shown.

`design/SPEC.md` is the source of truth for behaviour; this document maps it onto the code.

## Directory Structure

```
grsp/
├── src/                        # Frontend source
│   ├── ui/                     # React components, hooks, context, providers, themes
│   │   ├── components/
│   │   │   ├── ui/             # shadcn/ui primitives (auto-generated, do not edit)
│   │   │   ├── layout/         # App shell and sidebar
│   │   │   ├── session/        # PR header, Gist + Ask, Walkthrough, Review
│   │   │   ├── onboarding/     # Welcome → agent → GitHub → repo folder
│   │   │   └── settings/       # Review prompt, agent, analysis, hosts, repos
│   │   ├── context/            # React context definitions
│   │   ├── providers/          # React providers
│   │   ├── hooks/              # Custom hooks
│   │   ├── lib/                # Utility functions
│   │   └── themes/             # Theme system
│   └── core/                   # Frontend logic (no React components)
│       ├── api/                # TanStack Query hooks wrapping Tauri commands
│       ├── db/                 # SQLite query modules
│       ├── store/              # Zustand stores
│       ├── services/client.ts  # call() and onGrspEvent(), with fixture fallback
│       ├── fixtures/           # The prototype scenario as fixture data
│       ├── types/grsp.ts       # The Rust ↔ frontend contract
│       └── config.ts           # App configuration
├── src-tauri/                  # Rust core
│   ├── src/
│   │   ├── main.rs             # Binary entry point
│   │   ├── lib.rs              # Library root, plugin registration
│   │   ├── commands.rs         # Tauri IPC command handlers
│   │   ├── model.rs            # Serde mirror of src/core/types/grsp.ts
│   │   ├── db.rs               # SQLite access from Rust
│   │   ├── migrations.rs       # SQLite schema (grsp.db)
│   │   ├── git/                # PR resolution, worktrees, DiffMap
│   │   ├── verify/             # The trust layer
│   │   ├── agent/              # Claude Code / Codex runner
│   │   ├── pipelines/          # discovery, questions, walkthrough, ask, discussion, review
│   │   ├── github/             # PRs, CI, threads, posting reviews
│   ├── examples/grsp-eval.rs   # Headless pipeline runner used by `pnpm eval` (not shipped in the app)
│   ├── capabilities/           # Tauri v2 permission capabilities
│   └── tauri.*.conf.json       # Environment-specific configs
├── evals/                      # Fixture repos, builder and scorer (pnpm eval)
├── web/                        # Landing page, docs, changelog (Next.js, separate package.json)
├── server/                     # GitHub sign-in + metrics (Cloudflare Worker, separate package.json)
├── design/                     # SPEC.md, DESIGN.md, prototype.html
└── docs/                       # Contributor documentation
```

## The Rust core

### `git`

Resolves a GitHub PR (or a branch pair) to `baseSha`, `headSha` and `mergeBaseSha`; fetches the refs; creates a detached, read-only worktree at `headSha` under `{appData}/worktrees/{sessionId}`; and builds the **DiffMap** from `git diff --find-renames mergeBaseSha..headSha`. Using the merge base keeps changes on the base branch out of the PR. Vendored, generated and lock files are excluded: `linguist-generated` / `linguist-vendored` in `.gitattributes`, common paths (`node_modules`, `vendor`, `dist`, `build`, `*.min.*`, lockfiles) and user globs in `.grsp/config.toml`.

### `verify`

The trust layer, and the most important code in the app. It needs only git and text.

- **Code references.** A `CodeRef` is `{ file, startLine, endLine?, anchor? }`. It is _verified_ if the file exists in the worktree (or at the merge base, for removed code), the range is inside the file, and the anchor appears on `startLine` or within 2 lines of it (whitespace-insensitive). If the anchor is found within ±10 lines the ref is _snapped_ to that line. Otherwise it is _dropped_.
- **Change status.** New / Changed / Unchanged / Removed / Not covered are computed from the DiffMap. The agent never sets them. A gap that is actually part of the diff isn't a gap.
- **Edge spot-checks.** When the agent says block A leads to block B, A's range must contain B's anchor or name; otherwise the edge is kept but marked unconfirmed (a dotted connector). Event/queue hops are exempt but need a verified ref at both ends.
- **Excerpts.** All code shown in the UI is read by Rust from the worktree using verified refs, with diff markers from the DiffMap. The agent never supplies code text.
- **Reports.** Every analysis stores a `VerificationReport` (`verified`, `dropped`, `unverified`, notes), surfaced as the Gist's honesty line.

Mismatches, findings and gaps with no verified ref are never shown.

### `agent`

One runner for both agents. Claude Code runs as `claude -p` restricted to read, search and list tools; Codex runs as `codex exec` in its read-only sandbox. The working directory is the session worktree. Prompts are layered: grsp preamble (task, JSON contract, grounding rules) → pipeline instruction → context pack (PR title, description, DiffMap, truncated raw diff) → the user's review prompt (review only) → `.grsp/prompt.md` from the repo. Output is one JSON object, parsed with serde, with a single repair retry on parse or schema failure. Tool activity is streamed as rate-limited progress lines. Limits: 5 minutes per pass, user cancellation, at most 2 concurrent passes, and sharded discovery for large PRs (more than 60 files or 3,000 changed lines).

grsp never uses or stores API keys.

### `pipelines`

`discovery`, `questions`, `walkthrough`, `ask`, `discussion`, `review`. Every pipeline has the same shape:

```
build the prompt → run the agent → parse → verify → persist
```

Discovery runs when a session opens and powers the Gist. Questions and discussion follow in parallel. Walkthroughs run lazily the first time an entry point is opened. Review runs only when asked (unless auto-run is on).

### `github`

Lists open PRs, fetches PR metadata, CI status and comments (including GraphQL review threads), and posts reviews through the "create a review" endpoint, with the own-PR rules and a double-post guard. Threads, authors, resolved state and CI are facts from the API; the agent only summarises them.

## The contract

`src/core/types/grsp.ts` defines every command (`GrspCommands`), event (`GRSP_EVENTS`) and UI-ready shape. `src-tauri/src/model.rs` mirrors it with `#[serde(rename_all = "camelCase")]`. Everything in these types has already been through `verify`. Change both files together.

## State Management

- **TanStack Query** (`src/core/api/`): wraps the Tauri commands. Pipelines stream `grsp://analysis`, `grsp://session` and `grsp://ask` events that update or invalidate the relevant queries, so sections render progressively, each with its own loading, error and Retry state.
- **Zustand** (`src/core/store/`): client-side UI state (selected session, tab, walkthrough step, what-if input).
- **React Context** (`src/ui/context/`): UI-only state (theme, layout preferences).

## Data Flow

```
User Action → React Component → TanStack Query → call() → Tauri IPC → Rust command
                                                                          ↓
                                    git / github facts ─→ pipeline ─→ agent CLI (read-only, in the worktree)
                                                                          ↓
                                                             parse → verify → SQLite (keyed by headSha)
                                                                          ↓
React Component ← TanStack Query cache ← grsp:// events + command results
```

## Storage

SQLite (`grsp.db`) via `tauri-plugin-sql`, with migrations in `src-tauri/src/migrations.rs`. Tables: `repos`, `review_sessions`, `analyses`, `ask_messages`, `question_state`, `findings`, `settings`. Every analysis is keyed by `headSha`; the cache never serves a result computed for a different head. Worktrees live under the app data directory, are removed when a session is archived or untouched for 14 days, and are recreated on demand.

## Fixture mode

Outside Tauri (plain `pnpm vite:dev`) or with `VITE_GRSP_FIXTURES=1`, `call()` in `src/core/services/client.ts` serves every command from `src/core/fixtures/` — the order-approval scenario from `design/prototype.html`. Use it for UI work.

## Testing

| Kind           | Where                     | Runs in CI | What it covers                                                                                          |
| -------------- | ------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| Unit tests     | `cargo test`, `pnpm test` | Yes        | URL parsing, DiffMap, CodeRef verification, change status, edges, excerpts, anchoring, cache keys, JSON |
| Contract tests | `cargo test`              | Yes        | Recorded agent responses (including deliberately bad ones) through parse → verify → shape               |
| Evals          | `pnpm eval` (`evals/`)    | No         | The real pipelines with a real agent against fixture repos, scored against `expected.json`              |

The eval harness builds each fixture in `evals/fixtures/` into a git repo with a `main` and a `pr` branch, runs the headless `grsp-eval` binary on it, and scores the JSON it prints. See [`evals/README.md`](../evals/README.md).

## Multi-Environment

Three Tauri config files enable running different environments simultaneously:

- `tauri.conf.json` - Production (identifier: `app.grsp.desktop`, deep link `grsp://`)
- `tauri.dev.conf.json` - Development (identifier: `app.grsp.desktop.dev`, deep link `grsp-dev://`)
- `tauri.qa.conf.json` - QA/Staging (identifier: `app.grsp.desktop.qa`, deep link `grsp-qa://`)

## Web and server

- `web/` is a statically exported Next.js site: landing page, `/docs` and `/changelog`.
- `server/` is a Hono app on Cloudflare Workers with a D1 database. It handles GitHub OAuth sign-in (redirecting back to the desktop app through the deep-link scheme) and anonymous-by-default usage metrics. It never receives repository contents, diffs or agent output.

## Conventions

- Path aliases: `@ui/*`, `@core/*`, `@/*`
- 4-space indentation
- TypeScript strict mode
- Prefer `undefined` over `null`
- All promises must be handled
- No language parsing in Rust; nothing hard-coded to a repo, language or framework
