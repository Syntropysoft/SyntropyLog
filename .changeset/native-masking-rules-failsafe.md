---
"syntropylog": minor
"syntropylog-native": minor
---

**Masking parity fix (security → PII leak closed).** The native Rust engine (the default) gated *all* masking on the internal `sanitize` switch, which is derived from `enableDefaultRules`. So `{ enableDefaultRules: false, rules: [...getDefaultMaskingRules()] }` — turning the built-in defaults off and re-adding them (or any custom rules) — left the native engine masking **nothing**, leaking PII in cleartext, while the pure-JS fallback masked correctly. The two engines ran on different effective behavior.

Fixed by honoring explicit masking rules **unconditionally** in the native engine: `resolve_key_action` now matches the rule set before consulting `sanitize`, mirroring the JS `MaskingEngine`, which has no such switch. `sanitize` continues to gate only the legacy `sensitiveFields` net. An explicit rule can no longer be silently dropped by the master switch — no more colander. Requires the re-released native addon; verified byte-for-byte parity between the native and JS engines for this config.
