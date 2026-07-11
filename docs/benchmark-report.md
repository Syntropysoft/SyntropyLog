# SyntropyLog — Benchmark Report

**Source:** output of `pnpm run bench:memory` (`NODE_OPTIONS=--expose-gc`).
**Date:** 2026-07-11 (1.4.0). **Native addon (Rust):** yes (M2, GH).

Environments captured so the results read as cross-platform rather than single-box:

| Label | Machine | OS / environment | Runtime |
|-------|---------|------------------|---------|
| **M2** | MacBook Pro (Apple M2) | macOS (native) | Node v20.20.1 (arm64-darwin) |
| **GH** | AMD EPYC 7763 | **GitHub Actions CI (Ubuntu)** | Node v20.20.2 (x64-linux) |

> **On the environments.** Only **M2** is bare-metal native and is the **reliable reference**. **GH** is a shared, virtualized CI runner — a useful x64-Linux data point, but **noisy** for both tail latency (§3.2) and memory (§4) this cycle. Treat GH as conservative, not the hardware's ceiling. A **WSL2/AMD** column will be added when that box is re-measured for 1.4.0 — it is left out here rather than shown with numbers we didn't take this cycle.

All times in **microseconds (µs)**; throughput group = 5,000 iterations, memory = 100,000 iterations. Lower is better. The `M2` / `GH` headers in the tables below refer to the machines above.

> **What changed since the 2026-05-30 report.** Two honest deltas: (1) the **complex-object full pipeline is slower** than the May figures (M2 6.85 vs 5.00 µs) — not a regression in the decision-cache work, but the **masking refactor** (1.1→1.3: canonical `MaskSpec` + the native engine now honoring *every* rule including the secret-key catch-all) doing more work per call; (2) the GH memory column is noisier this run. The **decision-cache perf fix (1.4.0)** speeds up the **pure-JS masking fallback** (see §3.3), which is a different path from the Rust-addon pipeline measured in §3.2.

---

## 1. This is not a 1:1 comparison

Pino and Winston are **loggers**. SyntropyLog is an **observability and compliance pipeline** that, on *every* call, does what those need plugins or hand-written code to do. The real question is not "who writes a plain string fastest" — it is "what does compliance-grade logging cost", and the answer is: **roughly a bare logger for simple logs, ~3× a bare Pino once masking runs.**

| Capability (out of the box) | SyntropyLog | Pino | Winston |
|---|:---:|:---:|:---:|
| Structured JSON | ✅ | ✅ | ✅ |
| Masking / PII redaction | ✅ | ❌ (plugin) | ❌ |
| Logging Matrix (fields allowed per level) | ✅ | ❌ | ❌ |
| Retention / audit routing | ✅ | ❌ | ❌ |
| Context propagation (AsyncLocalStorage) | ✅ | ❌ (manual) | ❌ |
| Sanitization / log-injection defense | ✅ | ❌ | ❌ |
| Prototype-pollution defense | ✅ | ❌ | ❌ |
| Native single-pass addon (Rust) | ✅ | ❌ | ❌ |

Every number below is SyntropyLog running that **full stack** — not a trimmed-down logger.

---

## 2. Executive Summary

| Scenario | SyntropyLog | vs Pino | vs Winston |
|----------|-------------|---------|------------|
| **Simple log (JSON)** | 0.99 (M2) / 1.70 (GH) µs | **faster** on both machines this run (x64 margin within CI noise) | **faster** on both |
| **Complex object (full pipeline)** | 6.85 (M2) / 12.71 (GH) µs | *reference only* — Pino doesn't mask (~3× a bare Pino) | *reference only* — Winston doesn't mask |
| **Fluent API (`withRetention`)** | 8.34 (M2) / 12.13 (GH) µs | — | — |
| **Memory (simple JSON)** | ~182 bytes/op (M2, stable) | **on par** with Pino (~152) | ~5× lower (Winston ~997) |

**Headline:** on **simple JSON** SyntropyLog is **competitive-to-faster than a bare logger while doing far more on every call** — fastest of the three on M2, and ahead on this GH run (though the x64 margin is within CI noise; historically a bare Pino is competitive on plain-string x64). Once the **masking pipeline** runs on a complex object, the full stack costs **~3× a bare Pino** — that multiple *is* the redaction, matrix, sanitization and context work the others don't do. On memory it is **on par with Pino** (~182 bytes/op on the stable M2 reference) and ~5× below Winston.

