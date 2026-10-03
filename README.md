<p align="center">
  <a href="https://grsp.app">
    <img src="icon.png" alt="grsp" width="72" />
  </a>
</p>

<h1 align="center">grsp</h1>

<p align="center">
  <b>Stop reading diffs. Understand the change.</b>
</p>

<p align="center">
  <a href="https://grsp.app/docs">Docs</a> &nbsp;·&nbsp;
  <a href="https://grsp.app/changelog">Changelog</a> &nbsp;·&nbsp;
  <a href="https://grsp.app/#download">Download</a> &nbsp;·&nbsp;
  <a href="#contributing">Contributing</a>
</p>

---

A diff tells you which lines changed. It doesn't tell you what the system does differently now, which paths the author forgot, or whether the description is true.

**grsp** is a macOS app for _understanding_ pull requests. Point it at a PR and it uses the [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or [Codex](https://developers.openai.com/codex/cli) subscription you already have to explore the change in a read-only worktree, then checks every claim the agent makes against git before showing it to you.

## How it works

**1. Point it at a PR**
Paste a GitHub PR URL, pick from a repo's open PRs, or choose two branches. grsp fetches the refs and checks out a read-only worktree at the PR head.

**2. See what it actually does**
The **Gist** puts "Author says" next to "Code does" and calls out any mismatch, lists the entry points whose behaviour changes (and the ones the PR should have touched and didn't), and answers your questions with code excerpts and `file:line` references. The **Walkthrough** lets you step through the changed behaviour block by block — route → service → policy → DB write → event — and try "what if" inputs.

**3. Review with confidence**
Run an AI review with your own prompt. Edit the findings, pick a verdict, and post it to GitHub as a normal review.

## The rule

> **The agent discovers and interprets. git and the worktree confirm.**

grsp does no language parsing, so it works on any codebase your agent can read. Its Rust core provides git facts, verification and orchestration: change status, line numbers, code excerpts, comment threads and CI never come from agent output, and every `file:line` the agent returns is verified against the worktree before it's shown. References that can't be verified are dropped, and the Gist tells you how many were.

No API keys. No code leaves your machine except through your own agent.

## Get started

### Download (recommended)

**[Download for Mac →](https://grsp.app/#download)**

You'll need Claude Code or Codex installed and signed in, and the [GitHub CLI](https://cli.github.com) (`gh auth login`) for PR sessions. See the [Getting Started guide](https://grsp.app/docs#getting-started).

### Build from source

**Prerequisites:** Node.js >= 22, Rust (stable), pnpm

```bash
git clone https://github.com/ghvstcode/grsp.git
cd grsp
pnpm install
pnpm tauri:dev
```

To explore the UI without an agent or a GitHub account, run it on fixture data:

```bash
VITE_GRSP_FIXTURES=1 pnpm tauri:dev
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full development setup.

### Nightly builds

Nightly builds are published automatically from the latest `main` branch. They may include unreleased features or experimental changes.

**[Browse nightly releases →](https://github.com/ghvstcode/grsp/releases/tag/nightly)**

## Architecture

| Layer         | Tech                                                                   |
| ------------- | ---------------------------------------------------------------------- |
| Desktop shell | [Tauri v2](https://v2.tauri.app) (Rust)                                |
| Frontend      | React 19, TypeScript, Tailwind CSS, [shadcn/ui](https://ui.shadcn.com) |
| State         | Zustand (client), TanStack Query (async)                               |
| Database      | SQLite via tauri-plugin-sql                                            |
| AI agents     | Claude Code, Codex (via CLI, read-only)                                |
| GitHub        | The `gh` CLI                                                           |

The Rust core (`src-tauri/src/`) is five modules:

- **`git`** — resolves a PR to base and head, creates the read-only worktree, and builds the DiffMap from the merge base.
- **`verify`** — the trust layer. Verifies every code reference (anchor match, snap, drop), computes change status from the DiffMap, spot-checks edges, and reads excerpts.
- **`agent`** — one runner for `claude -p` (read-only tools) and `codex exec` (read-only sandbox): prompt layering, JSON parsing with one repair retry, progress lines, timeouts, cancellation.
- **`pipelines`** — `discovery`, `questions`, `walkthrough`, `ask`, `discussion`, `review`. Each one is: build the prompt → run the agent → parse → verify → persist.
- **`github`** — open PRs, metadata, CI, review threads, and posting reviews.

Everything is cached in SQLite by head SHA. `src/core/types/grsp.ts` and `src-tauri/src/model.rs` are the contract between the two halves. See [docs/architecture.md](./docs/architecture.md).

## Scripts

```bash
pnpm tauri:dev     # Start dev environment (Vite + Tauri)
pnpm validate      # Lint + format check + typecheck
pnpm test          # Frontend tests (Vitest)
pnpm eval          # Run the real pipelines against the fixture repos and score them
pnpm eval:test     # Unit-test the eval scorer
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit + contract tests
```

`pnpm eval` runs a real agent on your subscription against the tiny repos in [`evals/fixtures/`](./evals) — a Django order-approval PR with a bulk import that bypasses the new check, a TypeScript full-stack PR, a Go service, and a config-only PR — and prints a pass/fail line per expectation. It is local and on demand, never part of CI. See [evals/README.md](./evals/README.md).

## Repository layout

```
src/          React frontend (ui/, core/)
src-tauri/    Rust core (git, verify, agent, pipelines, github)
web/          Landing page, docs and changelog (Next.js)
server/       GitHub sign-in + metrics (Cloudflare Worker). Never sees your code.
evals/        Fixture repos, fixture builder and scorer
design/       SPEC.md (behaviour), DESIGN.md (look), prototype.html
docs/         Architecture and release notes for contributors
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup instructions and coding conventions.

## Documentation

Full documentation is available at **[grsp.app/docs](https://grsp.app/docs)** covering:

- [Getting Started](https://grsp.app/docs#getting-started) — install, onboarding, agents, GitHub
- [How it works](https://grsp.app/docs#how-it-works) — agent-first, verification, caching, cost
- [The three tabs](https://grsp.app/docs#tabs) — Gist, Walkthrough, Review
- [Settings](https://grsp.app/docs#settings) — review prompt, `.grsp/prompt.md`, `.grsp/config.toml`
- [Privacy](https://grsp.app/docs#privacy) and [FAQ](https://grsp.app/docs#faq)

## License

[GPL-2.0](./LICENSE)
