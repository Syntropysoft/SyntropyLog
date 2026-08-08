---
"syntropylog": patch
---

**Three masking/correctness fixes — one of them a failsafe-breaking crash.**

- **Fixed (critical) — a non-ASCII log value could crash the whole process.** The native Rust
  engine truncated over-long string values (`maxStringLength`, default 300 bytes) by slicing the
  string at a **byte** index without respecting the UTF-8 character boundary. A metadata value
  longer than 300 bytes whose multi-byte character (accents, emoji, CJK, cyrillic, percent-encoded
  URLs) straddled the cut point panicked, and the panic **aborted the Node process with `SIGABRT`**
  — not catchable by the JS `try/catch`, so it defeated the framework's core "logging can't crash
  your app" guarantee. Triggered by the documented, recommended usage
  (`log.info({ campo }, 'msg')`) on any app that logs multilingual content. `truncate` now walks the
  cut down to the nearest char boundary; regression-locked (`truncate_never_panics_on_multibyte`).

- **Fixed — masking no longer mutates the object you log.** `MaskingEngine.process` (the JS /
  fallback engine, used on any platform without the native binary, or for custom-function rules)
  recursively wrote masked values back into the **caller's own object**, so logging a structure with
  nested objects rewrote the caller's nested fields to `[REDACTED]` — a surprising side effect the
  JSDoc explicitly denied ("returns a new object"). It is now copy-on-write with a per-reference memo:
  never mutates the input, masks a shared sub-object once so every reference gets the same masked
  result (no leak on the second reference), and terminates on cycles.

- **Fixed (interim) — cross-tenant PII leak with two `createSyntropyLog()` instances.** The native
  engine kept masking config in a process-global `OnceCell`; a second independent instance with
  **different** masking rules had its `configureNative` silently ignored while `isNativeAddonInUse()`
  reported `true`, so it masked with the *first* instance's rules — redacting the wrong fields and
  emitting its own configured PII in cleartext. `configureNative` now returns `false` when a
  **different** config is already installed, so the divergent instance falls back to the JS pipeline
  and masks correctly with its own rules. This is the interim guard; the full fix (per-instance
  native config) is tracked separately.
