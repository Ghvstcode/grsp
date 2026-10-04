# Decisions

Every judgement call made while building grsp, grouped by area. `design/SPEC.md` is the source of truth for behaviour; anything here either fills a gap in it or deviates from it deliberately.

## Foundation

- sustn was copied in as the base and its engine (scanning, backlog, budget, scheduling, implement/review loop, branch creation) removed.
- The database is a new `grsp.db` with a single fresh migration rather than sustn's migration history.
- The UI-ready contract lives in `src/core/types/grsp.ts` and is mirrored in `src-tauri/src/model.rs`. Rust owns sessions, analyses, ask messages and findings; the frontend owns repos and settings through tauri-plugin-sql, as sustn does.
- sustn has no Codex integration, so Codex detection and the `codex exec` runner are new.
- The what-if option schema extends the SPEC's with optional per-option `taken` and `notes` maps, which the prototype's walkthrough needs to show the taken branch and per-input notes.
- Outside Tauri, or with `VITE_GRSP_FIXTURES=1`, the frontend runs on a fixture backend lifted from the prototype.
- All Tauri config versions were aligned to 0.1.0.
- grsp has its own identity instead of sustn's asterisk: a 3×3 dot field with one dot grown large as the symbol, and a "gr•sp" wordmark where the dropped "a" is the same dot. The mark has three optical sizes (below 20px it becomes one column of three dots beside the large one) because nine dots blur when small. Sources and the icon generator live in `design/brand/`. The logo no longer spins.
- Usage metrics are anonymous and on by default, with an opt-out in Settings → General. sustn only sent metrics for signed-in users; sign-in is optional in grsp, so events carry a random install id instead and the server accepts them without a GitHub token (server migration 0002). Events are a fixed typed list and never carry code, paths, repository names, PR titles, questions or comments. Nothing is sent in fixture mode.
- A pasted PR link for a repo grsp doesn't have offers to clone it (`gh repo clone`, blobless, into `{app data}/repos/{owner}/{name}`) or to pick an existing local clone, then retries the link. SPEC §2.1 only asked for "Add its folder first".

## rust-core decisions (model, db, git, verify)

## Verification (SPEC §3)

