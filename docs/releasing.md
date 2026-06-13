# Releasing

Runbook for cutting a release. Written for the **1.0.0 stable** promotion, but
the steps generalize.

## What's already prepared for 1.0.0

- `CHANGELOG.md` has a hand-written `## 1.0.0` entry.
- `.changeset/fuzzy-sites-repeat.md` bumps both `syntropylog` and
  `syntropylog-native` as **major** (from `1.0.0-rc.3` this resolves to `1.0.0`;
  `syntropylog-native` `0.1.1` → `1.0.0`).
- The public API surface is locked by tests (`tests/public-api-surface.test.ts`).
- The native build matrix produces 7 prebuilt targets (see `docs/stability.md`).

## Pre-flight (must be green)

```bash
npm run build
npm run lint
npm run test:coverage   # thresholds: lines 90 / branches 75
```

`npm run check:deps` reports the napi per-platform packages as "missing" and some
devDeps as "unused" — both are known false positives, not failures.

## How publishing works (automated)

The repo is wired for a **hands-off release via changesets** on push to `main`
(`.github/workflows/release.yml`). Two things are already baked in so you don't
touch them at release time:

- **dist-tag → `latest`.** The workflow publishes with `npm run release:stable`
  (`changeset publish`, no `--tag`), so stable releases land on `latest`. (The
  separate `release` script still uses `--tag next` if you ever cut an RC.)
- **CHANGELOG is yours.** `.changeset/config.json` sets `"changelog": false`, so
  the Version PR only bumps versions — it never generates or overwrites a
  CHANGELOG entry. The hand-written `## 1.0.0` block is authoritative.

**The native addon is published by CI, not a laptop.** `syntropylog-native` ships
prebuilt `.node` files for all 7 targets, cross-compiled in the `build-addon`
matrix (zig). A local publish would only include the host's binary.

### The flow

1. **Merge `develop` → `main`.** `build-addon` cross-compiles all 7 native
   targets; `changesets/action` sees the pending changeset and opens a **"Version
   Packages" PR** (bumps `syntropylog` and `syntropylog-native` to `1.0.0`,
   deletes the changeset). It does **not** publish yet.
2. **Review + merge the "Version Packages" PR.** This is the only checkpoint —
   confirm the version bump looks right. Merging it triggers the publish: the
   `release` job merges the 7 prebuilt `.node` into `syntropylog-native/` and runs
   `release:stable` → `syntropylog@1.0.0` + `syntropylog-native@1.0.0` to `latest`,
   with npm provenance.

So: two merges (your feature/`develop`→`main`, then the auto Version PR). No npm
commands by hand, correct dist-tag, no CHANGELOG conflicts.

## Post-release checks

```bash
npm view syntropylog dist-tags          # latest should be 1.0.0
npm view syntropylog-native version     # 1.0.0
```

- Confirm a fresh install on Linux arm64 (Graviton) and Alpine/musl resolves a
  native `.node` (no JS-fallback log line) — that's the new server coverage.
- Tag the release in git and write the GitHub release notes from the CHANGELOG.
