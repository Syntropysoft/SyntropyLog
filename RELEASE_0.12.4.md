# Release checklist — v0.12.4 → main

Version updated via changeset (package.json 0.12.4, CHANGELOG). Steps to integrate into `main` and publish.

## Before pushing to main

- [ ] **Unit tests:** `pnpm test -- --run`
- [ ] **Integration tests:** `pnpm run test:integration`
- [ ] **Build:** `pnpm run build`
- [ ] Ensure there are no uncommitted changes in files that should not be committed (`.gitignore`)

## Files for version 0.12.4

- `package.json` — `"version": "0.12.4"`
- `CHANGELOG.md` — 0.12.4 entry (CI + native patch index.js/index.mjs, SECURITY.md fs/ESM, ESLint ignore scripts)
- `SECURITY.md` — fs module, native ESM index.mjs
- `.github/workflows/*.yml` — addon build with `pnpm run build` (patch always runs)
- `syntropylog-native/scripts/patch-index-no-shell.js` — index.mjs patch (static require)
- `eslint.config.js` — ignore syntropylog-native/scripts

## Integrate into main

1. **Push** (after this commit):
   ```bash
   git push origin <your-branch>
   ```
   Then merge into main and push, or push directly to main.

2. **CI:** The Release workflow will build the addon (with patch) and publish to npm according to your configuration.

3. **Optional tag:**
   ```bash
   git tag -a v0.12.4 -m "Release 0.12.4"
   git push origin v0.12.4
   ```

## After publishing

- [ ] Verify on npm that `syntropylog@0.12.4` exists.
