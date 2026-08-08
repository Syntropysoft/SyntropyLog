# syntropylog-native

## 1.4.1

Version realigned with the `syntropylog` package (previous published binary was 1.3.0; the
changelog had not been kept in step).

### Fixed

- **UTF-8-safe truncation — a non-ASCII log value no longer crashes the process.** `truncate` sliced over-long string values (`maxStringLength`, default 300 bytes) at a raw **byte** index, so a multi-byte character (accents, emoji, CJK, cyrillic, percent-encoded URLs) straddling the cut point panicked and **aborted the Node process with `SIGABRT`** — not catchable from the JS side, defeating the "logging can't crash your app" guarantee. It now walks the cut down to the nearest UTF-8 character boundary; the result is always valid UTF-8 and never panics. Regression-locked (`truncate_never_panics_on_multibyte`, `mask_value_multibyte_long_value_does_not_panic`).
- **Per-instance masking-config guard — no cross-tenant rule bleed.** The masking config lives in a process-global `OnceCell`; `configureNative` now returns `false` when a *different* config is already installed (instead of silently ignoring it and reporting success). A second SyntropyLog instance configured with different rules then falls back to the JS engine and masks with its own rules, rather than inheriting the first instance's. Interim guard; the definitive per-instance native config is tracked separately.

## 0.1.1

### Patch Changes

- Remove `execSync('which ldd')` from index.js; use `resolveLddPathWithoutShell()` (PATH + fs.existsSync only). Fixes Socket.dev medium (shell) and low (fs) alerts in published package.
