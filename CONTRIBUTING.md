# Contributing to grsp

## Prerequisites

- macOS
- Node.js >= 22
- pnpm >= 9
- Rust (latest stable)
- Tauri CLI v2 (installed as devDependency)
- To run real analyses: [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or [Codex](https://developers.openai.com/codex/cli), signed in, and the [GitHub CLI](https://cli.github.com) (`gh auth login`) for PR sessions

## Setup

1. Clone the repository
2. Run `pnpm install`
3. Run `pnpm tauri:dev` to start the dev environment

No agent or GitHub account handy? Run with fixtures: `VITE_GRSP_FIXTURES=1 pnpm tauri:dev` (or `VITE_GRSP_FIXTURES=1 pnpm vite:dev` in a browser). Every screen then renders the prototype scenario from `src/core/fixtures/`.

## Development Commands

| Command             | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `pnpm tauri:dev`    | Start dev environment (Vite + Tauri)                      |
| `pnpm tauri:qa`     | Start QA environment                                      |
| `pnpm tauri:prod`   | Start production environment                              |
| `pnpm vite:dev`     | Start Vite dev server only (no Tauri, fixture data)       |
| `pnpm build`        | Build frontend                                            |
| `pnpm lint`         | Run ESLint                                                |
| `pnpm lint:fix`     | Run ESLint with auto-fix                                  |
| `pnpm format`       | Format with Prettier                                      |
| `pnpm format:check` | Check formatting                                          |
| `pnpm typecheck`    | TypeScript type checking                                  |
| `pnpm validate`     | Run all checks (lint + format + typecheck)                |
| `pnpm test`         | Run frontend tests (Vitest)                               |
| `pnpm eval`         | Run the agent evals against the fixture repos (see below) |
| `pnpm eval:test`    | Unit-test the eval scorer and fixture builder             |

Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`.

## The rule

> The agent discovers and interprets. git and the worktree confirm.

Any change that shows something about the code — a location, a change status, an excerpt, an edge — must get it from git or the worktree through `src-tauri/src/verify`, never straight from agent output. grsp does no language parsing; don't add any. Read `design/SPEC.md` §3 before touching a pipeline.

`src/core/types/grsp.ts` and `src-tauri/src/model.rs` are the contract between the frontend and Rust. Change them together.

## Testing

- **Unit and contract tests** are deterministic and run in CI: `pnpm test` and `cargo test`. Contract tests feed recorded agent responses (including deliberately bad ones) through parsing, verification and shaping.
- **Evals** run the real pipelines with a real agent against the fixture repos in `evals/fixtures/` and score the result. They use your Claude Code or Codex subscription, so they are local and on demand, never in CI. See [evals/README.md](./evals/README.md).

```bash
pnpm eval                                   # all fixtures
pnpm eval --fixture orders-approval         # one fixture
pnpm eval --agent codex --pipelines discovery,walkthrough
```

If you change a prompt, run the evals before and after and compare the reports in `evals/reports/`.

## Adding shadcn/ui Components

```bash
pnpm dlx shadcn@latest add button
```

Components are installed to `src/ui/components/ui/`. Restyle them with the grsp tokens (`design/DESIGN.md`) rather than writing new primitives.

## Code Style

- 4-space indentation (enforced by Prettier)
- Use path aliases (`@ui/*`, `@core/*`)
- TypeScript strict mode
- No floating promises
- Prefer `undefined` over `null`

Pre-commit hooks (Husky + lint-staged) will auto-fix formatting on commit.

## Web and server

`web/` (landing page, docs, changelog) and `server/` (GitHub sign-in and metrics on Cloudflare Workers) are separate packages with their own `pnpm install`:

```bash
cd web && pnpm install && pnpm dev          # http://localhost:3000
cd server && pnpm install && pnpm dev       # http://localhost:3001, needs server/.dev.vars
```

## Architecture

See [docs/architecture.md](./docs/architecture.md) for technical details and [docs/releasing.md](./docs/releasing.md) for how releases ship.
