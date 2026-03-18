# Release checklist — v0.12.4 → main

Versión actualizada por changeset (package.json 0.12.4, CHANGELOG). Pasos para integrar a `main` y publicar.

## Antes de pushear a main

- [ ] **Tests unitarios:** `pnpm test -- --run`
- [ ] **Tests de integración:** `pnpm run test:integration`
- [ ] **Build:** `pnpm run build`
- [ ] Revisar que no queden cambios sin commitear en archivos que no deben subirse (`.gitignore`)

## Archivos de la versión 0.12.4

- `package.json` — `"version": "0.12.4"`
- `CHANGELOG.md` — entrada 0.12.4 (CI + native patch index.js/index.mjs, SECURITY.md fs/ESM, ESLint ignore scripts)
- `SECURITY.md` — fs module, native ESM index.mjs
- `.github/workflows/*.yml` — build addon con `pnpm run build` (patch corre siempre)
- `syntropylog-native/scripts/patch-index-no-shell.js` — parche de index.mjs (static require)
- `eslint.config.js` — ignore syntropylog-native/scripts

## Integrar a main

1. **Push** (tras este commit):
   ```bash
   git push origin <tu-rama>
   ```
   Luego merge a main y push, o push directo a main.

2. **CI:** Release workflow hará build del addon (con patch) y publicará a npm según configuración.

3. **Tag opcional:**
   ```bash
   git tag -a v0.12.4 -m "Release 0.12.4"
   git push origin v0.12.4
   ```

## Después de publicar

- [ ] Comprobar en npm que `syntropylog@0.12.4` existe.
