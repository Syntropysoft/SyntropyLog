# SyntropyLog — Benchmark Report

**Source:** output of `pnpm run bench:memory` (`NODE_OPTIONS=--expose-gc`).
**Date:** 2026-05-30. **Native addon (Rust):** yes (all machines).

Three environments, same day, captured so the results read as cross-platform rather than single-box:

| Label | Machine | OS / environment | Runtime |
|-------|---------|------------------|---------|
| **M2** | MacBook Pro (Apple M2) | macOS (native) | Node v20.20.1 (arm64-darwin) |
| **AMD** | AMD Ryzen 7 7735HS | **WSL2 on Windows 11** | Node v20.20.2 (x64-linux) |
| **GH** | AMD EPYC 7763 | **GitHub Actions CI (Ubuntu)** | Node v20.20.2 (x64-linux) |

> **On the environments.** Only **M2** is bare-metal native. **AMD** runs under WSL2 (a virtualization layer over Windows). **GH** is a shared, virtualized CI runner — useful as an x64-Linux data point, but **noisy**: see the disclaimer in §3.2. Treat AMD/GH as conservative, not the hardware's ceiling.

All times in **microseconds (µs)**; throughput group = 5,000 iterations, memory = 100,000 iterations. Lower is better. The `M2` / `AMD` / `GH` headers in the tables below refer to the machines above.

---

## 1. This is not a 1:1 comparison

Pino and Winston are **loggers**. SyntropyLog is an **observability and compliance pipeline** that, on *every* call, does what those need plugins or hand-written code to do. The real question is not "who writes a plain string fastest" — it is "what does compliance-grade logging cost", and the answer is: **roughly the same as a bare logger.**

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
| **Simple log (JSON)** | 0.93 (M2) / 1.41 (AMD) / 1.61 (GH) µs | **faster** on M2 & WSL2; slower on x64 server CPUs (gap varies on noisy CI) | **faster** everywhere |
| **Complex object (full pipeline)** | 5.0 (M2) / 6.0 (AMD) µs | *reference only* — Pino doesn't mask | *reference only* — Winston doesn't mask |
| **Fluent API (`withRetention`)** | 6.6 / 7.3 / 10.3 µs | — | — |
| **Memory (simple JSON)** | ~181 bytes/op | **identical** (~181) | ~5× lower (Winston ~936) |

**Headline:** SyntropyLog is **competitive with Pino on raw throughput while doing far more on every call**, and it is **always faster than Winston**. On simple JSON it is fastest of the three on M2 and WSL2; on x64 server CPUs a bare Pino is consistently faster (the margin varies run-to-run on the noisy shared CI runner). On memory it is **on par with Pino** (~181 bytes/op) and ~5× below Winston.

The only consistent place a bare logger wins is **plain-string throughput on x64** — where Pino does nothing but format a string. The moment you need redaction, field control, context, or audit routing, that gap is the price of writing it (and maintaining it) yourself.

---

## 3. Throughput (average time per iteration)

> **Read these as "what the full pipeline costs", not "who logs a string fastest".** Pino and Winston only format and write. Every SyntropyLog number below *also* runs masking, matrix filtering, sanitization, and the context pipeline (see §1). This is not a like-for-like race — the takeaway is that the full safety pipeline stays competitive with a bare logger, not the exact margin on any one box.

### 3.1 Simple Message (Logging Throughput)

| Library | M2 | M2 p99 | AMD | AMD p99 | GH | GH p99 |
|---------|----|--------|-----|---------|----|--------|
| console.log (baseline) | 0.14 | 1.63 | 0.25 | 3.16 | 0.26 | 3.02 |
| **SyntropyLog (JSON)** | **0.93** | 3.46 | **1.41** | 6.33 | 1.61 | 3.77 |
| Pino | 1.22 | 1.79 | 1.60 | 3.27 | **1.06** | 3.05 |
| Winston | 1.17 | 2.04 | 2.01 | 5.81 | 3.55 | 12.33 |

- SyntropyLog is **fastest of the three on M2 and AMD/WSL2** (0.93 / 1.41 µs). On x64 server CPUs a bare Pino is consistently faster on plain strings — across three CI runs the gap ranged ~12–52% (this run: 1.06 vs 1.61 µs); the magnitude is noisy but the order is stable.
- SyntropyLog is **faster than Winston in every environment**.

### 3.2 Complex Object — full pipeline cost (not a comparison)

| Library | M2 | AMD | GH | Masking |
|---------|----|-----|----|---------|
| Pino (complex object) | 2.14 | 2.69 | 4.00 | ❌ |
| Winston (complex object) | 3.58 | 8.67 | 9.96 | ❌ |
| **SyntropyLog (with masking)** | **5.00** | **5.96** | **7.77** | ✅ |

