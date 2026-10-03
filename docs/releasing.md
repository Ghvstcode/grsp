# Releasing

How to cut a new grsp release and how the CI pipelines ship builds.

## Cutting a release

When you're ready to ship a version, the flow is:

1. Run `pnpm bump:patch` (0.1.0 → 0.1.1) or `pnpm bump:minor` (0.1.0 → 0.2.0) — this updates the version in `package.json` plus all three Tauri configs at once.
2. Commit the version bump and push.
3. Tag and push the tag: `git tag v0.1.1 && git push --tags`.
4. Watch [`release.yaml`](../.github/workflows/release.yaml) on the Actions tab — it triggers automatically on any `v*` tag.

### What `release.yaml` does

1. Builds two macOS binaries in parallel — one for Apple Silicon (`aarch64-apple-darwin`), one for Intel (`x86_64-apple-darwin`).
2. Each build is code-signed with the Apple Developer cert and notarized with Apple so Gatekeeper doesn't block it.
3. A `publish` job then creates a GitHub Release containing:
    - The two `.dmg` files, renamed to the stable names `grsp_aarch64.dmg` and `grsp_x64.dmg` (what the Download button on grsp.app links to).
    - `.app.tar.gz` + `.sig` files (what the Tauri updater consumes).
    - A `latest.json` manifest that tells the updater "here's the newest version and where to download it".

### Required secrets

The release workflow relies on these repo secrets:

- `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — signs the updater bundle.
- `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` — Apple notarization.
- `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` — Developer ID code-signing cert.

## Nightly QA builds

Every push to `main` triggers [`qa-build.yaml`](../.github/workflows/qa-build.yaml), which builds both architectures using `tauri.qa.conf.json` and publishes them as a `nightly` pre-release on GitHub. Path filters skip the build when only `server/**`, `web/**`, `docs/**`, `evals/**`, `design/**`, or top-level markdown changes. The `nightly` tag is overwritten each run, so testers can always grab the freshest `main` without waiting on a formal release.

## CI on pull requests

[`lint-and-format.yml`](../.github/workflows/lint-and-format.yml) runs on every pull request and push to `main`: Prettier check, ESLint, `tsc`, `pnpm test`, the eval scorer's own unit tests, and `cargo test` (the verification layer and the pipeline contract tests). The agent evals (`pnpm eval`) are **not** run in CI: they need a signed-in Claude Code or Codex and spend subscription usage. Run them locally before a release if any prompt changed.

## Server deploys

Pushes to `main` that touch `server/**` trigger [`deploy-server.yaml`](../.github/workflows/deploy-server.yaml), which typechecks the worker, applies D1 migrations to `grsp-db` and runs `wrangler deploy`. It needs the `CLOUDFLARE_API_TOKEN` secret, and `database_id` in `server/wrangler.toml` must be set to the real D1 database first.

## Bump scripts

`pnpm bump:patch` and `pnpm bump:minor` are thin wrappers around [`script/bump_version.sh`](../script/bump_version.sh). They exist so you don't have to remember the script path — bump, commit, tag, push, CI does the rest.

## Updating the changelog

See [`web/CHANGELOG-GUIDE.md`](../web/CHANGELOG-GUIDE.md). Add the new entry to [`web/app/changelog/data.ts`](../web/app/changelog/data.ts) before tagging so the landing page updates in the same release.

## Release checklist

- [ ] All work for the release is merged to `main`.
- [ ] Nightly QA build passed on the latest `main`.
- [ ] `pnpm eval` run locally if prompts or pipelines changed since the last release.
- [ ] Changelog entry added to [`web/app/changelog/data.ts`](../web/app/changelog/data.ts).
- [ ] Screenshot, if any, placed in [`web/public/changelog/`](../web/public/changelog/) using the `{version}-{slug}.png` convention.
- [ ] `pnpm bump:minor` (or `:patch`) committed and pushed.
- [ ] `v<version>` tag pushed.
- [ ] GitHub Release created by CI looks right (both DMGs, both `.app.tar.gz` + `.sig`, `latest.json` present).
