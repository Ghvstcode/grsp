# Codex's Onboarding Doc

## What is grsp?

grsp is a native macOS desktop app for _understanding_ pull requests instead of reading diffs. It is built with Tauri v2, React, TypeScript, TanStack Query, Zustand, and a local SQLite database.

Users add their repo folders and open a **review session** for a PR (paste a URL, pick an open PR, or choose two branches). grsp runs the user's own Codex or Codex against a read-only worktree of the PR head and shows three tabs:

- **Gist** — "Author says" vs "Code does", mismatches, affected entry points, comprehension questions, the GitHub discussion, and an Ask panel.
- **Walkthrough** — step through the changed behaviour block by block, with "what if" inputs.
- **Review** — an AI review with editable findings that posts back to GitHub.

`design/SPEC.md` is the source of truth for behaviour, `design/DESIGN.md` for the look.

## The non-negotiable rule

> **The agent discovers and interprets. git and the worktree confirm.**

grsp is agent-first. The agent does all the code understanding; the Rust core does **no language parsing** (no tree-sitter, no framework detection). Change status, line numbers, code excerpts, comment threads and CI are never taken from agent output, and every `file:line` the agent returns goes through `src-tauri/src/verify` before it is shown. If you are about to render something the agent said about the code without verifying it, stop.

Also:

- **No API keys anywhere.** grsp shells out to the `Codex` / `codex` CLI the user is already signed in to.
- Never hard-code anything to a specific repo, language or framework (fixtures excepted).
- Agent passes cost the user's subscription: cache by `headSha`, run lazily, never re-run on focus.

## Your role

You are a code contributor. You do NOT have access to the running app, so you cannot test code. You MUST rely on the user to test.

If the user reports a bug in your code, after you fix it, pause and ask them to verify the fix.

## Project Structure

- **UI:** React components in `src/ui/components/`
- **Core:** Frontend logic in `src/core/`
- **Tauri:** Rust backend in `src-tauri/src/`
- **Landing page + docs:** Next.js app in `web/` (separate package)
- **Auth server:** Cloudflare Worker in `server/` (separate package; GitHub sign-in and metrics only, never user code)
- **Evals:** fixture repos and scorer in `evals/`

Important directories:

- `src/ui/components/session/` - The review session screens (PR header, Gist + Ask, Walkthrough, Review)
- `src/ui/components/layout/` - App layout (shell, sidebar)
- `src/ui/components/onboarding/` - Onboarding flow
- `src/ui/components/settings/` - Settings sections
- `src/ui/components/ui/` - shadcn/ui primitives (DO NOT edit manually)
- `src/core/api/` - TanStack Query queries and mutations wrapping the Tauri commands
- `src/core/db/` - SQLite query modules
- `src/core/store/` - Zustand stores for client state
- `src/core/fixtures/` - Fixture data (the prototype scenario) used outside Tauri and with `VITE_GRSP_FIXTURES=1`
- `src/core/types/` - Shared types; `grsp.ts` is the Rust ↔ frontend contract
- `src/core/services/client.ts` - `call(name, args)` (typed Tauri invoke with fixture fallback) and `onGrspEvent`

Rust (`src-tauri/src/`):

- `git/` - Resolve PRs to refs, fetch, read-only worktrees, the DiffMap (merge base, renames, exclusions)
- `verify/` - The trust layer: CodeRef verification (anchor match, snap, drop), change status, edge spot-checks, excerpts, VerificationReports. Unit-test heavily.
- `agent/` - One runner for Codex (`Codex -p`, read-only tools) and Codex (`codex exec`, read-only sandbox): prompt layering, JSON parsing with one repair retry, progress lines, timeouts, cancellation
- `pipelines/` - `discovery`, `questions`, `walkthrough`, `ask`, `discussion`, `review`. Every pipeline is: build prompt → run agent → parse → **verify** → persist
- `github/` - Open PRs, PR metadata, CI, comments and review threads, posting reviews (via `gh`)
- `commands.rs` - Tauri IPC command handlers
- `model.rs` - Serde types returned to the frontend
- `db.rs` - SQLite access from Rust
- `migrations.rs` - SQLite schema (`grsp.db`)

