# grsp — functional spec

This document defines what grsp *does*: what each feature computes, where its data comes from, how it fails, and how to tell it works. `DESIGN.md` defines how it looks. Where they overlap, this file wins on behaviour and DESIGN.md wins on presentation.

grsp is a distributed product. It has to work on any repository a user points it at, in any language or framework, with no per-project setup. Never hard-code anything to a particular codebase, language or framework.

## 0. Architecture in one paragraph

grsp is **agent-first**. The user's own coding agent (Claude Code or Codex, running on their subscription) does all the understanding: it explores the PR's worktree, finds entry points, traces paths, spots gaps, answers questions and reviews. grsp's Rust core does no language parsing. It provides three things around the agent: **git facts** (what changed, exactly where), **verification** (every claim the agent makes about the code is checked against the worktree and the diff before it's shown), and **orchestration** (worktrees, caching, progress, GitHub). The rule:

> **The agent discovers and interprets. git and the worktree confirm.**
> Change status, line numbers, code excerpts, comment threads and CI are never taken from agent output. Every `file:line` the agent returns is verified before it's shown.

## 1. Core objects

```ts
Repo           { id, name, path, defaultBranch, remote: { host: 'github', owner, name } | null }
ReviewSession  { id, repoId, source: { kind: 'pr', number, url } | { kind: 'branches', base, head },
                 title, author, baseRef, headRef, baseSha, headSha, mergeBaseSha,
                 status: 'preparing' | 'ready' | 'stale' | 'error' | 'closed',
                 worktreePath, createdAt, lastOpenedAt, postedReview?: { id, url, event } }
DiffMap        { files: [{ path, status: 'added' | 'modified' | 'deleted' | 'renamed', oldPath?,
                           hunks: [{ oldStart, oldLines, newStart, newLines }], addedLines: number[] }] }
Analysis       { sessionId, kind: 'discovery' | 'questions' | 'walkthrough:<entryId>' | 'discussion' | 'review',
                 headSha, status: 'pending' | 'running' | 'done' | 'error', result: JSON, verification: VerificationReport,
                 error?, startedAt, finishedAt }
AskMessage     { id, sessionId, question, answer: AskAnswer, verification: VerificationReport, headSha, createdAt }
QuestionState  { sessionId, questionId, opened: boolean }
VerificationReport { verified: number, dropped: number, unverified: number, notes: string[] }
```

Every analysis is keyed by `headSha`. The cache never serves a result computed for a different head.

## 2. Session lifecycle

### 2.1 Creating a session
The user can start a session three ways:

- **Paste a URL.** Accept `https://github.com/{owner}/{repo}/pull/{n}`, with or without trailing `/files`, `/commits` or query strings. If `{owner}/{repo}` matches a repo the user has added, use that folder. If it doesn't, show "This PR is for {owner}/{repo}. Add its folder first" with an Add folder button.
- **Pick an open PR.** The list for the selected repo comes from the GitHub API and shows number, title, author and updated time.
- **Choose two branches.** Pick local or remote branches as base and head. There's no discussion and no posting in this mode; the UI says so where those features would appear.

### 2.2 Preparing
Run these steps in order, emitting a plain-language progress event for each one. Never show a bare spinner.

1. Fetch the base and head refs (`git fetch origin pull/{n}/head` for PRs) and record `baseSha`, `headSha` and `mergeBaseSha`.
2. Create a detached worktree at `headSha` under `{appData}/worktrees/{sessionId}`. It's used for reading only.
3. Build the **DiffMap** from `git diff --find-renames mergeBaseSha..headSha`. Use the merge base so changes on main don't leak into the PR. Exclude vendored, generated and lock files: honour `linguist-generated` and `linguist-vendored` in `.gitattributes`, common paths (`node_modules`, `vendor`, `dist`, `build`, `*.min.*`, lockfiles), and user globs in `.grsp/config.toml`.
4. Run the **discovery** pass (§5.1). Then run `questions`, and `discussion` for PRs, in parallel, with at most 2 agent processes at once.
5. Walkthroughs run lazily the first time an entry point is opened. `review` runs only when the user asks, unless auto-run is on.
6. The UI renders each section as soon as its analysis finishes. Sections still running show a skeleton with the agent's current progress line (§4.4). A failed section shows the error and a Retry button. One section failing never blocks the others.

