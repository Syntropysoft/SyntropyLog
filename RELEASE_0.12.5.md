# Release checklist — v0.12.5 → main

Version updated via changeset (package.json 0.12.5, CHANGELOG). Steps to integrate into `main` and publish.

## Before pushing to main

- [ ] **Unit tests:** `pnpm test -- --run`
- [ ] **Integration tests:** `pnpm run test:integration`
- [ ] **Build:** `pnpm run build`
- [ ] Ensure there are no uncommitted changes in files that should not be committed (`.gitignore`)

## Files for version 0.12.5

- `package.json` — `"version": "0.12.5"`
- `CHANGELOG.md` — 0.12.5 entry (remove yaml, loadLoggerConfig; config via init() only; breaking note)
- `SECURITY.md` — no YAML/loadLoggerConfig; fs only for syntropylog-native; config via init()
- `README.md` — no loadLoggerConfig in Filesystem access section
- `pnpm-lock.yaml` — yaml dependency removed

## Integrate into main

1. **Push** (after this commit):
   ```bash
   git push origin <your-branch>
   ```
   Then merge into main and push, or push directly to main.

2. **CI:** The Release workflow will build the addon (with patch) and publish to npm according to your configuration.

3. **Optional tag:**
   ```bash
   git tag -a v0.12.5 -m "Release 0.12.5"
   git push origin v0.12.5
   ```

## After publishing

- [ ] Verify on npm that `syntropylog@0.12.5` exists.