- **Anchor within ±2 lines:** verified in place. A _range_ keeps the agent's lines (it may legitimately start at a decorator or comment above the anchor); a _point_ ref moves to the anchor's exact line, because that line is what gets highlighted and where an inline review comment is posted. `snapped` is only set for the ±3..10 case, where the whole range shifts.
- **End past EOF:** with a matching anchor the end line is clamped to the file (the anchor vouches for the start). Without an anchor the range is the only evidence, so anything outside the file drops the ref. `endLine < startLine` is treated as a point ref.
- **Multi-line anchors:** only the first non-blank line is matched. Matching is whitespace-insensitive but case-sensitive.
- **Paths:** `\` → `/`, quotes/backticks stripped, `./` and leading `/` stripped, absolute paths inside the worktree relativised, `..` resolved. Anything climbing above the repo root is rejected. `WorktreeSource` also canonicalises, so a symlink pointing outside the worktree is not read. Files over 4 MB or containing NUL bytes are treated as unreadable.
- **Base-side refs:** general refs use the worktree and fall back to the merge base only when the file no longer exists at head. Items in discovery's `removed` list are checked at the merge base only, and are shown only if the DiffMap confirms removal (file deleted, or a removed line inside the range). Walkthrough blocks are head-only (SPEC: removed code never appears in walkthroughs).
- **"Changed" means changed lines, not hunk context.** SPEC §3.2 says "overlaps at least one hunk"; a hunk carries 3 context lines either side, so taking that literally would mark code merely _near_ a change as Changed — and, through the gap rule, silently discard real gaps that sit next to changed code. Status therefore uses the DiffMap's added lines plus removal positions (`removedAt`, an extra DiffMap field: the head line that follows each removed run). A removal counts when it falls inside the range or directly at either edge. Review anchoring (§5.6) does use full hunk ranges including context, as GitHub does.
- **New:** file added, or every non-blank line in the range is an added line (blank lines are ignored either way).
- **Edge spot-check without language knowledge:** A's range text must contain, in order of trying, B's whole anchor (whitespace-insensitive), B's label, the last identifier in B's label (`OrderService.create` → `create`), or the longest identifier in B's anchor (`def requires_approval(order):` → `requires_approval`). Identifier candidates match as whole words and need ≥3 characters. A point ref for A is given the same 40-line window a block excerpt would show.
- **Event → consumer exemption** is `event` → `job` block kinds (the walkthrough block kinds have no `consumer`; the raw kind `consumer` is parsed as `job`).
- **Excerpt lines** longer than 500 characters are clipped with `…`.

## Shaping (SPEC §5)

- Entry points with no verified ref are dropped (every shown item carries a verified ref). Duplicate ids get a `-2` suffix; missing ids become `ep{n}` / `q{n}` / `f{n}`.
- Entry-point tag order: `not_covered` (a confirmed gap names it) → `new` → `timing` → `changed`. Sort is stable: gaps first, then risk, then the agent's order. Links (`entryPointId`) to entry points that were dropped or cut by the cap of 12 are cleared.
- A gap whose block Rust finds New or Changed is not shown, with a note; its ref still counts as verified (the location was real, the claim wasn't).
- `dropped` counts dropped refs plus claims that arrived with no ref at all. `unverified` counts claims kept visible without a verified ref: a walkthrough decision whose ref failed, and a "grounded" Ask answer with nothing verified behind it (whose confidence is also forced to `low`).
- **Walkthrough re-linking:** an edge into a dropped block is replaced by that block's own onward edges (recursively, cycle-safe). Re-linked edges usually fail the spot-check and show dotted, which is honest. In what-if paths, ids of dropped blocks are skipped; an option naming an id the agent never defined is discarded entirely; fewer than two surviving options removes the what-if. Options are capped at 3, paths at 12 blocks.
- `taken` keeps only blocks on the option's path that have a decision; values are normalised to `yes`/`no`. The what-if `notes` map is matched to options by label.
- Default `path`: start at the first block nothing points to, follow the first edge, stop at a repeat or 12 blocks.
- Unchanged walkthrough blocks overlapping a confirmed discovery gap show `not_covered` (caller passes the gap refs).
- Review findings are ordered blocking → should fix → nit, agent order within each. A finding on removed code (base side) always posts in the summary. An empty suggested comment falls back to `why`.
- Unknown enum strings from the agent fall back rather than fail: kind → `other`, risk/confidence → `medium`, severity → `should_fix`.

## Raw agent schemas

- Lenient throughout: missing/`null` fields default, numbers accepted as strings and vice versa, malformed list items are skipped, a malformed optional object becomes absent. The only schema failure left is the wrong top-level shape; `model::parse_agent_output` enforces that (object, or array for questions).
- `RawAsk.grounded` defaults to `true` when missing — verification, not the flag, is what decides whether refs are shown.

## Git

- PR heads are fetched into `refs/grsp/pr/{n}` in the user's repo so the commit stays reachable for the worktree. Nothing else in the user's repo is written; worktrees are detached.
- Base branch fetch is best-effort (falls back to whatever `origin/{base}` or the local branch resolves to), so preparing works offline once the PR head is present.
- `git diff` is run with `--src-prefix/--dst-prefix`, `core.quotepath=false`, `--no-ext-diff`, `--no-textconv` so user git config can't change the format being parsed.
- Only github.com PR URLs parse (PR mode is GitHub-only in v1). `parse_remote_url` returns any host; `inspect_repo` only reports a `remote` for GitHub.
- Conventional exclusions match directory _components_ named `node_modules`, `vendor`, `dist`, `build` anywhere in the path, basenames containing `.min.`, any `*.lock`, and well-known lockfile names.
- User globs (`.grsp/config.toml` → `exclude = [...]`) are gitignore-like: `*`, `?`, `**`; a pattern without `/` matches any path component; a pattern naming a directory matches everything under it. No character classes or negation.
- `.gitattributes` and `.grsp/config.toml` are read from the session worktree (i.e. at head).
- `remove_worktree` only ever deletes a folder whose parent is named `worktrees`.
- Shards: group by top-level directory; if that gives fewer than 4 groups and one group holds more than its fair share, split it one level deeper (up to 4 levels); more than 4 groups are packed largest-first into the smallest shard.
- The language label is a display-only extension count over `git ls-files`.

## Database

- `db::open` applies migration 1 (all `CREATE … IF NOT EXISTS`) only when the schema is missing, so commands work before the frontend has loaded the DB; later migrations are left to tauri-plugin-sql.
- Finding ids from the agent (`f1`) aren't globally unique but `findings.id` is the primary key, so `replace_findings` assigns UUIDs and returns the stored findings; those ids are what the UI should use.
- Archiving sets status `closed`, clears `worktree_path` and hides the session; nothing is deleted.
- `mark_interrupted` (for app start) turns leftover `running`/`pending` analyses, `running` asks and `preparing` sessions into errors.
- Timestamps written from Rust are RFC 3339 UTC; SQLite's `YYYY-MM-DD HH:MM:SS` is also understood when checking staleness.

## Decisions — rust-pipelines (agent runner, GitHub, pipelines, commands)

## Agent runner

- Claude Code runs as `claude -p --output-format stream-json --verbose --no-session-persistence --tools Read,Grep,Glob --allowedTools Read,Grep,Glob,LS --disallowedTools Bash,Edit,Write,MultiEdit,NotebookEdit,WebFetch,WebSearch --permission-mode dontAsk --strict-mcp-config --disable-slash-commands`, prompt on stdin. `--tools` restricts the built-in tool set itself; `LS` only exists in older CLI versions so it is allowed but not requested. `--strict-mcp-config` with no config and `--disable-slash-commands` keep the user's MCP servers and skills out of a pass (cheaper, and nothing but read tools is reachable).
- Codex runs as `codex exec --json --sandbox read-only --skip-git-repo-check --ephemeral --color never --output-last-message <tmp> -`, prompt on stdin. The final message is taken from the `--output-last-message` file, falling back to the last `agent_message` event.
- The whole layered prompt goes to stdin for both agents (no `--append-system-prompt`), so the two agents get identical input.
- Child env: PATH is the inherited PATH plus every known install dir plus system dirs; HOME is set; `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `OPENAI_API_KEY`, `CODEX_API_KEY` are removed so a pass always uses the subscription; `CLAUDECODE`-style parent-session markers are removed.
- Sign-in uses `claude auth status` (JSON `loggedIn`) and `codex login status`, both non-model. `agent_recheck` only runs a model ping when the CLI has no such command.
- The model and effort are left to the CLI's own defaults.
- Raw schemas are lenient, so "schema failure" is: wrong top-level shape (`model::parse_agent_output`) or a pipeline check failing (discovery: empty `behaviourSummary`; questions: no questions; walkthrough: no blocks; ask: no paragraphs; discussion: empty digest; review: neither findings nor summary). Either triggers the single repair retry; the retry prompt includes the rejected reply and tells the agent to re-emit rather than re-explore.
- When several JSON objects appear in a reply, the largest one that parses wins.
- Progress lines beyond one per 400 ms are dropped, not queued.
- "Files explored" counts files that exist in the worktree and were read (Claude `Read`, or any file argument of a Codex shell command). Grep/Glob without a file path don't count.
- The semaphore permit is held across the repair retry. A queued pass reports "Waiting for another analysis to finish" and can be cancelled while waiting.