### 2.3 New pushes
When a session is opened or focused, check the PR's head SHA and poll every 5 minutes while it's open. If the head has moved:

- Set the status to `stale`.
- Show a bar: "3 new commits since you started. Refresh analysis." Refreshing builds a new worktree and DiffMap and re-runs the analyses that had already run.
- Keep the old Ask history and mark answers from earlier SHAs "from an earlier version."

### 2.4 Closing
Archiving a session removes its worktree and keeps its history. Delete the worktrees of sessions untouched for 14 days on app start, and recreate them on demand.

## 3. Verification layer (Rust, deterministic)

This is grsp's trust layer and the most important code in the app. It needs no language knowledge, only git and text.

### 3.1 Code references
Every location the agent returns is a `CodeRef`: `{ file, startLine, endLine?, anchor? }`. `anchor` is a short string the agent claims appears on `startLine`, such as a function name, `order.total > THRESHOLD`, or `bulk_create`.

A ref is **verified** if the file exists in the worktree (or, for deleted code, at `mergeBaseSha`), the line range is within the file, and `anchor`, when given, appears on `startLine` or within 2 lines of it (whitespace-insensitive). If the anchor is found within ±10 lines, **snap** the ref to that line and count it as verified. Otherwise the ref is **dropped**.

A claim that loses all its refs stays visible only if it's still useful without them, and is marked "unverified" in the UI. Mismatches, findings and gaps with no verified ref are never shown.

### 3.2 Change status
For any code block the agent identifies (`file` + `startLine..endLine`), Rust computes the change status from the DiffMap:

- **New:** the file was added, or every non-blank line in the range is an added line.
- **Changed:** the range overlaps at least one hunk.
- **Unchanged:** no overlap.
- **Removed:** reported by the agent as removed code with a ref at `mergeBaseSha`; listed in the Gist, never in walkthroughs.
- **Not covered:** the agent flagged the block as a gap (§5.1) **and** Rust confirms it's Unchanged. A gap that is actually part of the diff isn't a gap.

The agent never sets change status. If it includes one, ignore it.

### 3.3 Edge spot-check
When the agent says block A calls or leads to block B, check that A's line range contains B's `anchor` or name. If it doesn't, keep the edge but mark it **unconfirmed**; the UI shows a dotted connector. A path step from an event or queue publish to a consumer is exempt from this check, because indirection is expected, but needs a verified ref on both ends.

### 3.4 Excerpts
All code shown in the UI is read by Rust from the worktree (or `mergeBaseSha` for removed code) using verified refs: ±3 lines around a point, or a block's range capped at 40 lines with "Show all." Diff markers come from the DiffMap. The agent never supplies code text.

### 3.5 Reporting
Every analysis stores a VerificationReport. The Gist shows one quiet honesty line, for example "Agent explored 23 files · 41 references verified · 2 unverified."

## 4. Agent runner

### 4.1 Agents
- **Claude Code:** `claude -p`, non-interactive, restricted to read, search and list tools. No editing, no shell commands that change state.
- **Codex:** `codex exec` in its read-only sandbox.
- Detection and sign-in status: see §5.8. grsp never uses or stores API keys.

### 4.2 Invocation
- The working directory is the session worktree, so the agent can grep, list and read anything in the repo at head.
- **Prompt layering:**
  1. A grsp system preamble: the task, the JSON contract, grounding rules ("every claim needs a CodeRef with an anchor copied exactly from the file"), and "do not guess; if you didn't read it, don't claim it."
  2. The pipeline instruction.
  3. The context pack: PR title, description, author, base/head, and the DiffMap with the raw diff (truncated per file at 400 lines, with a note).
  4. The user's review prompt (review pipeline only).
  5. `.grsp/prompt.md` from the repo, if present.
- **Output:** a single JSON object matching the pipeline's schema. Strip code fences and parse with serde. On a parse or schema failure, retry once with the error appended. If that fails too, mark the analysis `error` and show a raw-output excerpt behind "Details."
- **Limits:** a 5-minute timeout per pass, user cancellation from any running section, and at most 2 concurrent passes.