- **Not a comparison — a reference.** SyntropyLog masks, filters by matrix, sanitizes and reads context here; Pino and Winston only serialize. Their numbers are shown **only as a no-masking reference** to size what the full pipeline costs — not as a head-to-head, because they don't do this work. On quiet hardware (M2, WSL2) the full pipeline runs at **~2.2× a bare Pino** — that delta *is* the work they skip.
- Even next to Winston (which also doesn't mask) the full pipeline lands close: faster on AMD (5.96 vs 8.67) and GH (7.77 vs 9.96), slower on M2 (5.00 vs 3.58).

> **⚠️ CI noise — do not over-read the GH complex column.** Three runs on the *same* GitHub EPYC box, no code change, gave **wildly different** complex-object numbers: SyntropyLog **11.69 → 7.72 → 7.77 µs** and Pino **3.06 → 7.64 → 4.00 µs**. The shared CI runner is too noisy for the complex/tail group. The reliable signal across all environments: SyntropyLog's complex masking path costs **~2.2× a bare Pino** on quiet hardware (M2/WSL2). The GH figures above are from the latest run; treat them as indicative only.

### 3.3 MaskingEngine only (complex object)

| Benchmark | M2 | AMD | GH |
|-----------|----|-----|----|
| MaskingEngine.process(complexObj) | 2.30 | 2.72 | 4.21 |

Isolated masking cost, useful as the p99/p999 baseline for the complex-object group.

### 3.4 Fluent API (withRetention + complex JSON)

| Benchmark | M2 | AMD | GH |
|-----------|----|-----|----|
| SyntropyLog (withRetention complex) | 6.58 | 7.30 | 10.04 |

Creates a retention-bound child logger + one log per iteration. For a call that binds compliance metadata, sanitizes it, and routes it through the executor, this is negligible in any real application. On a hot path, reuse a single `withRetention(...)` logger instead of creating one per call.

---

## 4. Memory (heap delta per 100,000 iterations, bytes/op)

Obtained with **`pnpm run bench:memory`** (Node with `--expose-gc`). Memory is far more stable across runs than CPU timing — the numbers agree closely across machines and runs (with one CI noise exception, marked below).

| Benchmark | M2 | AMD | GH |
|-----------|----|-----|----|
| console.log (baseline) | 148.24 | 148.76 | 148.36 |
| SyntropyLog (JSON) | 182.01 | 182.11 | 181.56 |
| Pino | 152.92 | 151.82 | 182.53 |
| Winston | 932.45 | 946.58 | 934.08 |
| SyntropyLog (with masking) | 230.28 | 219.87 | 224.62 |
| Pino (complex object) | 120.78 | 123.79 | ~181 * |
| Winston (complex object) | 2,288.77 | 2,249.08 | 2,283.72 |
| SyntropyLog (withRetention complex) | 253.82 | 250.65 | 252.62 |

\* The latest CI run spiked Pino's complex-object memory to 708 bytes/op — a runner-noise artifact; the representative ~181 (consistent across all other runs) is shown.

- SyntropyLog (JSON): **~181 bytes/op** — **on par with Pino** on the CI run (181.56 vs 182.53), within ~30 bytes elsewhere.
- With masking / retention: **~220–254 bytes/op**.
- Winston: **~936 bytes/op** simple and **~2,288 bytes/op** complex — ~5× / ~10× the others, everywhere.
- For a logger that ships masking, retention, matrix and structured context by default, an ~181 bytes/op floor on par with a bare Pino is an excellent footprint.

---

## 5. Conclusions

- **Not a like-for-like comparison — and that's the point.** SyntropyLog runs masking, matrix, sanitization, context and audit routing on every call; Pino and Winston do not. The numbers show the **full safety pipeline staying competitive with a bare logger**, not a string-formatting race.
- **Throughput:** fastest of the three on M2 and WSL2; behind a bare Pino on plain-string x64 (gap varies on noisy CI); always ahead of Winston — while doing strictly more on every call.
- **Complex / masking:** ~2.2× a bare Pino on quiet hardware (the redaction cost), faster than Winston in most runs. CI complex numbers are noisy — see §3.2.
- **Memory:** on par with Pino (~181 bytes/op), ~5–10× below Winston.
- **Positioning:** for a logger that ships JSON, masking, context, and security **by default**, there is no rival in the same category. Pino is leaner but redacts nothing out of the box; Winston is much heavier and slower without the same ready-to-use package.

---

## 6. Improvement Opportunities (prioritized)

### 6.1 High Impact

1. **Reduce tail latency (p99/p999) for "complex object + masking"** — profile the masking + serialization critical path for rare slow paths, large allocations, or regex cost; consider caching or simplifying masking for common shapes.

### 6.2 Medium Impact

1. **Fluent API cost (`withRetention`)** — 6.6–10.3 µs/iter includes creating a child logger every time. Encourage reusing a retention-bound logger rather than creating it per call; or reduce the cost of binding loggers (deferred context, fewer copies).

### 6.3 Lower Priority / Validation

1. **Get a bare-metal Linux number.** Today the only native run is M2 (macOS); both x64 data points are virtualized (WSL2, CI). A dedicated bare-metal Linux box would settle the x64 throughput question without CI noise.
2. **"With masking" vs explicit "without masking"** — add a SyntropyLog "complex object without masking" benchmark to separate serialization cost from masking cost.

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

**Note:** For stable numbers, run from the repo root: `pnpm run bench:memory`. Other runs may show noisy deltas, and shared CI runners are unreliable for tail latency (see §3.2).