## Pipelines

- The context pack adds a total cap of 6,000 raw-diff lines on top of the per-file 400; files past it are listed with their changed line ranges and the agent reads them from the worktree.
- Later pipelines receive the _verified_ discovery result as a compact JSON brief, including the git-derived tag.
- `.grsp/prompt.md` is appended to every pipeline (SPEC §4.2 layer 5), not only review.
- Sharded discovery: if any part fails, discovery fails (a partial analysis presented as whole would be dishonest). If only the merge pass fails, a deterministic Rust merge of the parts is used instead.
- A walkthrough whose blocks were all dropped by verification is an error with Retry, not an empty view.
- Walkthrough trace depth (Settings) changes one line of the instruction.
- The discussion digest prompt has the PR header, file list and threads but no diff. Comments are clipped to 1,500 characters, 80 threads.
- Discussion threads: GraphQL `reviewThreads` (REST review comments grouped by reply chain as fallback, unresolved), each issue comment as its own thread, and each review with a non-empty body as a thread.
- Ask runs without a discovery result if discovery failed; questions and walkthroughs require it.
- Branch-pair sessions: title = head branch name, description empty, author = head commit author.
- An empty diff (or one with only excluded files) is a session error with a plain message; no agent runs.

## Lifecycle

- `session_create` for a source that already has a session returns that session.
- `session_open` returns immediately; worktree recreation, the head check and the comment refetch run in the background and arrive as `grsp://session` / `grsp://analysis` events. The only agent pass it can start is a discussion digest whose comment count changed (SPEC §5.3).
- Staleness for branch sessions is detected by re-resolving the head branch locally.
- Refresh re-runs discovery, questions (per setting), discussion (PRs) and review if it had run or auto-run is on. Walkthroughs are not re-run eagerly: entry point ids can change with a new discovery, so they re-run lazily when opened.
- A cancelled analysis or ask is stored as status `error` with error exactly `Cancelled.`.
- Sessions left `preparing` by a previous process become `error` on startup with a "Refresh to try again" message.
- grsp.db is opened from Tauri's app _config_ dir (where tauri-plugin-sql puts it); worktrees go under the app _data_ dir. On macOS these are the same folder.
- The DiffMap isn't persisted; it is rebuilt from git on demand and cached in memory per session and head.

