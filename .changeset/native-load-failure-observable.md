---
"syntropylog": patch
---

**The optional-addon contract is now explicit, observable — and executed in CI.** When `require('syntropylog-native')` failed at first use, the manager silently fell back to the JS pipeline — correct behavior, but invisible: an operator on a platform without the optional binary (or with a broken one) had no way to learn *why* the native engine wasn't active. The load-failure path now fires `onSerializationFallback` once (the result is cached), distinguishing the two cases: `not installed (optional dependency)` — the supported state on unsupported platforms or `--omit=optional` installs — versus `failed to load: <detail>` for a present-but-unloadable binary (the one worth alerting on). Every other fallback path (config rejected, JS-only rule, runtime error) already reported; this closes the last silent branch. The fallback behavior itself is unchanged, and `getStats().nativeAddonActive` still reflects the outcome.

Both halves of the contract are now asserted by a CI job on a real Alpine (musl) container against the packed tarballs: the cross-compiled musl binary must actually **load** (building proves it links, not that it loads), and a no-addon install must produce the **same masked output** while reporting the fallback.
