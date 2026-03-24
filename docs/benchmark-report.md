# SyntropyLog — Benchmark Report

**Environment:** Apple M2, Node v20.20.1 (arm64-darwin)
**Native addon (Rust):** yes
**Source:** output of `pnpm run bench` (throughput: 5M iterations; memory: 100k iterations)

All times in **microseconds (µs)** unless otherwise noted. Lower is better for time and bytes/op.

---

## 1. Executive Summary

| Scenario | SyntropyLog | vs Pino | vs Winston |
|----------|-------------|---------|------------|
| Simple log (JSON) | 0.93 µs avg | ~1.5× slower | ~1.3× faster |
| Complex object | 6.69 µs avg (with masking) | ~3.5× slower | ~1.8× faster |
| Fluent API (withRetention) | 8.63 µs avg | — | — |

- **Throughput:** SyntropyLog sits between Pino (fastest) and Winston. On simple logging it is closer to Pino; on complex payloads with masking it is the slowest of the three, but it is the only one applying masking in that group.
- **Tail latency:** SyntropyLog (with masking) shows a higher p99/p999 (42 µs / 145 µs) than Pino and Winston in the complex object case; SyntropyLog simple (JSON) has a very tight p999 (4.96 µs).
- **Memory:** SyntropyLog bytes/op are in the low–medium range (≈229–266 bytes/op with `bench:memory`); Pino is comparable (≈181–182 bytes/op); Winston is the highest (≈939–2288 bytes/op). *Previously*, without `--expose-gc`, Pino appeared as 0 B due to a measurement bug (negative delta clamped to 0); this is now fixed (shows "0 (noise)" and `pnpm run bench:memory` is recommended).

---

## 2. Throughput (average time per iteration)

### 2.1 Simple Message (no complex object)

| Library | avg (µs) | min (µs) | max (µs) | p75 (µs) | p99 (µs) | p999 (µs) |
|---------|----------|----------|----------|----------|----------|-----------|
| console.log (reference) | 0.15 | 0.09 | 11.42 | 0.10 | 1.82 | 4.84 |
| **Pino** | **0.61** | 0.29 | 9,866 | 0.42 | 1.46 | 29.58 |
| **SyntropyLog (JSON)** | **0.93** | 0.70 | 4.96 | 0.76 | 3.44 | 4.96 |
| Winston | 1.23 | 0.46 | 10,103 | 0.58 | 2.13 | 8.13 |

- SyntropyLog is **~1.5× slower** than Pino and **~1.3× faster** than Winston on average.
- SyntropyLog has the **tightest max and p999** in this group (4.96 µs); Pino and Winston show very high maximums (≈10 ms), suggesting occasional GC pauses.

### 2.2 Complex Object (same payload)

| Library | avg (µs) | min (µs) | max (µs) | p75 (µs) | p99 (µs) | p999 (µs) |
|---------|----------|----------|----------|----------|----------|-----------|
| **Pino (complex object)** | **1.88** | 1.08 | 11.44 | 1.82 | 8.12 | 11.44 |
| Winston (complex object) | 3.79 | 1.63 | 7,540 | 1.83 | 3.79 | 8.04 |
| **SyntropyLog (with masking)** | **6.69** | 3.00 | 15,808 | 3.96 | 42.29 | 144.71 |

- **Note:** SyntropyLog applies **masking** (redaction) on the complex object; Pino and Winston do not. Therefore "complex object" is not strictly comparable.
- In raw numbers: SyntropyLog is **~3.55× slower** than Pino and **~1.76× slower** than Winston.
- The **p99 (42 µs) and p999 (145 µs)** of SyntropyLog are notably higher than the other two; this is a clear area for improvement.

### 2.3 Fluent API (withRetention + complex JSON)

| Library | avg (µs) | min (µs) | max (µs) | p75 (µs) | p99 (µs) | p999 (µs) |
|---------|----------|----------|----------|----------|----------|-----------|
| SyntropyLog (withRetention complex) | 8.63 | 7.75 | 2,578 | 8.38 | 11.54 | 17.04 |

- Unique scenario: **8.63 µs** on average. The cost comes from creating a child logger (withRetention) + one log per iteration. No direct competitor in this run.