---

## 3. Throughput (average time per iteration)

> **Read these as "what the full pipeline costs", not "who logs a string fastest".** Pino and Winston only format and write. Every SyntropyLog number below *also* runs masking, matrix filtering, sanitization, and the context pipeline (see §1). This is not a like-for-like race — the takeaway is what the full safety pipeline costs, not the exact margin on any one box.

### 3.1 Simple Message (Logging Throughput)

| Library | M2 | M2 p99 | GH | GH p99 |
|---------|----|--------|----|--------|
| console.log (baseline) | 0.19 | 2.57 | 0.37 | 8.55 |
| **SyntropyLog (JSON)** | **0.99** | 3.06 | **1.70** | 3.72 |
| Pino | 1.50 | 5.21 | 2.18 | 4.98 |
| Winston | 1.32 | 2.25 | 2.55 | 7.98 |

- SyntropyLog is **fastest of the three on M2** (0.99 µs) and led on this GH run (1.70 vs Pino 2.18). **Do not over-read the x64 lead:** the shared CI runner is noisy and Pino's tail (p99 4.98, plus a 1.4 ms max) swung its average up this run — historically a bare Pino is competitive-to-faster on plain-string x64. The reliable claim is *competitive*, not *decisively faster*, on x64.
- SyntropyLog is **faster than Winston** on both machines measured.

### 3.2 Complex Object — full pipeline cost (not a comparison)

| Library | M2 | GH | Masking |
|---------|----|----|---------|
| Pino (complex object) | 2.19 | 4.23 | ❌ |
| Winston (complex object) | 6.64 | 8.81 | ❌ |
| **SyntropyLog (with masking)** | **6.85** | **12.71** | ✅ |

