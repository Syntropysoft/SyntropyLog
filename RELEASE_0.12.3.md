# Release checklist — v0.12.3 → main

Versión ya actualizada en el repo (package.json y CHANGELOG). Pasos para integrar a `main` y publicar.

## Antes de pushear a main

- [ ] **Tests unitarios:** `pnpm test -- --run`
- [ ] **Tests de integración:** `pnpm run test:integration`
- [ ] **Build:** `pnpm run build`
- [ ] Revisar que no queden cambios sin commitear en archivos que no deben subirse (`.gitignore`)

## Archivos de la versión 0.12.3

- `package.json` — `"version": "0.12.3"`
- `CHANGELOG.md` — entrada 0.12.3 (SECURITY.md doc para alertas del paquete yaml)
- `SECURITY.md` — Supported Versions actualizado (0.12.x), párrafos sobre yaml (URLs, behavioral)

## Integrar a main

1. **Commit** de todos los cambios de la release:
   ```bash
   git add package.json CHANGELOG.md SECURITY.md
   git status
   git commit -m "chore(release): 0.12.3 — SECURITY.md doc for yaml package alerts"
   ```
   Opcional: incluir `RELEASE_0.12.3.md` si quieres dejarlo en el repo.

2. **Push a main** (o mergear tu rama a main y luego push):
   ```bash
   git push origin main
   ```
   Si usas rama de release:
   ```bash
   git checkout main
   git merge your-release-branch
   git push origin main
   ```

3. **CI:** El workflow de Release (en push a main) hará build del addon y publicará a npm según tu configuración.

4. **Tag opcional:**
   ```bash
   git tag -a v0.12.3 -m "Release 0.12.3"
   git push origin v0.12.3
   ```

## Después de publicar

- [ ] Comprobar en npm que `syntropylog@0.12.3` existe.