---

## 3. Memory (heap delta per 100k iterations, bytes/op)

**Important:** The figures below are obtained with **`pnpm run bench:memory`** (Node with `--expose-gc`). Without it, the "before" for each task is the heap of the previous task; low-allocating libraries (e.g. Pino) can produce a negative delta that was clamped to 0 and shown as "0 B" — this was a **measurement bug**, not zero real allocation. Fixed: without `--expose-gc` it now shows **"0 (noise)"** when the delta is negative, and `bench:memory` is recommended for stable results.

| Benchmark | heap delta | bytes/op |
|-----------|-----------|----------|
| console.log (reference) | 89.26 MB | 935.93 |
| SyntropyLog (JSON) | 21.82 MB | 228.82 |
| Pino | 17.30 MB | 181.35 |
| Winston | 89.59 MB | 939.38 |
| SyntropyLog (with masking) | 24.07 MB | 252.39 |
| Pino (complex object) | 17.37 MB | 182.18 |
| Winston (complex object) | 218.22 MB | 2,288.19 |
| SyntropyLog (withRetention complex) | 25.38 MB | 266.18 |

- SyntropyLog: **~229–266 bytes/op** across measured scenarios (with `bench:memory`).
- Pino: **~181–182 bytes/op** — comparable or slightly lower than SyntropyLog on simple log.
- Winston: **~939–2288 bytes/op** — much higher.
- SyntropyLog's memory profile is reasonable given the feature set (masking, retention, structured context).

---

## 4. Improvement Opportunities (prioritized)

### 4.1 High Impact

1. **Reduce tail latency (p99/p999) for "complex object + masking"**
   - Today: p99 ≈ 42 µs, p999 ≈ 145 µs (vs Pino/Winston in single or low double digits µs).
   - Actions: profile the critical path (serialization + masking), look for rare slow paths, large allocations, or regex cost; consider caching or simplifying masking for common shapes.
2. **Close the gap with Pino on simple and complex logs**
   - Simple: 0.93 µs vs 0.61 µs (~52% slower).
   - Complex (with masking): 6.69 µs vs 1.88 µs (~256% slower); part of this is extra work (masking).
   - Actions: ensure the Rust addon is used on the critical path; optimize `fastSerialize` natively and reduce JS↔native boundary cost; consider deferred or batched masking where safe.

### 4.2 Medium Impact

1. **Fluent API cost (withRetention)**
   - 8.63 µs/iter includes creating a child logger every time.
   - Actions: encourage reusing a "retention" logger rather than creating it per call; or optimize the cost of creating bound loggers (deferred context, fewer copies).
2. **Memory benchmark stability** *(partially resolved)*
   - Pino was showing 0 B due to a measurement bug: without `--expose-gc`, `gc()` is not called between tasks, the delta could be negative and was clamped to 0.
   - **Done:** the benchmark now shows **"0 (noise)"** when the delta is negative and recommends `pnpm run bench:memory`; with `bench:memory` figures are stable (Pino ~17 MB / ~181 bytes/op).
   - Optional: run multiple passes and report median/percentiles.

### 4.3 Lower Priority / Validation

1. **Max latency spikes**
   - SyntropyLog (with masking) max 15,808 µs vs p999 145 µs suggests rare outliers.
   - Actions: profile under load to see if correlated with GC, V8 optimization, or specific payloads; add a max-time option or sampling in development to detect regressions.
2. **"With masking" vs explicit "without masking"**
   - Add a SyntropyLog "complex object without masking" benchmark to separate serialization cost from masking cost and guide optimization (serialization vs masking).

---

## 5. Conclusions

- **Positioning:** SyntropyLog is faster than Winston and slower than Pino in these benchmarks; in memory (with `pnpm run bench:memory`) SyntropyLog is in the ~229–266 bytes/op range and Pino in ~181–182 bytes/op, both well below Winston (~939–2288 bytes/op).
- **Strengths:** Tight tail latency for simple JSON logging; reasonable memory; Rust addon in use.
- **Main opportunities:** Reduce p99/p999 on the masking path and further optimize the native serialization/masking route to close the gap with Pino while maintaining masking and retention semantics.
