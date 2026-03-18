# syntropylog-native

Native Rust addon for SyntropyLog (fast serialization + masking). Phase 0: build and Node↔Rust linking validation.

**Runtime:** No subprocess or shell execution. The loader only uses `fs.existsSync` / `fs.readFileSync` and `process.env.PATH` (Linux musl detection). See main package SECURITY.md. After `napi build`, `scripts/patch-index-no-shell.js` runs to replace the default NAPI-RS template’s `execSync('which ldd')` with a safe `resolveLddPathWithoutShell()` so the published `index.js` never uses the shell.

## Requirements

- Node ≥18
- Rust (rustup) and target for your platform (e.g. `x86_64-pc-windows-msvc` on Windows)

## Build (from this folder)

```bash
pnpm run build
```

This runs `napi build --platform --release` and then the post-build patch (index.js + index.mjs). From the repo root (with `@napi-rs/cli` in devDependencies):

```bash
cd syntropylog-native && pnpm run build
```

## Test

After building:

```bash
node test-node.mjs
```

Expected output: `OK syntropylog-native: pong`.

## Build in CI (Windows, Linux, macOS)

The workflow [../.github/workflows/build-native.yml](../.github/workflows/build-native.yml) builds the addon on all three systems. Each push/PR to `main` or `develop` runs the matrix; the **Merge platform artifacts** job produces a `syntropylog-native-all-platforms` artifact with all `.node` files plus `index.js` and `index.d.ts` ready to publish or package.

## Current phase

- **Phase 0**: `ping()` — build and linking validated on Windows.
- **Phase 1**: implement `fast_serialize(entry, config)` per [../docs/rust_phase0_design.md](../docs/rust_phase0_design.md).
