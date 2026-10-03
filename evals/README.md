# Evals

Agent output isn't deterministic, so grsp's testing splits three ways (SPEC §8):

- **Unit tests** and **contract tests** are deterministic and run in CI (`pnpm test`, `cargo test`).
- **Evals** run the real pipelines with a real agent against the fixture repos in this folder and score the result. They spend your Claude Code or Codex subscription, so they are **local and on demand, never in CI**.

```bash
pnpm eval                                        # every fixture, default agent
pnpm eval --fixture orders-approval              # one fixture (repeatable)
pnpm eval --agent codex                          # claude | codex
pnpm eval --pipelines discovery,walkthrough      # a subset of pipelines
pnpm eval --replay evals/reports/<report>.json   # re-score a saved run; no agent
pnpm eval --list
pnpm eval:test                                   # unit-test the scorer and the fixture builder
```

For each fixture, `run.mjs`:

1. builds the fixture into a real git repo under `evals/.repos/<name>` (`main` = `base/`, `pr` = `head/`);
2. runs the headless eval binary in branch-pair mode:
   `cargo run --manifest-path src-tauri/Cargo.toml --bin grsp-eval -- --repo <path> --base main --head pr --title <t> --description-file <f> [--agent claude|codex] [--pipelines discovery,questions,walkthrough,ask,review] [--ask "question"]…`;
3. scores the single JSON document it prints on stdout against `expected.json`;
4. prints one `PASS` / `FAIL` / `SKIP` line per expectation plus verification stats, and writes a timestamped report (including the raw output) to `evals/reports/`.

The exit code is non-zero when any expectation fails or a run produces no output. Agent progress goes to stderr.

Compare reports before and after a prompt change. An expectation that flips from PASS to FAIL is a regression; a drop in "references verified" or a rise in "dropped" means the agent is guessing more.

`--bin <path>` (or `GRSP_EVAL_BIN`) runs a prebuilt `grsp-eval` instead of going through cargo. `--timeout <minutes>` bounds each fixture (default 30).

## Fixtures

Each fixture is a tiny but realistic repository:

```
evals/fixtures/<name>/
  base/           the tree on main
  head/           the tree on the PR branch
  pr.json         { "title", "description", "author"?, "ask"?: ["question", …] }
  expected.json   what a good analysis must contain (below)
```

| Fixture           | What it is                                                                                                                                                                                                                        | What it proves                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `orders-approval` | The prototype scenario (Python/Django). Orders over €10k need a second approval. The description says _all_ orders; the nightly `BulkImportJob` `bulk_create`s orders as CONFIRMED without the policy and is untouched by the PR. | The bulk-import gap and its mismatch are found, no others are invented, what-if paths are right. |
| `ts-fullstack`    | An Express + React monorepo. The PR adds a seat-limit check on the server; the "Invite member" button that calls the endpoint is unchanged.                                                                                       | The UI action shows up as an affected entry point even though no UI file changed.                |
| `go-service`      | A Go ledger service. `POST /v1/transfers` learns to honour `Idempotency-Key`.                                                                                                                                                     | Language independence.                                                                           |
| `config-only`     | Helm values and a SQL migration; no application code changes.                                                                                                                                                                     | A sensible gist with no invented code paths, mismatches or gaps.                                 |

`node evals/build-fixtures.mjs [--fixture <name>] [--out <dir>]` builds the repos without running anything. Commits use a fixed author and date and ignore your git config, so the SHAs are identical on every machine and `git diff main..pr` is exactly the PR.

Fixture sources are excluded from Prettier and ESLint on purpose: the agent cites `file:line`, so their line numbers must not drift.

### Adding a fixture

1. Create `evals/fixtures/<name>/base` and `head` with plain source files. Keep it small (a dozen files) and make the description _true_ except for the claims you want caught, otherwise the "no invented mismatches" expectations become noise.
2. Write `pr.json` and `expected.json`.
3. Run `node evals/build-fixtures.mjs --fixture <name>` and check `git -C evals/.repos/<name> diff main..pr`.
4. Add the fixture to the list asserted in `evals/tests/scorer.mjs` and run `pnpm eval:test`.

## The output being scored

`grsp-eval` prints one JSON document using the UI-ready types from `src/core/types/grsp.ts` — that is, everything in it has already been through the verification layer:

```ts
{
    session: ReviewSession,
    discovery: Analysis<DiscoveryResult>,
    questions: Analysis<QuestionsResult>,
    walkthroughs: { [entryPointId: string]: Analysis<WalkthroughResult> },
    ask: AskMessage[],
    review: Analysis<ReviewResult>,
    passes: number
}
```

The scorer (`scorer.mjs`) is defensive about this shape: a missing or failed section fails its own expectations with the analysis error as the detail, and never throws. It accepts an `Analysis` wrapper or a bare result.

## `expected.json`

Top-level keys are pipeline sections: `discovery`, `questions`, `walkthrough`, `ask`, `review`. A section that is absent isn't scored; a section whose pipeline wasn't run (`--pipelines`) is reported as `SKIP`. A top-level `description` string is for humans.

**Patterns** are case-insensitive regular expressions. They are tested against each relevant field separately, so `^` and `$` anchor to a single field (`"POST /orders/?$"` matches the label `POST /orders` but not `POST /orders/:id/approve`). **Ranges** are `{ "min"?, "max"? }`.

