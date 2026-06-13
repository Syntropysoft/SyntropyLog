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

## Two things to know before publishing 1.0.0

### 1. dist-tag — stable must go to `latest`, not `next`

The default `release` script publishes with `--tag next` (correct for RCs, wrong
for stable). For the stable promotion use **`release:stable`** instead, which
publishes to `latest`:

```jsonc
// package.json
"release":        "npm run build && changeset publish --tag next",  // RC
"release:stable": "npm run build && changeset publish",             // stable → latest
```

When releasing 1.0.0 via CI, point the workflow's publish step at it:

```yaml
# .github/workflows/release.yml → release job → changesets/action
publish: npm run release:stable
```

(Not changed automatically — flip it deliberately when you cut 1.0.0.)

### 2. The native addon must be published by CI

`syntropylog-native` ships prebuilt `.node` files for all 7 targets. Those are
**cross-compiled in CI** (`release.yml` build-addon matrix → zig). A local
publish would only include the host's binary. So the native package must go
through the CI release path, not a laptop.

## Publishing

The repo is wired for **changesets via CI** (`.github/workflows/release.yml`,
triggered on push to `main`):

1. Merge `develop` → `main`.
2. `build-addon` cross-compiles all 7 native targets and uploads them; the
   `release` job merges them into `syntropylog-native/` before publishing.
3. `changesets/action` runs `version-packages` (`changeset version`) — this bumps
   the versions and **prepends a generated stub to `CHANGELOG.md`**. Since the
   `## 1.0.0` entry is already hand-written, **delete the generated stub** so it
   isn't duplicated (do this in the "Version Packages" PR before merging).
4. Merging the "Version Packages" PR runs the publish step (`release:stable` per
   §1) → `syntropylog@1.0.0` and `syntropylog-native@1.0.0` to the `latest` tag.

## Post-release checks

```bash
npm view syntropylog dist-tags          # latest should be 1.0.0
npm view syntropylog-native version     # 1.0.0
```

- Confirm a fresh install on Linux arm64 (Graviton) and Alpine/musl resolves a
  native `.node` (no JS-fallback log line) — that's the new server coverage.
- Tag the release in git and write the GitHub release notes from the CHANGELOG.
