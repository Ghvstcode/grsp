# Claude's Onboarding Doc

## What is SUSTN?

SUSTN (stylized as "sustn") is a native desktop app that acts as a background conductor for AI coding agents. It is built with Tauri v2, React, TypeScript, TanStack Query, Zustand, and a local SQLite database.

Users add their code repositories, and SUSTN scans each one using local Claude Code or Codex instances to generate a prioritized backlog of improvements. SUSTN monitors the user's remaining weekly subscription budget and uses leftover tokens to work through the backlog. All changes land as branches/PRs -- zero risk to the main codebase.

## Your role

You are a code contributor. You do NOT have access to the running app, so you cannot test code. You MUST rely on the user to test.

If the user reports a bug in your code, after you fix it, pause and ask them to verify the fix.

## Project Structure

- **UI:** React components in `src/ui/components/`
- **Core:** Business logic in `src/core/`
- **Tauri:** Rust backend in `src-tauri/src/`
- **Landing page:** Next.js app in `web/` (separate from the desktop app)

Important directories:

- `src/core/db/` - SQLite database query modules
- `src/core/api/` - TanStack Query queries and mutations
- `src/core/store/` - Zustand stores for client state
- `src/ui/components/ui/` - shadcn/ui primitives (DO NOT edit manually)
- `src/ui/components/layout/` - App layout (shell, sidebar)
- `src/ui/context/` - React contexts
- `src/ui/providers/` - React providers
- `src/ui/hooks/` - Custom hooks
- `src/ui/themes/` - Theme definitions and provider

## Coding Style

- **TypeScript:** Strict mode, ES2020 target. Avoid `as` type assertions unless absolutely necessary (explain with a comment).
- **Paths:** Use `@ui/*`, `@core/*`, `@/*` aliases instead of relative imports.
- **Components:** PascalCase filenames and exports for React components.
- **Hooks:** camelCase with "use" prefix.
- **Formatting:** 4-space indentation, Prettier formatting.
- **Promise handling:** All promises must be handled (ESLint enforced with `no-floating-promises`).
- **Nulls:** Prefer `undefined` over `null`. Convert `null` from SQLite to `undefined`.
- **State management:** Zustand for client state, TanStack Query for async/server state, React Context for UI-only state (theme, layout).

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

**Scopes:** `ui`, `core`, `tauri`, `web`, `ci`, `config`, `deps`

**Rules:**

- Summary line: imperative mood, lowercase, no period, max 72 chars
- Body: wrap at 80 chars, explain _what_ and _why_ (not _how_)
- List significant file changes with bullet points when many files are touched
- Reference issue numbers where applicable (`closes #123`)
- For multi-area changes, use scope `*` or list scopes: `feat(ui,core):`

**Example:**

```
feat(ui): add repository sidebar with drag-and-drop reordering

Implement the repository list in the app sidebar. Users can now see
all added repositories and reorder them via drag-and-drop.

- Add RepositoryList component with DnD support
- Add useRepositories hook for TanStack Query integration
- Add reorder mutation to persist new order in SQLite
- Wire sidebar to AppShell layout

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

## Dev Commands

- `pnpm tauri:dev` - Start dev environment (Vite + Tauri)
- `pnpm validate` - Run lint + format check + typecheck
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm format` - Auto-format with Prettier

### Scratchpad

(Add notes here as you discover things)
