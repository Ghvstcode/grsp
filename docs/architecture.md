# SUSTN Architecture

## Overview

SUSTN is a Tauri v2 desktop application with a React frontend and Rust backend.

## Directory Structure

```
sustn/
├── src/                    # Frontend source
│   ├── ui/                 # React components, hooks, context, providers, themes
│   │   ├── components/
│   │   │   ├── ui/         # shadcn/ui primitives (auto-generated, do not edit)
│   │   │   └── layout/     # App layout components
│   │   ├── context/        # React context definitions
│   │   ├── providers/      # React providers
│   │   ├── hooks/          # Custom hooks
│   │   ├── lib/            # Utility functions
│   │   └── themes/         # Theme system
│   ├── core/               # Business logic (no React imports)
│   │   ├── store/          # Zustand stores
│   │   ├── db/             # SQLite query modules
│   │   ├── api/            # TanStack Query definitions
│   │   └── config.ts       # App configuration
│   └── types/              # TypeScript type declarations
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Binary entry point
│   │   ├── lib.rs          # Library root, plugin registration
│   │   ├── command.rs      # Tauri IPC command handlers
│   │   └── migrations.rs   # SQLite migrations
│   ├── capabilities/       # Tauri v2 permission capabilities
│   └── tauri.*.conf.json   # Environment-specific configs
├── web/                    # Landing page (Next.js, separate package.json)
├── public/                 # Static assets served by Vite
└── docs/                   # Documentation
```

## State Management

- **Zustand** (`src/core/store/`): Client-side state (UI state, selections, etc.)
- **TanStack Query** (`src/core/api/`): Async state from SQLite DB via Tauri IPC
- **React Context** (`src/ui/context/`): UI-only state (theme, layout preferences)

## Data Flow

```
User Action → React Component → TanStack Query Mutation → Tauri IPC → Rust Command → SQLite
                                                                        ↓
SQLite → Rust Response → Tauri IPC → TanStack Query Cache → React Component
```

## Multi-Environment

Three Tauri config files enable running different environments simultaneously:

- `tauri.conf.json` - Production (identifier: `app.sustn.desktop`)
- `tauri.dev.conf.json` - Development (identifier: `app.sustn.desktop.dev`)
- `tauri.qa.conf.json` - QA/Staging (identifier: `app.sustn.desktop.qa`)

## Conventions

- Path aliases: `@ui/*`, `@core/*`, `@/*`
- 4-space indentation
- TypeScript strict mode
- Prefer `undefined` over `null`
- All promises must be handled
