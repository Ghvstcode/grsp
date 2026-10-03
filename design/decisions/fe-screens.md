# fe-screens — judgement calls

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