## Review posting

- Double-post guard: an existing submitted review by the same user on the same commit **with the same body** is adopted instead of posting again. Matching on the body is deliberate: it catches the retry-after-network-error case without silently swallowing a genuinely new review on a commit the user already reviewed. If the check itself fails, nothing is posted.
- Own-PR is checked twice: from the stored `isOwnPr` and again against the live `gh` login before posting.
- Posting on a stale session is allowed (the UI warns); `commit_id` is the analysed head.
- An included finding whose comment was cleared posts "title: why".
- A Comment/Request-changes review with no body and no comments is rejected locally.

## Housekeeping

- Legacy sustn commands (`greet`, `open_in_app`, `set_dock_badge`, `generate_*_id`, `validate_git_repo`, `clone_repository`, `git_pull`, file-tree commands, `check_*`) were removed with their files after confirming nothing in `src/` calls them. This supersedes the earlier "add Codex preflight checks" brief: `agent_detect` covers both agents.
- Unused Tauri plugins (shell, fs, store, notification) and the cocoa/objc deps were left in place: removing them also needs edits to `tauri*.conf.json`, capabilities consumers and `package.json`, which aren't all mine.

## fe-shell decisions

Judgement calls made while stripping sustn's product UI and building the grsp shell
(sidebar, new-review dialog, onboarding, settings, data layer).

## Strip

- Removed every sustn product module from `src/` (tasks, kanban, engine, scanning, budget, scheduler, queue, Linear,
  PR lifecycle, branch utils, file tree, project settings) and the deps only they used: `@dnd-kit/*`, `@pierre/diffs`,
  `highlight.js` (DESIGN.md: no syntax colour), and the JS bindings for the fs, shell, store and notification plugins.
  The Rust side still registers those plugins; only the unused npm packages went.
- Dropped the metrics/session-tracker service and the notifications/sound service. SPEC §7 limits `server/` to signups
  and the waitlist, and nothing in the shell needs dock badges or sounds.
- Kept: shadcn ui, theme provider, ErrorBoundary, UpdateDialog + updater hook, toasts, auth (`useAuth`, `db/auth.ts`,
  Account section), FeedbackDialog, app-version hook. `next-themes` stays because the shadcn `sonner.tsx` imports it.
- `pnpm test` is now `vitest run` so it exits instead of entering watch mode.

## Look

