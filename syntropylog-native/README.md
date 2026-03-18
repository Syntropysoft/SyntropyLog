# syntropylog-native

Addon nativo en Rust para SyntropyLog (serialización rápida + masking). Fase 0: validación de compilación y enlace Node↔Rust.

**Runtime:** No subprocess or shell execution. The loader only uses `fs.existsSync` / `fs.readFileSync` and `process.env.PATH` (Linux musl detection). See main package SECURITY.md. After `napi build`, `scripts/patch-index-no-shell.js` runs to replace the default NAPI-RS template’s `execSync('which ldd')` with a safe `resolveLddPath()` so the published `index.js` never uses the shell.

## Requisitos

- Node ≥18
- Rust (rustup) y target para tu plataforma (p. ej. `x86_64-pc-windows-msvc` en Windows)

## Build (desde esta carpeta)

```bash
pnpm exec napi build --platform --release
```

Desde la raíz del repo (con `@napi-rs/cli` en devDependencies):

```bash
cd syntropylog-native && pnpm exec napi build --platform --release
```

## Test

Tras el build:

```bash
node test-node.mjs
```

Debe imprimir: `OK syntropylog-native: pong`.

## Build en CI (Windows, Linux, macOS)

El workflow [../.github/workflows/build-native.yml](../.github/workflows/build-native.yml) compila el addon en los tres sistemas. Cada push/PR a `main` o `develop` ejecuta la matriz; el job **Merge platform artifacts** deja un artefacto `syntropylog-native-all-platforms` con todos los `.node` + `index.js` + `index.d.ts` listos para publicar o empaquetar.

## Fase actual

- **Fase 0**: `ping()` — compilación y enlace validados en Windows.
- **Fase 1**: implementar `fast_serialize(entry, config)` según [../docs/rust_phase0_design.md](../docs/rust_phase0_design.md).
