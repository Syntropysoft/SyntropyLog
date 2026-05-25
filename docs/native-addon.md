# Native Addon (Rust)

An optional Rust addon performs **serialize + mask + sanitize in a single pass**, avoiding the multiple object walks the JS pipeline needs. The addon is loaded automatically when available; if it cannot be loaded (unsupported platform, packaging issue, version mismatch) the JS pipeline runs transparently — no configuration, no failure.

---

## What it covers

The Rust pipeline performs, in order, in one traversal:

1. Recursive serialization (with circular-reference detection and depth limiting).
2. Masking of sensitive keys (the same rule set as the JS engine).
3. Sanitization — strips control characters and ANSI escapes from string values.

The output is the same canonical log entry the JS pipeline produces, so transports, hooks, and the Logging Matrix do not need to know which path executed.

---

## Installation

```bash
npm install syntropylog
```

Prebuilt addons for Linux, macOS, and Windows on Node ≥20 are pulled in as an optional dependency. If your platform has no prebuilt binary or your installer can't fetch it, the JS pipeline is used and nothing else changes.

---

## Checking which pipeline is active

```typescript
if (syntropyLog.isNativeAddonInUse()) {
  // Rust pipeline active
}
```

Useful for emitting a startup banner, a metric label, or a health-check field.

---

## Forcing the JS pipeline

Set the environment variable before the process starts:

```bash
SYNTROPYLOG_NATIVE_DISABLE=1 node app.js
```

Typical reasons:

- Debugging serialization edge cases against the JS implementation.
- Comparing performance.
- Working around a suspected addon issue in production while a fix ships.

---

## When the addon is loaded but a single call fails

If the native pipeline cannot process a specific log entry (very rare — typically caused by exotic types that bypass type checking), the JS pipeline is used **for that call only**. The `onSerializationFallback` hook fires so you can track frequency:

```typescript
await syntropyLog.init({
  /* … */
  onSerializationFallback: (reason) => metrics.increment('serialization_fallback'),
});
```

See [lifecycle.md](lifecycle.md#observability-hooks).

---

## Building from source

The addon lives in `syntropylog-native/` as a workspace package using `napi-rs`. Build instructions for Linux/macOS/Windows are in [doc-es/building-native-addon.es.md](../doc-es/building-native-addon.es.md) (Spanish).
