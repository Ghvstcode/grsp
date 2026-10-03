<p align="center">
  <a href="https://sustn.app">
    <img src="Github Header.png" alt="sustn" />
  </a>
</p>

<p align="center">
  <b>Your codebase improves itself. You just review the PR.</b>
</p>

<p align="center">
  <a href="https://sustn.app/docs">Docs</a> &nbsp;·&nbsp;
  <a href="https://sustn.app/changelog">Changelog</a> &nbsp;·&nbsp;
  <a href="https://sustn.app/#download">Download</a> &nbsp;·&nbsp;
  <a href="#contributing">Contributing</a>
</p>

---

Every AI coding tool waits for you to tell it what to do. **sustn** doesn't.

It scans your repositories, builds a prioritized backlog of improvements, and works through them automatically using your leftover [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or [Codex](https://openai.com/index/introducing-codex/) subscription budget. Every change lands as a branch — nothing touches `main` without your approval.

<p align="center">
  <img width="1186" height="793" alt="sustn_screenshot" src="https://github.com/user-attachments/assets/0229becf-6f46-4d8e-bbcb-e2c8473b8b17" />
</p>

## How it works

**1. Point it at your repos**
Add your repositories and sustn runs a deep scan using Claude Code or Codex. It finds dead code, missing tests, doc drift, security gaps, and tech debt — then ranks everything by impact.

**2. Review, reorder, refine**
Your backlog appears as a task list you control. Drag to reprioritize. Click into any task to see what the agent found and why it matters. Add notes or constraints before work begins.

**3. Work happens automatically**
sustn monitors your remaining subscription budget and picks up tasks when tokens are available. No prompts, no babysitting, no wasted tokens.

**4. Approve and merge**
Every completed task lands as a branch. Review the diff, then create a PR with one click — or configure sustn to open PRs automatically.

## Get started

### Download (recommended)

The fastest way to use sustn is to download the Mac app:

**[Download for Mac →](https://sustn.app/#download)**

Once installed, add a repository and sustn handles the rest. See the [Getting Started guide](https://sustn.app/docs#getting-started) for a full walkthrough.

### Build from source

If you'd prefer to build locally:

**Prerequisites:** Node.js >= 22, Rust (stable), pnpm

```bash
git clone https://github.com/ghvstcode/sustn.git
cd sustn
pnpm install
pnpm tauri:dev
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full development setup and commands.

### Nightly builds

Nightly builds are published automatically from the latest `main` branch. They may include unreleased features or experimental changes.

**[Browse nightly releases →](https://github.com/Ghvstcode/sustn/releases/tag/nightly)**

> **Note:** Nightly builds are unsigned and may be less stable than tagged releases. macOS will prompt you to allow the app in **System Settings → Privacy & Security** on first launch.

## What gets detected

sustn scans for a wide range of codebase improvements:

- **Dead code** — unused exports, unreachable branches, orphaned files
- **Missing tests** — untested functions, edge cases, critical paths
- **Documentation drift** — stale comments, outdated READMEs, missing JSDoc
- **Security gaps** — hardcoded secrets, missing input validation, dependency vulnerabilities
- **Tech debt** — duplicated logic, overly complex functions, inconsistent patterns
- **Performance** — N+1 queries, unnecessary re-renders, unoptimized imports

## Architecture

sustn is a native desktop app built with:

| Layer         | Tech                                                                   |
| ------------- | ---------------------------------------------------------------------- |
| Desktop shell | [Tauri v2](https://v2.tauri.app) (Rust)                                |
| Frontend      | React 19, TypeScript, Tailwind CSS, [shadcn/ui](https://ui.shadcn.com) |
| State         | Zustand (client), TanStack Query (async)                               |
| Database      | SQLite via tauri-plugin-sql                                            |
| AI agents     | Claude Code, Codex (via CLI)                                           |

The agent engine runs in Rust and manages scanning, task prioritization, budget tracking, git branch lifecycle, and the implement → review → retry loop. See the [Architecture docs](https://sustn.app/docs#architecture) for details.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup instructions and coding conventions.

```bash
pnpm tauri:dev     # Start dev environment
pnpm validate      # Lint + format check + typecheck
pnpm test          # Run tests
```

## Documentation

Full documentation is available at **[sustn.app/docs](https://sustn.app/docs)** covering:

- [Getting Started](https://sustn.app/docs#getting-started) — installation, prerequisites, onboarding
- [Core Concepts](https://sustn.app/docs#core-concepts) — projects, tasks, the agent engine, budget
- [Scanning & Discovery](https://sustn.app/docs#scanning) — how scanning works, what gets detected
- [Task Management](https://sustn.app/docs#task-management) — lifecycle, properties, prioritization
- [Automated Execution](https://sustn.app/docs#execution) — work phases, retry & error handling
- [Code Review & PRs](https://sustn.app/docs#review) — diff viewer, creating pull requests
- [Configuration](https://sustn.app/docs#configuration) — settings, scheduling, budget controls

## License

[MIT](./LICENSE)
