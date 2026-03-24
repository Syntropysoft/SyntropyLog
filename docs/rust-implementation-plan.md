# Implementation Plan: Rust as the "Formula 1" of the Pipeline

Goal: **maximize use of the native addon (Rust)** to deliver a better user experience — less CPU on JS, same behavior and security. Detail for each opportunity in [rust-pipeline-optimization.md](rust-pipeline-optimization.md).

**Criterion:** I/O stays in Node; Rust handles pure CPU work (serialization, sanitization, masking, formatting, etc.).

---

## How to Use This Plan

- Check off items when done (change `- [ ]` to `- [x]`).
- Update **Last completed step** and **Next step** at the top of the doc as you progress.
- Phases are ordered by impact and dependencies; they can be done in parallel where there are no dependencies.

---

### Last Completed Step / Next Step

- **Last completed step:** Phase 1.3 — Metadata as string: `fast_serialize_from_json` in Rust, JS path (`JSON.stringify` → `fastSerializeFromJson`, fallback to `fastSerialize` if error or circular references).
- **Suggested next step:** Phase 2 — Addon documentation (2.1).

---

## Phase 0 — Preparation and Visibility

Goal: know when the addon is not in use and ensure the release ships the "Formula 1" by default.

- [x] **0.1** — **Fallback observability**
  - In `SerializationManager`, if `onSerializationFallback` already exists, document it in the API and README.
  - If it doesn't exist: add an optional callback (e.g. `onSerializationFallback?: (err: unknown) => void`) invoked when the addon call fails and the JS pipeline is used.
  - Allows the user (or a monitor) to see when Rust is not being used.

- [x] **0.2** — **Verify and document prebuilt**
  - Confirm that the release flow (build addon on Linux/Windows/macOS and package in `syntropylog-native`) is stable and runs on every release.
  - Add to the README (or docs): "For the best performance experience, prebuilt native addon binaries are used; they install automatically on compatible installations."

- [x] **0.3** — **Reference benchmark (optional)**
  - Have a benchmark that compares throughput/p99 **with addon** vs **without addon** (e.g. env variable or flag to disable the addon), to measure improvements in subsequent phases.

---

## Phase 1 — Rust Pipeline (optimize the current addon)

All changes in `syntropylog-native`; no JS API changes unless noted.

- [x] **1.1** — **Single-pass convert + mask**
  - Refactor in Rust: merge the JS → internal value conversion with mask/truncate/limit application in **a single** tree traversal.
  - Goal: fewer allocations and one fewer pass over the data.
  - Validate with existing tests and, if available, before/after benchmark.

- [x] **1.2** — **ANSI / control character stripping in Rust**
  - Inside the string handling in the addon (where truncating/redacting is applied), add stripping of:
    - ANSI sequences (equivalent regex to `SanitizationEngine` in JS).
    - Optionally, generic control characters.
  - The addon output is safe by default against log injection.
  - Update tests to cover strings with ANSI and verify they are removed.

- [x] **1.3** — **Metadata as string (experimental)**
  - In JS: attempt `JSON.stringify(metadata)`; if it doesn't throw (no circulars), call a new addon function, e.g. `fast_serialize_from_json(level, message, timestamp, service, metadata_json_string)`.
  - In Rust: parse the JSON and reuse existing mask/serialization logic (or the unified traversal from 1.1). If JS can't serialize (circular), fallback to `fast_serialize` with the object.
  - Add benchmark (small vs large metadata) and decide whether to leave it as the default path or only under an option.

---

## Phase 2 — Ensure Users Use the Addon ("Formula 1" experience)

- [ ] **2.1** — **README / documentation**
  - Short "Performance" or "Native addon" section: explain that a normal installation includes prebuilt Rust addon binaries and that this provides the best performance.
  - Mention requirements (supported Node versions, platforms with prebuilt). Link to [rust-pipeline-optimization.md](rust-pipeline-optimization.md) or this plan for those wanting more detail.

- [ ] **2.2** — **Runtime detection (optional)**
  - If it makes sense for your API: expose something like `syntropyLog.isNativeAddonLoaded()` or similar so users can check at runtime whether they are using the Rust path.
  - Useful for diagnostics and tests.

---

## Phase 3 — More CPU Work in Rust (outside the pipeline)

- [ ] **3.1** — **Message formatting in Rust (`format_message`)**
  - Implement in the addon a function that accepts a format string and arguments (e.g. as a JSON array) and returns the formatted string (subset of placeholders: `%s`, `%d`, `%i`, `%f`, `%j`).
  - In `Logger`, when there are format arguments: if the addon is loaded, call this function instead of `util.format`. If not, keep `util.format`.
  - Tests: same cases as with `util.format` (at least the supported subset).

- [ ] **3.2** — **JSON-in / JSON-out masking for the non-addon path (optional)**
  - New addon method: receives a JSON string (log entry already serialized by the JS pipeline) and returns another JSON string with the same built-in masking rules (sensitive_fields, redact_patterns, and optionally strategies like credit_card/SSN/email if aligned with the addon). **Custom** rules (JS `customMask` functions) stay in JS: applied before or after depending on design.
  - In the **non-addon** path: after the JS pipeline, serialize the entry to JSON, call Rust to mask, and pass the resulting string to transports (or deserialize only if the transport expects an object).
  - Goal: the non-addon fallback also offloads the heaviest part of masking to Rust. Requires maintaining behavioral parity between Rust and `MaskingEngine` for built-in rules.

---

## Phase 4 — Future (only if features are added)

- [ ] **4.1** — **Compression**
  - If a feature to compress logs before sending is added: implement in the addon (e.g. with `zstd` or `lz4`) and expose something like `compress_log_buffer(data: string) -> Buffer`. I/O (write/send) stays in Node.

- [ ] **4.2** — **Hashing for sampling / deduplication**
  - If content-based sampling (e.g. "only send 1 in N logs with the same hash") or deduplication is added: implement a fast hash in the addon (e.g. xxhash, fnv) and expose `hash_for_sampling(line: string) -> number`. The send/no-send decision and I/O stay in Node.

---

## Phase Summary

| Phase | Focus | Dependencies |
|-------|-------|--------------|
| **0** | Visibility and prebuilt | — |
| **1** | Optimize Rust pipeline | 0.2 recommended (prebuilt verified) |
| **2** | User experience (docs + optional detection) | 0.2 |
| **3** | Formatting and masking for fallback | 1.x recommended |
| **4** | Compression / hashing | Future features |

When you finish an item, mark it with `- [x]` and update "Last completed step" and "Next step" above to keep track.