- **Not a comparison — a reference.** SyntropyLog masks, filters by matrix, sanitizes and reads context here; Pino and Winston only serialize. Their numbers size what the full pipeline costs — the full stack runs at **~3× a bare Pino** on both machines (M2 6.85/2.19, GH 12.71/4.23). That delta *is* the work they skip.
- **This is slower than the May report (M2 5.00 µs).** The cause is the masking refactor (1.1→1.3), not a regression: the native engine now applies the canonical `MaskSpec` for **every** rule, including the wide secret-key catch-all, so each complex object does more masking work. Honest trade: more correct/complete redaction, measurably more cost. Reducing it is the top item in §6.
- Next to Winston (which also doesn't mask), the full pipeline is **roughly tied on M2** (6.85 vs 6.64) and **slower on the noisy GH run** (12.71 vs 8.81). Winston's complex numbers are highly variable (M2 p99 spiked to ~49 µs), so treat the Winston column as indicative.

> **⚠️ CI noise — do not over-read the GH complex column.** The shared GitHub EPYC box gives wildly different complex/tail numbers run-to-run with no code change. The reliable signal across environments: SyntropyLog's complex masking path costs **~3× a bare Pino** on quiet hardware (M2). The GH figures are from the latest run; treat them as indicative only.

### 3.2.1 Where that cost goes — Rust vs JS (pipeline decomposition)

> **Not re-measured for 1.4.0 — numbers pending.** The native-path decomposition (how much of the complex-object cost is the Rust engine doing serialize + mask + sanitize vs the JS framework around it) lives in the examples-repo `17-benchmark`, not this harness, and was not captured this cycle. Rather than repeat stale figures, this section is left as a placeholder to fill when it's re-run against 1.4.0.

What the fresh numbers here *do* support qualitatively: isolated masking (§3.3, M2 2.02 µs) plus serialization account for the bulk of the complex-object cost (§3.2, M2 6.85 µs), and the JS framework layer around the Rust addon is thin. The gap to a bare Pino in §3.2 is the redaction/sanitization work the others don't do, not a tax the framework adds on top — but the exact per-layer split will be quoted only once re-measured.

### 3.3 MaskingEngine only (complex object) — where the 1.4.0 fix lands

| Benchmark | M2 | GH |
|-----------|----|----|
| MaskingEngine.process(complexObj) | 2.02 | 3.52 |

Isolated masking cost, useful as the p99/p999 baseline for the complex-object group. **This is the pure-JS engine** (no addon), so it is exactly where the **1.4.0 decision-cache fix** shows: on the same GH runner this dropped from **4.92 → 3.52 µs (~1.4×)** between the pre-fix and post-fix commits, matching the M2 result. Platforms without the native addon (unsupported arches, or rules using a custom JS mask function) run entirely on this path and get the full benefit.

### 3.4 Fluent API (withRetention + complex JSON)

| Benchmark | M2 | GH |
|-----------|----|----|
| SyntropyLog (withRetention complex) | 8.34 | 12.13 |

Creates a retention-bound child logger + one log per iteration. For a call that binds compliance metadata, sanitizes it, and routes it through the executor, this is negligible in any real application. On a hot path, reuse a single `withRetention(...)` logger instead of creating one per call.

---

## 4. Memory (heap delta per 100,000 iterations, bytes/op)

Obtained with **`pnpm run bench:memory`** (Node with `--expose-gc`).

| Benchmark | M2 (stable) | GH (noisy this run) |
|-----------|------------:|--------------------:|
| console.log (baseline) | 147.74 | 145.12 |
| SyntropyLog (JSON) | 181.62 | 237.65 |
| Pino | 151.92 | 154.93 |
| Winston | 996.62 | 974.83 |
| SyntropyLog (with masking) | 223.49 | 163.75 |
| Pino (complex object) | 120.23 | 120.16 |
| Winston (complex object) | 2,291.71 | 2,647.11 |
| SyntropyLog (withRetention complex) | 254.40 | 189.65 |

> **⚠️ Two caveats on reading these numbers.**
> 1. **`heap delta` only sees the V8 heap.** With the native addon active, masking + serialization allocate in **Rust's** heap, which `--expose-gc` cannot observe. So a line like GH "with masking" at 163 bytes/op is **not** "masking is nearly free" — it means much of that work's allocation happened off the V8 heap. The V8-side figure is a *floor*, not the full footprint.
> 2. **The GH column was noisy this run.** GH "SyntropyLog (JSON)" reads 237 bytes/op vs the stable M2 181, and "with masking" 163 (below its own JSON line) — internally inconsistent. **Use the M2 column as the reference;** GH memory is shown only for cross-platform context.

- SyntropyLog (JSON): **~182 bytes/op (M2, stable)** — **on par with Pino** (152), well under Winston.
- With masking / retention (M2): **~223–254 bytes/op** (V8-heap floor; see caveat 1).
- Winston: **~997 bytes/op** simple and **~2,292 bytes/op** complex — ~5× / ~10× the others.
- For a logger that ships masking, retention, matrix and structured context by default, an ~182 bytes/op V8 floor on par with a bare Pino is an excellent footprint.

---

## 5. Conclusions

- **Not a like-for-like comparison — and that's the point.** SyntropyLog runs masking, matrix, sanitization, context and audit routing on every call; Pino and Winston do not. The numbers show what the **full safety pipeline costs**, not a string-formatting race.
- **Throughput (simple):** fastest of the three on M2; competitive on x64 (this GH run led, but the margin is within CI noise); always ahead of Winston — while doing strictly more on every call.
- **Complex / masking:** **~3× a bare Pino** (the redaction cost), up from ~2.3× in May because the masking refactor now applies every rule in the native engine. Reducing this is the top improvement item.
- **Memory:** on par with Pino (~182 bytes/op on the stable M2 reference), ~5–10× below Winston — remembering the V8-only caveat (§4).
- **Positioning:** for a logger that ships JSON, masking, context, and security **by default**, there is no rival in the same category. Pino is leaner but redacts nothing out of the box; Winston is much heavier and slower without the same ready-to-use package.

---

## 6. Improvement Opportunities (prioritized)

### 6.1 High Impact

1. **Bring the complex-object masking cost back down.** The 1.1→1.3 refactor traded speed for completeness (every rule now runs in the native engine, incl. the wide catch-all). Profile the native serialize + mask path for the common case; the **per-key decision-cache that landed in the JS engine (1.4.0) is the obvious candidate to port into the Rust engine** — the same "field names repeat, cache the rule decision" insight applies there.

### 6.2 Medium Impact

1. **Fluent API cost (`withRetention`)** — 8.3–12.1 µs/iter includes creating a child logger every time. Encourage reusing a retention-bound logger rather than creating it per call; or reduce the cost of binding loggers (deferred context, fewer copies).

### 6.3 Lower Priority / Validation

1. **Re-measure the AMD/WSL2 column and the §3.2.1 native decomposition against 1.4.0.** This cycle only M2 (native) and GH (CI) were captured; both x64 non-CI and the Rust-vs-JS breakdown are pending.
2. **Get a bare-metal Linux number.** Both x64 data points are virtualized (WSL2, CI). A dedicated bare-metal Linux box would settle the x64 throughput question without CI noise.
3. **"With masking" vs explicit "without masking"** — add a SyntropyLog "complex object without masking" benchmark to separate serialization cost from masking cost.

---

## 7. Scope and Interpretation of Results

Benchmarks were run across several iteration ranges (e.g. 5k, 100k, 1M and 10M) to evaluate throughput and memory under different loads. The figures in this report correspond to runs where results were stable and comparable across libraries.

**Representative loads.** Ranges from a few thousand up to around a million log events per run align with the volume typically seen in Node.js applications: bounded by request lifecycles, deployment units (e.g. a single POD), and normal operating conditions. Within these ranges, SyntropyLog shows stable throughput and memory behavior, with no observed performance issues under the tested conditions.

**Very high iteration counts.** With significantly larger counts (e.g. 10M+), some variation and degradation was observed in average and tail latency. That sustained load in a single process is not representative of typical Node.js or single-POD usage in production; in practice, log volume is spread over time, across instances, and across processes. Therefore, these results do not indicate a practical limitation in typical deployment scenarios.

---

## 8. High-Demand Environments

SyntropyLog is designed for **high-demand** and regulated environments. The figures in this report (throughput, tail latency, memory) are obtained with the **full stack** active — not a trimmed-down logger. That stack includes:

- **Native addon (Rust)** — single-pass serialize + mask + sanitize; ANSI strip in metadata.
- **Logging Matrix** — declarative control of which context fields appear per level (lean on `info`, full on `error`).
- **Universal Adapter** (and **AdapterTransport**) — send logs to any backend (PostgreSQL, MongoDB, Elasticsearch, S3) with a single `executor`; no vendor lock-in.
- **MaskingEngine** — built-in and custom rules; sensitive fields never leave the pipeline.
- **Serialization pipeline** — circular references, configurable depth limit, timeouts; logging never blocks the event loop.
- **SanitizationEngine** — control character stripping; safe against log injection.
- **Context / headers** — correlation ID and transaction ID propagation; single source of truth from config.
- **Fluent API** — `withRetention`, `withSource`, `withTransactionId`.
- **Per-call transport control** — override, add, or remove configured transports for a single log call, without creating new logger instances.
- **Audit and retention** — `audit` level (always logged, regardless of level setting); `withRetention(anyJson)` for compliance and immutable audit trails (SOX, GDPR); route by retention policy to dedicated transports/stores.
- **Lifecycle** — `init()` / `shutdown()`; graceful flush on SIGTERM/SIGINT so no logs are lost when instances shut down.
- **Observability hooks** — optional: `onLogFailure`, `onTransportError`, `onSerializationFallback`, `onStepError`, `masking.onMaskingError`; logging never throws; `isNativeAddonInUse()` to check at runtime.
- **Matrix at runtime** — `reconfigureLoggingMatrix()` without restart; security boundary: only changes which fields are visible, not masking or transports.
- **Tree-shaking** — `sideEffects: false` and ESM; only what you import ends up in the bundle.

For high demand you get **a single bundle**: JSON, masking, matrix, adapters, context, and security — all automatic when configured — with low memory and no rival in that category.

**Canonical list with examples:** each item in the list above is developed with explanation and code examples in the [README's "What's in the box" section](../README.md#whats-in-the-box) and the [examples repository](https://github.com/Syntropysoft/syntropylog-examples).

---

**Note:** For stable numbers, run from the repo root: `pnpm run bench:memory`. Only the **M2** column is bare-metal; the GH column is a shared CI runner and is unreliable for tail latency (§3.2) and memory (§4). The **AMD/WSL2** column is pending re-measurement for 1.4.0.
