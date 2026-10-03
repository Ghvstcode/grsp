# grsp — design handoff

grsp is a macOS desktop app for *understanding* pull requests rather than reading diffs. You point it at an existing PR (any git host, or two branches) and it gives you the gist, a step-through walkthrough of the changed behaviour, an ask-anything panel, and an AI review you can post back to GitHub.

`prototype.html` in this folder is the clickable design prototype. Treat it as the visual and interaction reference: its markup, inline styles and the data in its `<script>` block (blocks, findings, threads, answers) show exactly what each screen looks like. It uses a design-tool runtime, so don't try to run or port it directly; rebuild it as real components.

## Stack

- Tauri 2 shell. The Rust backend owns git, verification of agent output, and running the agent. It does no language parsing.
- Frontend: React + TypeScript + Vite. Plain CSS modules or Tailwind with the tokens below. No component library needed.
- Analysis is agent-first and works on any language: the user's coding agent does the understanding, and Rust verifies every claim against git. See SPEC.md §0 and §3.

## AI: the user's own agent, no API keys

grsp never asks for API keys. It shells out to the coding agent the user already has installed and signed in, the same model as sustn:

- **Claude Code**: `claude -p` (headless print mode), restricted to read-only tools.
- **Codex**: `codex exec` in a read-only sandbox.

Rust detects which binaries exist on `PATH` (plus common install paths), shows status in Settings, and runs the agent with its working directory set to a read-only git worktree checked out at the PR head. Prompts ask for structured JSON output; parse it, never regex the prose. grsp stores no credentials.

## Visual language

Strict black and white. Grey only signals "unchanged" or secondary.

| Token | Value | Use |
|---|---|---|
| ink | `#0a0a0a` | text, primary buttons, "new"/"current" fills |
| paper | `#ffffff` | main background |
| panel | `#fafafa` | sidebar, card headers |
| wash | `#f5f5f5` | summary boxes |
| line | `#e5e5e5` | borders |
| line-strong | `#d4d4d4` | inputs, connectors |
| text-2 | `#525252` | secondary text |
| text-3 | `#737373` | labels, unchanged items |
| code-add | `#eeeeee` | added lines |
| code-hl | `#dcdcdc` | highlighted line |

- Fonts: Geist (UI), Geist Mono (code, symbols, paths, routes).
- Radii: 8px controls, 10–12px cards, 999px pills.
- Change states, used everywhere a symbol appears:
  - **New**: ink fill, white text chip; 1.5px ink border on blocks.
  - **Changed**: 1px ink border chip; 1.5px ink border on blocks.
  - **Unchanged**: grey border and grey text.
  - **Not covered** (a path the PR should have touched and didn't): dashed ink border.
  - **Current/selected**: solid ink background, white text.
- Section labels: 11px, uppercase, 0.06em tracking, text-3.
- Code blocks: file header bar (path left, `+n −m` or line range right), line-number gutter, sign column, no syntax colour.

## Layout

1440×900 reference window. Left sidebar 264px; main area fills the rest.

**Sidebar:** logo, "New review" primary button, reviews grouped by repo folder (collapsible, count on the right, sessions show `#num · status` and title), Settings at the bottom.

**PR header:** `#482` + title, "Open on GitHub" link, a meta row (author, `head → base`, CI status, files/symbols changed, mismatch pill, your posted verdict), then tabs: **Gist · Walkthrough · Review**.

## Screens

### Gist
The main column scrolls; a 400px **Ask** panel is fixed on the right.
1. **Author says / Code does** side by side. The description clamps to 4 lines, and "Read full description" expands it into sections (Context, Changes, Testing, Rollout).
2. **Mismatch** callout when the generated behaviour summary contradicts the description, with a "Walk through it" button that jumps straight to the relevant step.
3. **What's affected**: entry points (routes, jobs, consumers), each with its effect, a change tag, and a button that opens the walkthrough there.
4. **Can you answer these?**: generated comprehension questions as an accordion, with an "x of y checked" counter. Can be turned off in Settings.
5. **Discussion on GitHub**: collapsed to a one-line digest. Expanded, it shows a "Where it stands" summary, then threads (open expanded, resolved folded). Comments over ~200 chars clamp to 3 lines with "Show more". Suggested changes render as diffs.

**Ask panel:** input and suggestion chips at the top; answers below, newest first. Each answer has the question bubble (ink), a trace line ("Traced 3 symbols · 2 files"), answer paragraphs, an optional code excerpt with the key line highlighted, and `file:line` reference chips.

### Walkthrough
- Entry point chips; "What if the total is…" input chips when the path has a branching input.
- Left: a vertical chain of blocks (number · kind, symbol name, change chip) joined by 1px connectors. Click to jump.
- Right: a detail card with step counter, change chip, symbol + file, a plain-English note, an optional **Decision** (condition → yes/no, with the taken branch filled), a code block for the symbol, and Back / Step / Show code.
- Changing the what-if input re-routes the downstream blocks.

### Review
- Idle: "Run an AI review" card showing the active prompt (2-line clamp, Edit → Settings), Run button, "Runs on your Claude Code subscription".
- Done: a findings list. Each finding has severity (Blocking = ink fill, Should fix = outline, Nit = grey), title, location, why, code excerpt, an editable comment for that line, and an "Include in review" checkbox (excluded findings dim to 50%).
- Submit panel: verdict segmented control (Comment / Approve / Request changes), summary textarea, "Post review · n comments".
- Posted: an ink confirmation bar with a link to GitHub; the header shows your verdict.

### Settings
Sections separated by hairlines:
- **Review prompt**: monospace textarea, Reset to default, per-repo override at `.grsp/prompt.md`.
- **Agent**: Claude Code / Codex segmented control, plus a status card (detected, binary path, signed in, the command it runs as) and Re-check.
- **Analysis**: toggles for comprehension questions, showing unchanged blocks in walkthroughs, and auto-running the review on open; trace depth 1/2/3 hops.
- **Git hosts**: GitHub connected; GitLab and Bitbucket Connect.
- **Repositories**: folder list with paths and language, plus Add folder.

## Build order

See the Milestones section of PROMPT.md and the behaviour in SPEC.md. In short: shell and UI on fixture data first, then git plus the verification layer, then the agent pipelines.