### 4.3 Large PRs
If the DiffMap has more than 60 changed files or 3,000 changed lines, run discovery **sharded** by top-level directory or package, with up to 4 shards, then a short merge pass that dedupes entry points and combines summaries. Show "Large PR: analysed in 4 parts."

### 4.4 Progress
Stream the agent's tool activity as progress lines ("Reading orders/services.py", "Searching for bulk_create"), rate-limited to one update every 400ms and truncated to one line. That's the plain-language progress the UI shows.

### 4.5 Cost
Every pass runs on the user's subscription, so be frugal:

- Cache everything by `headSha`.
- Run passes lazily.
- Never re-run on focus, only when the user presses Refresh or Retry.
- Show the number of agent passes in the session footer.

## 5. Features

Each feature has the same parts: inputs, outputs (schema), behaviour, and acceptance. All `CodeRef`s pass through §3.

### 5.1 Discovery (powers the Gist)
This is one pass, run on session open, and it's the backbone of the Gist.

- **Inputs:** the context pack.
- **Required investigation,** stated explicitly in the pipeline instruction:
  1. Read every changed file's hunks and enough surrounding code to understand them.
  2. Find the **entry points** whose behaviour this PR changes: HTTP routes, UI pages and user actions, jobs, queue consumers, scheduled tasks, CLI commands, public library APIs. Search for callers of the changed code until you reach them.
  3. For every **write target** the PR changes (a table, model, file, external resource or state field), search the whole repo for *other* code that writes to it, and decide whether that code bypasses the new behaviour. Those are **gaps**.
  4. Compare the PR description's checkable claims with what the code does.
  5. Note external calls the change introduces or moves (payments, email, HTTP, queues).
- **Output:**
  ```json
  { "behaviourSummary": "2–4 sentences, plain language, about behaviour not files",
    "mismatches": [{ "claim": "what the description says", "reality": "what the code does", "refs": [CodeRef], "entryPointId": "optional" }],
    "entryPoints": [{ "id": "ep1", "label": "POST /orders", "kind": "http | ui | job | consumer | schedule | cli | api | other",
                      "ref": CodeRef, "effect": "one line on what changes for this entry point", "risk": "high | medium | low",
                      "timingOnly": false }],
    "gaps": [{ "ref": CodeRef, "writeTarget": "orders table", "explanation": "how it bypasses the change", "entryPointId": "ep3" }],
    "removed": [{ "ref": CodeRef, "name": "..." }],
    "askSuggestions": ["three short questions a reviewer would ask"] }
  ```
- **Behaviour:**
  - At most 12 entry points, ranked by risk.
  - A mismatch is only reported when the description makes a checkable claim the code contradicts or doesn't fully implement. An empty description gives no mismatches and shows "No description to compare against."
  - **What's affected** order: entry points that have gaps first, then by risk. The tag is New, Changed or Timing, derived by Rust from the entry point's ref (New if its block is New, otherwise Changed; Timing if the agent set `timingOnly`). Gaps also appear as "Not covered" rows.
  - Each mismatch's Walk through button opens the walkthrough for its entry point, starting at the most relevant block.
- **Acceptance (fixture, §8):** the pass finds the bulk-import gap and the matching mismatch, invents no others, and every shown item carries a verified ref.

### 5.2 Comprehension questions
- **Inputs:** the context pack and the discovery result.
- **Output:** `[{ id, question, answer, refs: [CodeRef] }]`, 3–6 items.
- **Behaviour:**
  - Questions must be about behaviour a reviewer should verify: edge cases, failure modes, permissions, data migration, concurrency. No trivia.
  - Opening a question marks it checked and persists that.
  - The Settings toggle hides the section and skips the pass.
- **Acceptance:** questions with no verified ref are dropped.

### 5.3 Discussion
PR sessions only.

