# Release checklist — v0.12.3 → main

Version already updated in the repo (package.json and CHANGELOG). Steps to integrate into `main` and publish.

## Before pushing to main

- [ ] **Unit tests:** `pnpm test -- --run`
- [ ] **Integration tests:** `pnpm run test:integration`
- [ ] **Build:** `pnpm run build`
- [ ] Ensure there are no uncommitted changes in files that should not be committed (`.gitignore`)

## Files for version 0.12.3

- `package.json` — `"version": "0.12.3"`
- `CHANGELOG.md` — 0.12.3 entry (SECURITY.md doc for yaml package alerts)
- `SECURITY.md` — Supported Versions updated (0.12.x), paragraphs on yaml (URLs, behavioral)

## Integrate into main

1. **Commit** all release changes:
   ```bash
   git add package.json CHANGELOG.md SECURITY.md
   git status
   git commit -m "chore(release): 0.12.3 — SECURITY.md doc for yaml package alerts"
   ```
   Optional: include `RELEASE_0.12.3.md` if you want to keep it in the repo.

2. **Push to main** (or merge your branch into main and then push):
   ```bash
   git push origin main
   ```
   If you use a release branch:
   ```bash
   git checkout main
   git merge your-release-branch
   git push origin main
   ```

3. **CI:** The Release workflow (on push to main) will build the addon and publish to npm according to your configuration.

4. **Optional tag:**
   ```bash
   git tag -a v0.12.3 -m "Release 0.12.3"
   git push origin v0.12.3
   ```

## After publishing

- [ ] Verify on npm that `syntropylog@0.12.3` exists.
