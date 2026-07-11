---
"syntropylog": patch
---

**Perf: masking in the JS fallback path is 2.4x faster (442 → 183 ns/op) via a bounded per-key-name decision cache.** Field *names* repeat across log entries while values change, yet every key was re-scanned against every rule on every log — and the catch-all rule is a wide alternation that ran on every non-sensitive field. The engine now caches the *decision* (key name → matched rule, or "no rule"), never the value, so repeat keys skip the scan entirely. Family fix: found by the Java port's JMH suite (same structure, 4,497→1,187 ns/op there), applied here and scheduled for the Python sibling.

Safety properties, all preserved:

- **Bounded (cap 4096):** hostile payloads generating unique key names per log cannot grow memory — past the cap, new keys still mask correctly, they just pay the scan uncached.
- **Invalidated on `addRule()`:** a key cached as "no rule matched" is re-evaluated when a rule is added later.
- **Deterministic by design:** the decision depends only on the key name and the rule set — masked output is byte-for-byte identical (shared parity fixture still green).
- Works at any depth (nested keys are cached too) and is cleared on `shutdown()`.

`getStats()` now reports `decisionCacheSize`. The native Rust engine is unaffected (it was never the bottleneck); this closes the gap for custom-JS-function rules and platforms without the addon.