- **Inputs:** PR review comments, issue comments, reviews, and resolved state (GraphQL `reviewThreads`), all from the GitHub API.
- **Output:** the agent returns `{ digest: "2–4 sentences on where things stand and what is unresolved", threadGists: { threadId: "≤12 words" } }`. Threads, comments, authors and status are facts from the API.
- **Behaviour:**
  - Render ` ```suggestion ` blocks as diffs.
  - Don't run the agent on zero comments; show "No discussion yet."
  - Refetch comments, not the digest, when the session is focused. Re-run the digest only when the comment count has changed.

### 5.4 Ask
- **Inputs:** the question, the context pack, the discovery result, and the last 3 Q&As in the session for follow-ups. The agent may read anything in the worktree.
- **Output:**
  ```json
  { "paragraphs": ["..."], "excerpt": CodeRef | null, "highlight": CodeRef | null,
    "refs": [CodeRef], "confidence": "high" | "medium" | "low", "grounded": true }
  ```
- **Behaviour:**
  - The trace line ("Explored 3 files · 4 references verified") comes from the agent's tool activity and the VerificationReport.
  - When the question can't be answered from the code, the agent sets `grounded: false`, says so plainly, and names the closest relevant code. It never answers from general knowledge as if it were about this repo.
  - Low confidence shows a quiet "Low confidence" label.
  - History persists per session, newest first. Suggestion chips come from `askSuggestions`.
- **Acceptance:** the excerpt and refs are verified, and asking about something absent from the repo produces an ungrounded "no direct match" answer.

### 5.5 Walkthrough
One pass per entry point, run when it's first opened.

- **Inputs:** the entry point, the context pack, and the discovery result.
- **Output:**
  ```json
  { "blocks": [{ "id": "b1", "label": "OrderService.create", "kind": "route | validation | service | policy | auth | data_access | db_write | event | external | job | ui | other",
                 "ref": CodeRef, "anchor": "...", "note": "1–2 sentences: what happens here, and what changed if anything",
                 "next": ["b2"], "decision": { "condition": "order.total > €10,000", "yes": "REQUIRES_APPROVAL", "no": "OK", "ref": CodeRef } | null }],
    "whatIf": { "variable": "order total",
                "options": [{ "label": "€9,999", "path": ["b1", "b2", "b3", "b4", "b5c", "b6c"] }, { "label": "€25,000", "path": ["..."] }],
                "notes": { "€10,000": "boundary explanation" } } | null }
  ```
- **Behaviour:**
  - At most 12 blocks per path. Only follow branches that reach changed code, a gap, or an external effect.
  - Change chips come from §3.2 and connector confidence from §3.3.
  - Blocks whose ref is dropped are removed, and the path is re-linked around them.
  - **What if:** at most one variable, offered only when a changed decision branches on an input, with 2–3 options. It's static reasoning over the code and is labelled "Based on reading the code." Every block id in an option path must exist.
  - The code view per block shows the head version from the worktree, with diff markers from the DiffMap.
  - The "Show unchanged blocks" setting filters blocks without changing their numbering.
- **Acceptance:** on the fixture scenario, the €9,999, €10,000 and €25,000 options produce the same paths as the prototype.

### 5.6 AI review
- **Inputs:** the user's review prompt and any repo override, the context pack, the discovery result, and the discussion (so it doesn't repeat points already raised and resolved).
- **Output:** `{ findings: [{ id, severity: "blocking" | "should_fix" | "nit", title, why, ref: CodeRef, suggestedComment }], summary: "1–2 sentences" }`
- **Behaviour:**
  - Findings without a verified ref are dropped.
  - **Anchoring:** GitHub only accepts inline comments on lines that are part of the PR diff. If a finding's line is an added or context line in a hunk on the head side (from the DiffMap), it posts inline. Otherwise it's marked "Posts in summary," and its comment goes into the review body under a "Not in this diff" heading, with the `file:line` written out.
  - Each finding shows the excerpt from §3.4 with its line highlighted.
  - The user can edit any comment, exclude any finding, and edit the summary.
  - **Verdict:** Comment, Approve or Request changes. It defaults to Request changes if any included finding is blocking, otherwise Comment.
  - **Posting:** one call to `POST /repos/{owner}/{repo}/pulls/{n}/reviews` with `commit_id = headSha`, `event`, `body` and inline `comments` (`path`, `line`, `side: RIGHT`). On success, store the review id and URL, show the confirmation, and show the verdict in the header.
  - **Errors:**
    - **Own PR:** GitHub rejects Approve and Request changes on your own PR. Detect this in advance (author equals the authenticated user), disable those options, and explain why.
    - **Stale:** if the session is stale, warn before posting that "Findings were generated for an older commit," and offer Re-run.
    - **Retry and double-posting:** before posting, check for an existing review by this user on `commit_id`, so a retry after a network error can't post twice.
  - Re-running replaces unposted findings; posted reviews are kept in history.

### 5.7 Coverage line
Below "Code does," show the verification honesty line from §3.5. If discovery was sharded, say so too. This replaces any claim about language support: grsp works on any code its agent can read.

### 5.8 Settings
- **Review prompt:** stored globally. `.grsp/prompt.md` in a repo is appended to it for that repo, and the Review tab shows "Repo prompt active" when one is.
- **Agent:**
  - Claude Code or Codex. Detection checks `PATH`, then the known install paths.
  - "Signed in" is verified with a cheap non-model command where the CLI offers one. Otherwise, run a minimal ping only when the user presses Re-check.
  - Switching agents takes effect on the next pass.
- **Analysis:** the questions toggle, the show-unchanged-blocks toggle, and auto-run review on open (off by default, since it costs subscription usage).
- **Git hosts:** GitHub, reusing sustn's auth. GitLab and Bitbucket show "Coming soon" in v1, and the branch-pair mode works for any host.
- **Repositories:**
  - Add a folder; it must be a git repo, otherwise show an error.
  - The remote is parsed from `origin`.
  - Removing a repo archives its sessions.

### 5.9 Sidebar
Sessions are grouped by repo folder, and the folders' open or closed state is persisted. Each session shows its status: In progress (open with no posted review), Reviewed (review posted), Merged or Closed (from GitHub on refresh), or Stale. Within a folder, sessions are sorted by last opened. "New review" opens the creation dialog from §2.1.

## 6. Onboarding
Reuse sustn's flow, with these steps:

1. Welcome.
2. Agent: detect Claude Code and Codex, and let the user pick one. If neither is found, show install instructions and Re-check; the user can't continue without one.
3. Connect GitHub (skippable; the app is then limited to branch-pair mode).
4. Add the first repo folder.
5. Optionally open a PR straight away from that repo's open PRs.

## 7. Non-goals for v1

- Any language parsing or static analysis in grsp itself. The agent does the understanding; Rust only does git and verification.
- Hosts other than GitHub for PR mode. The branch-pair mode works with any host.
- Linking analysis across separate repositories.
- Running tests, builds or any code.
- Editing code.
- Team features or shared sessions.
- Any server-side processing of user code. `server/` only handles signups and the waitlist.

## 8. Fixtures, tests and evals

Agent output isn't deterministic, so testing splits into three kinds.

- **Unit tests (deterministic, run in CI):**
  - PR URL parsing.
  - DiffMap building, including renames, deletions, binary files and vendored or generated exclusion.
  - CodeRef verification: anchor matching, snapping and dropping.
  - Change-status computation against hunks.
  - Edge spot-checks.
  - Excerpt reading.
  - Diff-line anchoring for review comments.
  - Cache keying by `headSha`.
  - JSON parsing and repair-retry.
- **Contract tests (deterministic, run in CI):** for each pipeline, feed recorded agent responses through parsing, verification and shaping, and assert the UI-ready output. Include deliberately bad responses: hallucinated files, wrong line numbers, wrong anchors, a "changed" claim about unchanged code, and malformed JSON. Assert that each one is dropped, snapped or flagged correctly.
- **Evals (run against a real agent; local and on demand, not in CI):** `pnpm eval` runs the real pipelines against fixture repos and scores them against expected outcomes. Fixtures are tiny git repos with base and head commits, in `evals/fixtures/`:
  - **The prototype scenario** (Python/Django): the order approval PR, including the bulk import that bypasses the policy. Expected: the bulk-import gap and the mismatch are found, there are no invented mismatches, and the what-if paths match the prototype.
  - **A TypeScript full-stack repo:** a UI button calling an endpoint the PR changes. Expected: the UI action appears as an affected entry point.
  - **A Go or Rust service:** proves language independence.
  - **A config-only PR** (YAML and SQL). Expected: a sensible Gist with no invented code paths.

  The eval report prints a pass/fail per expectation plus verification stats, so prompt changes can be compared over time.