### `discovery`

| Key                  | Meaning                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `summaryMentions`    | Patterns that must each match `behaviourSummary`.                                                                                                                                             |
| `entryPointsInclude` | Each item is a pattern or `{ "match", "kind"?, "tag"? }`. Some entry point must match (label, effect, ref file or anchor); `kind` / `tag` (a value or a list) must hold for one that matches. |
| `entryPointsExclude` | Patterns no entry point may match.                                                                                                                                                            |
| `affectedInclude`    | Like `entryPointsInclude`, but a gap also counts: a "What's affected" row. With `"tag": "not_covered"` it passes for an entry point tagged Not covered (or with `hasGap`) or a matching gap.  |
| `entryPointCount`    | Range for the number of entry points (SPEC: at most 12).                                                                                                                                      |
| `gapMentions`        | Patterns that must each match some gap (write target, explanation, ref file or anchor).                                                                                                       |
| `gapCount`           | Range for the number of gaps.                                                                                                                                                                 |
| `mismatchCount`      | Range for the number of mismatches. `{ "min": 1, "max": 1 }` is "find the real one, invent no others".                                                                                        |
| `mismatchMentions`   | Patterns that must each match some mismatch (claim, reality, ref file or anchor).                                                                                                             |
| `allRefsVerified`    | Every entry point, gap and removed item has a verified ref, and every mismatch has at least one.                                                                                              |
| `maxUnverifiedRatio` | Upper bound on `(dropped + unverified) / (verified + dropped + unverified)` from the analysis's VerificationReport: the share of the agent's references that did not survive verification.    |
| `maxDropped`         | Upper bound on dropped references. Use it where inventing code paths is the failure mode (`config-only`).                                                                                     |

### `questions`

`count` (range), `mentions` (patterns matched against question and answer text), `allRefsVerified` (every question has at least one verified ref), `maxUnverifiedRatio`, `maxDropped`.

### `walkthrough`

One object or a list of them, one per entry point to check:

| Key             | Meaning                                                                                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entryPoint`    | Pattern identifying the entry point in the discovery result. Its walkthrough is looked up in `walkthroughs` by id.                                                                                                         |
| `maxPathLength` | No path (the default one or any what-if option) is longer than this (SPEC: 12).                                                                                                                                            |
| `blocksInclude` | Patterns that must each match some block (label, ref file or anchor).                                                                                                                                                      |
| `blockStatus`   | `[{ "match", "status", "optional"? }]`: a matching block has that change status (`new`, `changed`, `unchanged`, `not_covered`). Status is computed by Rust from the diff, so this checks the agent picked the right block. |
| `whatIf`        | Keyed by option label. Each value: `mustInclude` (patterns matched **in order** along the option's path), `mustNotInclude` (patterns no block on the path may match), `optional` (skip if the option isn't offered).       |

What-if keys are matched loosely against option labels: punctuation and currency signs are ignored (`"€9,999"` matches `9999 EUR`), an exact match wins, then the shortest label containing the key. Wrap a key in slashes to use a regular expression instead (`"/^under/"`).

Two invariants are always checked: every id in every path exists in `blocks`, and every block has a verified ref.

### `ask`

A list. Each item's `question` must be one of the questions in `pr.json` (the runner passes them to `grsp-eval --ask`).

| Key           | Meaning                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `grounded`    | The answer's `grounded` flag. Use `false` for a question about something absent from the repo: it must say so, not guess. |
| `mentions`    | Patterns that must each match the answer text.                                                                            |
| `refsInclude` | Patterns that must each match the file of a verified ref or the excerpt.                                                  |

Unless `grounded` is `false`, all of the answer's refs must be verified.

### `review`

| Key               | Meaning                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findingsInclude` | `[{ "match", "file"?, "severity"?, "anchoring"? }]`: some finding matches `match` (title, why, comment) in a file matching `file`, with one of the listed severities. |
| `findingCount`    | Range for the number of findings.                                                                                                                                     |
| `allRefsVerified` | Every finding has a verified ref.                                                                                                                                     |

### Example

```json
{
    "discovery": {
        "gapMentions": ["BulkImportJob|bulk_create|insert_many"],
        "mismatchCount": { "min": 1, "max": 1 },
        "entryPointsInclude": [{ "match": "POST /orders/?$", "kind": "http" }],
        "allRefsVerified": true,
        "maxUnverifiedRatio": 0.2
    },
    "walkthrough": {
        "entryPoint": "POST /orders/?$",
        "whatIf": {
            "€9,999": { "mustNotInclude": ["approval\\.requested|notify"] },
            "€25,000": {
                "mustInclude": ["ApprovalPolicy", "approval\\.requested|notify"]
            }
        }
    },
    "ask": [
        {
            "question": "Can bulk imports skip approval?",
            "grounded": true,
            "refsInclude": ["jobs/bulk_import\\.py"]
        }
    ],
    "review": {
        "findingsInclude": [
            { "match": "bulk|import", "severity": ["blocking"] }
        ]
    }
}
```

## Files

- `build-fixtures.mjs` — fixtures → git repos.
- `run.mjs` — `pnpm eval`.
- `scorer.mjs` — pure scoring functions.
- `tests/` — `node --test` tests for the above, with a hand-written sample output (`sample-output.mjs`). These are deterministic and do run in CI.
- `.repos/`, `reports/` — generated, gitignored.