- The DESIGN.md tokens are applied through the theme (`src/ui/themes/index.ts`), so shadcn components pick them up:
  foreground/primary = ink, background = paper, sidebar = panel, muted/secondary/accent = wash, border = line,
  input = line-strong, muted-foreground = text-3. The DESIGN names are also Tailwind colours: `ink`, `paper`, `panel`,
  `wash`, `line` (+ `line-soft` #f0f0f0, `line-strong`), `text-2`, `text-3`, `code-add`, `code-hl`.
- Dark mode is kept and is the same scale inverted. DESIGN.md only specifies light, so the dark values are mine.
- `--radius` is 10px: `rounded-md` = 8px (controls), `rounded-lg` = 10px and `rounded-xl` = 12px (cards).
- Geist and Geist Mono come from `@fontsource-variable/geist{,-mono}` (bundled, no CDN). The `geist` npm package was
  avoided because it peer-depends on Next.js.
- `destructive` stays red for error alerts, as in sustn. Everything else is black/white; the onboarding check icons and
  the "Saved" toast lost their green.
- `.section-label` (11px, uppercase, 0.06em, text-3) is a shared CSS class in `App.css`.
- Added `src/ui/components/ui/segmented.tsx` for the prototype's segmented control (active segment = ink fill).
- The logo SVG was inlined in five places in sustn; it is now one `LogoMark` component with the same path.

## Shell and sidebar

- Sidebar keeps sustn's 60px brand header and footer strip, with the prototype's contents in between: the ink
  "New review" button, folders with chevron/folder icon/count, session rows as `#num · status` + title, and the
  selected row as paper fill + line border.
- Added a small "Add folder" icon next to the "Reviews" label; the prototype has no way to add a folder from the sidebar.
- The footer is a "Settings" row (DESIGN.md). The avatar and feedback button from sustn's footer only appear when the
  user has signed in to a grsp account, since feedback needs that token.
- Session status precedence: Merged/Closed (GitHub) > Stale > Reviewed > In progress. `preparing` and `error` sessions
  show "In progress"; the session view owns those states.
- Sessions whose repo folder isn't listed are shown in a trailing "Other" group instead of being hidden.
- Folders are listed in the order they were added (oldest first), so the list doesn't reshuffle.
- Archive is a "…" hover button and the right-click menu on a session row, both opening the same one-item menu. No
  confirm dialog: the menu is the second click, and archiving keeps history.
- `selectedSessionId` and the sidebar width are persisted in the Zustand store (`grsp-app-store`). A remembered
  selection is cleared if that session is no longer in `session_list`.
- The shell does not call `session_open`; `SessionView` owns opening a session.

## New review dialog

- Three modes as a segmented control. PR and branch modes default to the repo of the session currently open.
- The "Open review" button for a pasted URL is enabled by a loose client-side check; Rust does the real URL parsing.
- On `RepoNotAddedError`, after the folder is added the same URL is retried automatically.
- A repo without a GitHub remote shows an explanation in PR mode and points to branch mode.
- Base defaults to the repo's default branch (or `origin/<default>`); the button is disabled when base equals head.
- sustn's AddProjectDialog had "open existing" and "clone from URL". The grsp AddFolderDialog keeps only
  "Choose a folder" (same card styling): SPEC §5.8 says add a folder, and cloning is sustn product surface.

## Onboarding

- Steps: welcome → agent → GitHub → add folder → open a PR → done, with sustn's step bars, animations and layout.
- sustn's welcome step was the GitHub OAuth sign-in. grsp's GitHub access is the `gh` CLI (`github_status`), so the
  welcome step is just "Get started" and the OAuth sign-in moved to Settings → Account as an optional grsp account.
- Agent step: Continue is blocked only when no agent is installed. A selected agent that reports "not signed in" shows
  instructions and a warning but does not block, because sign-in detection can be wrong and the user can fix it later.
- The open-a-PR step is skipped when no folder was added, the folder has no GitHub remote, or GitHub isn't connected.
- The chosen agent is saved to settings on Continue.

## Settings

- sustn's layout (SettingsSidebar + one section at a time + SettingsRow) rather than the prototype's single scrolling
  page; the brief asked for sustn's layout. Section order follows DESIGN.md, then General and Account.
- The open section is in the URL (`/settings?section=review-prompt`); unknown values fall back to Review prompt.
- Review prompt saves on blur, and immediately on Reset.
- Git hosts: GitHub shows the `gh` state with Re-check. There is no Disconnect button because grsp doesn't hold a
  token to drop. GitLab and Bitbucket show "Coming soon".
- General only has the appearance (light/dark/system) control.
- Removing a repo asks for confirmation, calls `session_archive` for each of its sessions (so worktrees are cleaned
  up), then sets `archived = 1` on the repo and its sessions. Re-adding a removed folder un-archives the repo row
  (`path` is UNIQUE); its old sessions stay archived.

## Data layer and browser mode

- Repo and auth ids are `crypto.randomUUID()` instead of the `generate_repo_id` / `generate_auth_id` Rust commands.
- Outside Tauri, metadata, settings and repos use localStorage (`grsp-browser:*`); auth is memory-only so a token never
  lands in localStorage. Onboarding counts as complete unless the page is opened with `?onboarding=1`.
- Repos fall back when fixtures are on (`useFixtures`), not only outside Tauri, and are seeded from
  `FIXTURE_REPOS`, so `VITE_GRSP_FIXTURES=1` inside Tauri still shows fixture sessions under their folders.
- Tauri plugins (dialog, opener, deep-link, updater, app, event) are reached through `src/core/services/platform.ts`
  or guarded by `isTauri`. In a browser the folder picker is a `window.prompt` for a path.
- Malformed or out-of-range settings values fall back to the default for that key rather than failing the whole read.

## fe-screens — judgement calls

Session screens (PR header, Gist + Ask, Walkthrough, Review), fixtures and hooks.

## Fixtures

- "What's affected" lists the bulk-import gap first. The prototype shows it third, but SPEC §5.1 orders gaps first and the contract says `entryPoints` arrive already ordered.
- The `order.created consumer` row has its own short walkthrough (`emit order.created → on_order_created → PaymentService.capture`). The prototype sends that row to the approve walkthrough because it has only three; the contract has one walkthrough per entry point, so all four appear as entry-point chips.
- Blocks the prototype shows without code keep an empty excerpt and render "No code changes in this block." The real core always sends an excerpt, so that box only appears on fixtures (or a genuinely empty range).
- `ApprovalService.approve` is marked truncated (7 of 10 lines) so "Show all" / `excerpt_read` can be exercised; the real cap is 40 lines.
- One unconfirmed edge (`ApprovalService.approve → orders.update`) exists so the dotted connector is visible.
- Finding f1 (`jobs/bulk_import.py:57`) is `anchoring: "summary"`, since that file isn't in the PR diff. So the posted bar says "2 inline comments" where the prototype says 3.
- Only #482 (and sessions created through `session_create`) carry the full scenario. The other five sidebar sessions return an empty discovery, which doubles as the empty-state fixture (no description, no entry points, no discussion).
- Header shows `9 files · +212 −38`; the prototype's "6 symbols changed" has no source in the contract (no language parsing).
- Fixture commands reject with plain strings, like Tauri commands, so UI error handling is the same in both modes.
- Cancelling an analysis or an ask leaves it as `error` with the message "Cancelled." (the contract has no cancelled status). The UI treats that message as a quiet state rather than a failure.
- Fixture states are switched with `?fx=a,b` (remembered in sessionStorage for the tab, `?fx=none` clears): error, stale, large, nodesc, nodiscussion, branches, ownpr, fresh, preparing, reviewed, posted, cifail, noagent, nogithub, slow.

## Hooks

- `useSession` calls `session_open` once per mount and uses `session_get` for refetches, so nothing is re-checked or re-run on focus (SPEC §4.5). All session queries set `refetchOnWindowFocus: false`.
- `useAnalyses` owns the `grsp://analysis` subscription and is mounted once in `SessionView`; children read the same cache through `useAnalysesQuery`.
- A settled analysis event doesn't flip the cached row to done; it triggers a refetch, and the section keeps its running state until the result arrives. This avoids a frame of "done with no result".
- Finding comments save on blur; `review_post` waits for in-flight finding edits before posting.
- The review summary is local state seeded from the agent's summary; there is no command to persist an edited summary before posting.
- The GitHub login for "Posts as @…" shares the shell's `["github-status"]` query key.

## Screens

- Colours: ink/paper/line/text-3 come from the theme classes (`foreground`, `background`, `border`, `muted-foreground`), so shadcn components pick them up. The DESIGN.md tokens with no theme name live as CSS variables in `session/session.css`, each reading a global `--grsp-*` variable first and falling back to the DESIGN.md hex.
- The collapsed description is a plain-text preview of the markdown (headings and list markers dropped) so the 4-line clamp reads as prose; expanding renders the markdown.
- The collapsed discussion line is "2 open threads. 2 resolved." followed by the agent's digest, truncated to one line. The prototype's hand-written one-liner isn't in the contract.
- Suggested changes diff the suggestion against the thread's line, read with `excerpt_read`.
- A what-if starts on the option whose path crosses the most changed blocks (€25,000 in the scenario, as in the prototype).
- "Walk through it" lands on the block the mismatch's refs point at, preferring a not-covered block.
- Entry-point chips and "Walk through" arrows start at step 1; changing the what-if keeps the step index (clamped), as the prototype does.
- With unchanged blocks hidden, blocks keep their original numbers and the counter still counts the full path ("Step 3 of 7").
- Arrow keys step the walkthrough (left/up back, right/down forward) unless focus is in a field. Walkthrough position is held in `SessionView` so it survives tab switches.
- Review: with no included findings and an empty summary, a Comment review is disabled, since GitHub rejects an empty one.
- Review: after a posted review, Re-run opens a new draft with its own submit panel for the rest of that visit. Posted findings are read-only.
- "Repo prompt active" shows next to the findings count, because the contract only reports it in the review result.
- Auto-run review on open is left to the core (SPEC §2.2); the UI doesn't trigger it.
- Ask placeholder is generic ("Ask anything about this change") rather than the prototype's repo-specific example.
- Dev harness: `src/ui/components/session/dev/index.html` mounts `SessionView` without the shell (`?session=`, `?fx=`). It isn't part of the production build.

## Decisions — web-docs (web, server, scaffolding, evals)

## server/

- Replaced sustn's real D1 `database_id` in `wrangler.toml` with an all-zero placeholder. grsp must not point at sustn's production database; the real id comes from `wrangler d1 create grsp-db`. Nothing was deployed and no Cloudflare account was touched.
- Deep-link scheme stays an env var (`APP_DEEP_LINK_SCHEME`, default `grsp`). Added `server/.dev.vars.example` with `grsp-dev` for local development and `[dev] port = 3001` so `wrangler dev` matches `VITE_AUTH_SERVER_URL` in `.env.example`.
- Added a `typecheck` script (`tsc --noEmit`); the deploy workflow now runs it before migrating/deploying.
- Behaviour unchanged: GitHub OAuth sign-in/upsert, `/metrics/events`, `/health`. sustn has no separate waitlist endpoint and its website doesn't call the server, so there is no web → server wiring to keep; signup is the desktop app's GitHub sign-in.

## web/

- Fonts switched from Inter / JetBrains Mono to Geist / Geist Mono (grsp's design language) via `next/font/google`.
- Product visuals are HTML/CSS mocks (`app/components/mocks.tsx`) using the DESIGN.md tokens (added to the Tailwind theme): Gist with mismatch callout + Ask panel in the hero, New review, Walkthrough and Review under the three "how it works" steps. The Walkthrough mock is interactive (what-if chips re-route the chain, blocks are clickable) because that interaction is the product's point. All sustn screenshots were removed from `web/public`.
- sustn's Loom video embed was dropped (no grsp video exists); the hero Gist mock takes its place.
- Ticker and docs callouts/badges restyled to black and white (sustn used emerald/amber/blue).
- The "Follow us on X" footer link became a GitHub link: no grsp X account is known.
- Added a short "The agent discovers. Git confirms." section (trust rule, subscription, privacy) between "How it works" and the CTA.
- Download links point at `ghvstcode/grsp` releases with stable asset names `grsp_aarch64.dmg` / `grsp_x64.dmg` (release workflow renames to match).
- Changelog reset to a single 0.1.0 entry dated Oct 3rd, 2026, with no image.
- Docs describe `.grsp/config.toml` as `exclude = ["glob", …]`, matching `parse_config_excludes` in `src-tauri/src/git/diff.rs`. Privacy section says the server receives sign-in and anonymous feature metrics only.
- Shared `Logo`/`GitHubIcon` moved to `app/components/logo.tsx` instead of being copied into each page.

## Repo scaffolding

- Removed `Github Header.png` (sustn wordmark) and `Brand Logos Collection (6).png` (byte-identical duplicate of `icon.png`). Kept `icon.png` and `animated_icon.gif` (logo mark only).
- README header uses `icon.png` + a text wordmark instead of a header image; license line says GPL-2.0 because that is what `LICENSE` contains (sustn's README said MIT).
- CI (`lint-and-format.yml`) gained `pnpm test`, the eval scorer tests (`pnpm eval:test`) and a `cargo test` job on `macos-latest` (avoids installing WebKitGTK on Linux; creates an empty `dist/` for `tauri::generate_context!`). Release and QA builds also run `pnpm test`. Evals are never run in CI.
- QA build path filters also ignore `evals/**` and `design/**`.
- `.prettierignore` excludes `evals/fixtures` (line numbers must not drift) and `design/prototype.html`; `.gitattributes` marks fixtures `linguist-vendored`.
- `eslint.config.mjs` (not mine): added `"evals/**/*"` to `ignores`, a one-line additive change, because typed linting can't parse `.mjs`/fixture files outside the tsconfig project and `pnpm lint` would fail.
- `script/bump_version.sh` kept as in sustn (it contains nothing sustn-specific).

## Evals

- Fixtures don't reproduce the prototype's line numbers (e.g. `orders/repository.py:104`); files are kept small and expectations match on names and files, never on lines.
- orders-approval: the description is true except for "all orders" so that `mismatchCount: 1..1` is meaningful. The prototype's "behind the `order_approvals` flag" rollout note was left out (there is no flag in the fixture, which would be a second real mismatch), and orders are EUR-only so currency handling isn't a second gap.
- The bulk import bypass is `BulkImportJob.run → OrderRepository.insert_many → Order.objects.bulk_create` with status CONFIRMED, then `order.created` per order, untouched by the PR.
- Expectation patterns are case-insensitive regexes matched per field. `maxUnverifiedRatio` is `(dropped + unverified) / all references` from the analysis's VerificationReport.
- What-if expectations are keyed by option label with loose matching ("€9,999" ≈ "9999 EUR"); `mustInclude` is ordered along the path. The €10,000 option is `optional` because the spec allows 2–3 options.
- BulkImportJob is expected through `gapMentions` plus `affectedInclude` (entry point tagged Not covered, or a gap), not `entryPointsInclude`, since SPEC lets a gap appear as a "Not covered" row without being an entry point.
- ts-fullstack keeps the UI unchanged in the PR (server-only change) so the UI entry point can only be found by searching for callers. go-service and ts-fullstack expect zero mismatches and zero gaps; config-only also caps dropped references (`maxDropped: 1`) as the "no invented code paths" check.
- `run.mjs` passes one `--ask` per question in `pr.json` (repeated flag) and omits `--ask` when the ask pipeline isn't selected. It finds cargo under `~/.cargo/bin` or `~/.rustup/toolchains/*/bin` when it isn't on PATH; `--bin` / `GRSP_EVAL_BIN` runs a prebuilt binary. Added `--replay <report>` to re-score saved outputs without an agent and `--timeout <minutes>` (default 30).
- Scorer tests live in `evals/tests/*.mjs` (no `.test.` in the name) so Vitest doesn't pick them up; fixture files avoid `.test.`/`.spec.` names for the same reason. Run with `pnpm eval:test`.
- Fixture repos are left checked out on `main` so `pr` is free for a worktree.
- `.prettierignore` also lists `design/DESIGN.md`, `design/PROMPT.md` and `design/SPEC.md`: they fail `prettier --check` as handed over, and reformatting the source-of-truth documents isn't this agent's call.
