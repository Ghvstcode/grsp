# Decisions — web-docs (web, server, scaffolding, evals)

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
