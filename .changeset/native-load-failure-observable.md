---
"syntropylog": patch
---

fix(serialization): report native addon load failures through `onSerializationFallback`

When `require('syntropylog-native')` failed at first use, the manager silently fell back to the JS pipeline — correct behavior, but invisible: an operator on a platform without the optional binary (or with a broken one) had no way to learn *why* the native engine wasn't active. The load-failure path now fires `onSerializationFallback` once (the result is cached), distinguishing the two cases: `not installed (optional dependency)` — the supported state on unsupported platforms or `--omit=optional` installs — versus `failed to load: <detail>` for a present-but-unloadable binary. Every other fallback path (config rejected, JS-only rule, runtime error) already reported; this closes the one silent branch. Behavior of the fallback itself is unchanged, and `getStats().nativeAddonActive` still reflects the outcome.