### The contract

`src/core/types/grsp.ts` ↔ `src-tauri/src/model.rs`. These two files define every command, event and UI-ready shape, and must change together. Rust serialises with `rename_all = "camelCase"`.

## Coding Style

- **TypeScript:** Strict mode, ES2020 target. Avoid `as` type assertions unless absolutely necessary (explain with a comment).
- **Paths:** Use `@ui/*`, `@core/*`, `@/*` aliases instead of relative imports.
- **Components:** PascalCase filenames and exports for React components.
- **Hooks:** camelCase with "use" prefix.
- **Formatting:** 4-space indentation, Prettier formatting.
- **Promise handling:** All promises must be handled (ESLint enforced with `no-floating-promises`).
- **Nulls:** Prefer `undefined` over `null`. Convert `null` from SQLite to `undefined`.
- **State management:** Zustand for client state, TanStack Query for async/server state, React Context for UI-only state (theme, layout).
- **Visual language:** strict black and white with the tokens in `design/DESIGN.md`. Restyle shadcn components with those tokens rather than writing new ones.
- **Rust:** every pipeline output passes through `verify` before it is persisted or returned. No language-specific parsing.

## Workflow

- NEVER COMMIT WITHOUT ASKING FOR PERMISSION.
- We use GitHub issues and PRs.
- Create branches like `feature-name`. NEVER commit to main.
- Commit often. Ask the user to test early and often.
- When done, push and open a PR with a test plan.
- Use `pnpm` for package management.
- Don't combine git commands.

## Commit Convention

Commits must be detailed and well-structured. Use this format:

```
<type>(<scope>): <short summary>

<body — what changed and why, in detail>

<optional footer — breaking changes, issue refs>
```

**Types:** `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`, `ci`, `build`, `perf`

**Scopes:** `ui`, `core`, `tauri`, `web`, `server`, `evals`, `ci`, `config`, `deps`

**Rules:**

- Summary line: imperative mood, lowercase, no period, max 72 chars
- Body: wrap at 80 chars, explain _what_ and _why_ (not _how_)
- List significant file changes with bullet points when many files are touched
- Reference issue numbers where applicable (`closes #123`)
- For multi-area changes, use scope `*` or list scopes: `feat(ui,core):`

**Example:**

```
feat(tauri): snap code refs to the anchor within ten lines

Agents often return a line number that is a few lines off. When the
anchor is found within ±10 lines of startLine, move the ref there and
count it as verified instead of dropping the claim.

- Add snap search to verify::code_ref
- Record snapped refs in the VerificationReport notes
- Cover exact, snapped and dropped cases in unit tests

closes #42
```

## Tech Stack

- Tauri v2 (Rust backend)
- React 19 + TypeScript 5
- Vite 6
- Tailwind CSS v3 + shadcn/ui (new-york style)
- Zustand v5 (client state)
- TanStack Query v5 (async state)
- React Router v6
- SQLite via tauri-plugin-sql
- ESLint 9 (flat config) + Prettier
- Codex / Codex CLIs (the user's own, no API keys)

## Dev Commands

- `pnpm tauri:dev` - Start dev environment (Vite + Tauri)
- `VITE_GRSP_FIXTURES=1 pnpm tauri:dev` - Same, with every command served from fixtures (no agent, no GitHub)
- `pnpm validate` - Run lint + format check + typecheck
- `pnpm test` - Frontend tests (Vitest)
- `cargo test --manifest-path src-tauri/Cargo.toml` - Rust unit and contract tests
- `pnpm eval` - Run the real pipelines against the fixture repos in `evals/` (uses your subscription; local only, never CI)
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm format` - Auto-format with Prettier

### Scratchpad

(Add notes here as you discover things)
