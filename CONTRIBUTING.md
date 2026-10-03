# Contributing to SUSTN

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- Rust (latest stable)
- Tauri CLI v2 (installed as devDependency)

## Setup

1. Clone the repository
2. Run `pnpm install`
3. Run `pnpm tauri:dev` to start the dev environment

## Development Commands

| Command             | Description                                |
| ------------------- | ------------------------------------------ |
| `pnpm tauri:dev`    | Start dev environment (Vite + Tauri)       |
| `pnpm tauri:qa`     | Start QA environment                       |
| `pnpm tauri:prod`   | Start production environment               |
| `pnpm vite:dev`     | Start Vite dev server only (no Tauri)      |
| `pnpm build`        | Build frontend                             |
| `pnpm lint`         | Run ESLint                                 |
| `pnpm lint:fix`     | Run ESLint with auto-fix                   |
| `pnpm format`       | Format with Prettier                       |
| `pnpm format:check` | Check formatting                           |
| `pnpm typecheck`    | TypeScript type checking                   |
| `pnpm validate`     | Run all checks (lint + format + typecheck) |
| `pnpm test`         | Run tests                                  |

## Adding shadcn/ui Components

```bash
pnpm dlx shadcn@latest add button
```

Components are installed to `src/ui/components/ui/`.

## Code Style

- 4-space indentation (enforced by Prettier)
- Use path aliases (`@ui/*`, `@core/*`)
- TypeScript strict mode
- No floating promises

Pre-commit hooks (Husky + lint-staged) will auto-fix formatting on commit.

## Architecture

See [docs/architecture.md](./docs/architecture.md) for technical details.
