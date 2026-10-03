# fe-shell decisions

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
