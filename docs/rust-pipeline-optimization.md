# Rust and the Log Pipeline: How Much More Heavy Lifting Can We Give It?

This document answers the question: **how much more heavy CPU work can we offload to Rust to accelerate the entire log pipeline**.

**I/O:** For I/O, nothing beats Node (streams, libuv, disk/network writes). We are not moving I/O to Rust here; this is only about **CPU work** where Rust's brute force actually helps.

---

## Current State: Who Does What

### With native addon loaded (fast path)

1. **Logger** calls `serializationManager.serializeDirect(level, message, timestamp, service, metadata)`.
2. **SerializationManager** detects the addon and calls `native.fastSerialize(level, message, timestamp, service, metadata)`.
3. **Rust** (`fast_serialize` in `syntropylog-native`):
   - Converts the `metadata` JS object to a `serde_json::Value` tree with **circular reference detection** and `Error` normalization (name, message, stack).
   - Applies **limits**: `MAX_KEYS_PER_OBJECT` (500), `MAX_ARRAY_LENGTH` (1000).
   - Traverses the tree with **mask_value**: max depth, string truncation, sensitive keys → `[REDACTED]`, regex redaction patterns.
   - Builds the final JSON (level, message, service, timestamp + masked metadata) and returns **a single string**.
4. **Logger** receives `serializedNative` and passes that string directly to each transport via `transport.log(serializedNative)`.

In this path, the JS pipeline (SerializationStep, HygieneStep, SanitizationStep, TimeoutStep) and **MaskingEngine** in JS are **not executed**.

### Without native addon (fallback)

1. **Logger** calls `serializeDirect` the same way.
2. **SerializationManager** has no addon (or it failed) → builds a `logEntry` object and calls `serialize(logEntry, context)`.
3. **JS Pipeline**:
   - **SerializationStep**: custom serializers or pass-through.
   - **HygieneStep**: circular detection (shortcut with `JSON.stringify` or `safeDecycle`), `Error` normalization.
   - **SanitizationStep**: `DataSanitizer` (maxDepth, sensitive keys).
   - **TimeoutStep**: timeout metadata.
4. **Logger** receives `result.data` (object), calls **MaskingEngine.process(entry)** (regex, masking rules) and passes the masked object to transports.

The heavy JS work here is: object traversal (hygiene + sanitization) and **MaskingEngine** (regex over strings across the entire tree).

---

## What Rust Already Does (Summary)

| Functionality | Rust (addon) | JS pipeline (no addon) |
|---------------|--------------|------------------------|
| Circular references | Yes (`js_unknown_to_value` + pointer `HashSet`) | Yes (HygieneStep) |
| Error normalization | Yes (name, message, stack) | Yes (HygieneStep) |
| Depth limit | Yes (`max_depth` in `mask_value`) | Yes (DataSanitizer, TimeoutStep) |
| Keys/array limit | Yes (500 keys, 1000 items) | Not explicit in pipeline |
| String truncation | Yes (`max_string_length`) | Implicit in sanitization |
| Sensitive keys | Yes (`sensitive_fields` + `redact_patterns`) | Yes (DataSanitizer + MaskingEngine) |
| Final output | One JSON string | Object → MaskingEngine → object |

With the addon, **all heavy work of serialization + sanitization + masking** is already in Rust. The JS pipeline is only used when there's no addon or when the addon fails.

---

## Opportunities to Give Rust More Work and Speed Things Up

### 1. Single Pass in Rust (convert + mask)

**Today:** Rust makes two passes over the data:

- `js_unknown_to_value`: traverses the JS object and builds a `serde_json::Value`.
- `mask_value`: traverses that `Value` and produces another with truncation, redaction, and limits.

**Opportunity:** Merge into **a single traversal**: while converting from JS to an internal representation, apply truncation, key-based redaction, and depth limit at the same time. This reduces intermediate memory and one full pass over the tree.

**Impact:** Fewer allocations and less work per log on the native path. Requires refactoring only in `syntropylog-native` (no JS changes).

---

### 2. ANSI / Control Character Stripping in Rust

**Today:** In JS, **SanitizationEngine** removes ANSI codes and control characters from strings to prevent log injection. That engine is optional in **transports** (e.g. ConsoleTransport can use it). On the native path, the transport receives a **string** already; if the transport doesn't re-sanitize it, control characters could remain in the output.

**Opportunity:** Add in Rust, inside string processing (in `mask_value` or a helper used there), stripping of:

- ANSI sequences (equivalent to the `SanitizationEngine` regex).
- Optionally, generic control characters.

This makes the addon output safe by default and removes the dependency on a second pass in JS. Cost: one regex/char pass over each string; in Rust this is typically very cheap.

**Impact:** Security parity with the JS path and possible elimination of the need for SanitizationEngine in transports when input comes from the addon.

---

### 3. Reducing N-API Crossings (Metadata as String) — Experimental

**Today:** Rust receives the `metadata` object as `JsUnknown` and traverses it with `get_named_property` / `get_element`, etc. Each access is an N-API crossing (JS ↔ Rust).

**Opportunity:** Have **JS** do `JSON.stringify(metadata)` and pass Rust **a single string**. Rust would do `serde_json::from_str` and then the same `mask_value` (or the unified traversal from point 1). This means only **one** N-API crossing per log (the string).

**Trade-off:**
- Advantage: fewer N-API crossings; can win on very large or deeply nested objects.
- Disadvantage: `JSON.stringify` in JS can fail with circulars (would need to keep the "object" path as fallback) and adds a full V8 serialization.

**Recommendation:** Implement as an **optional path** (e.g. attempt `JSON.stringify`; if no error, call a new Rust function `fast_serialize_from_json(level, message, timestamp, service, metadata_json_string)`; if error, fallback to the current `fast_serialize` with the object). Benchmark (throughput and p99) with small and large metadata before making it the default.

---

### 4. Custom Serializers

**Custom serializers** (SerializationStep) are JS functions. They **cannot** be moved to Rust. Any log that depends on them will keep using the JS pipeline. There is no more work to give Rust in that area; the current design (addon for the standard path, JS pipeline for custom serializers) is the reasonable limit.

---

### 5. Ensuring the Addon Is the Norm (Prebuilt)

The more processes use the addon, the more "the entire pipeline is accelerated" in practice:

- **Release / prebuilt:** You already have the flow of building the addon on all three OSes and packaging binaries in `syntropylog-native` for npm publishing. Maintaining and documenting this ensures most installations use the Rust path.
- **Detection and fallback:** If the addon doesn't load (installation without prebuilt, incompatible Node version), the JS pipeline fallback is correct. Optional: an `onSerializationFallback` callback or similar for observability when Rust is not in use.

---

## Other Heavy Tasks (Outside the Pipeline)

Besides the serialization/sanitization/masking pipeline, there is more **pure CPU work** we can leverage Rust for.

### 6. Message Formatting (`util.format`)

**Today:** When the user does `logger.info('User %s did %d actions', name, count)`, JS calls `util.format(message, ...formatArgs)`. This is CPU (placeholder substitution, numbers, etc.) on the hot path.

**Opportunity:** Expose in Rust a function like `format_message(fmt_string, args_json)` implementing a Node-compatible subset (e.g. `%s`, `%d`, `%i`, `%f`, `%j`). Logger would call the addon to format the message before passing it to `fastSerialize`. This removes `util.format` from the hot path when there are format arguments.

**Impact:** Less V8 pressure on calls with many placeholders. Risk: 100% parity with `util.format` (objects, symbols, etc.) can be laborious; a useful subset already adds value.

---

### 7. Built-in MaskingEngine Rules on the Non-Addon Path

**Today:** When there is **no addon**, after the JS pipeline, **MaskingEngine** in JS is used: recursive object traversal, regex on each key, and for each string value applies strategies (credit card, SSN, email, phone, password, token) with many `replace` calls and per-type logic. This is pure CPU and can dominate p99 in the fallback.

**Opportunity:** Expose in Rust a function that receives **a JSON string** (the entry already serialized by the JS pipeline) and returns another JSON string with the **same built-in rules** (sensitive_fields, redact_patterns, and optionally strategies like credit_card/SSN/email if aligned with the addon). **Custom** rules (JS `customMask` functions) remain in JS: applied before or after the result depending on design. This way the non-addon path also offloads the heaviest masking to Rust (a single N-API crossing: string in, string out).

**Impact:** The non-addon fallback gets closer to the native path's performance on the masking side. Complexity: maintaining behavioral parity between Rust and MaskingEngine (default rules).

---

### 8. Compression (Future Feature)

If in the future you want to **compress** log lines before sending (e.g. buffer → compress → send over network), compression is **pure CPU**. Rust with crates like `zstd` or `lz4` is very fast. The addon could expose `compress_log_buffer(data: string) -> Buffer`; **I/O** (writing to socket, file, or queue) stays in Node. This splits it up: Rust handles the heavy CPU part, Node handles the write/send.

**Impact:** Compressed logs without blocking the event loop with JS compression. Only makes sense if a compression feature is added.

---

### 9. Hashing for Sampling / Deduplication

If **content-based sampling** (e.g. "only send 1 in N logs with the same hash") or deduplication is implemented, the **hash** of the line is CPU. Rust can compute a fast hash (xxhash, fnv, etc.) in nanoseconds and expose something like `hash_for_sampling(line: string) -> number`. The send/no-send decision and I/O stay in Node.

**Impact:** Sampling/dedup with negligible cost on the hot path. Only applies if this capability is added.

---

### Summary of "Other Tasks"

| Task | Where today | Rust opportunity | I/O |
|------|------------|------------------|-----|
| Message formatting | `util.format` in Logger | `format_message` in addon | No; CPU only. |
| Built-in masking (fallback) | MaskingEngine in JS | Rust: JSON string → masked JSON string | No. |
| Compression | — | Addon: compress buffer; Node writes | I/O stays in Node. |
| Hashing (sampling) | — | Addon: hash line; decision in Node | I/O stays in Node. |

---

## Executive Summary

| Action | Where | Effect |
|--------|--------|--------|
| **Single-pass convert+mask in Rust** | syntropylog-native | Fewer allocations and less CPU per log on the native path. |
| **ANSI/control char stripping in Rust** | syntropylog-native | Safe output without extra JS step; parity with SanitizationEngine. |
| **Metadata as string (optional)** | Logger/SerializationManager + addon | Possible N-API gain; requires benchmark and fallback if `JSON.stringify` fails. |
| **Keep prebuilt in release** | CI / release | Maximizes use of the Rust path in production. |
| **Message formatting in Rust** | addon `format_message` | Remove `util.format` from hot path when placeholders are present. |
| **Built-in masking for fallback** | addon: JSON in → JSON out | Non-addon path offloads heavy masking to Rust (string in/out). |
| **Compression (future)** | addon | CPU in Rust; I/O (write/send) stays in Node. |
| **Hashing for sampling (future)** | addon | Hash in Rust; decision and I/O in Node. |
| **Custom serializers** | — | Stay in JS; no more work to move to Rust there. |

In short: **the heavy pipeline work is already in Rust when the addon is loaded.** Next improvements are to optimize the addon itself (single pass, ANSI/control chars) and, if you want to squeeze more out, test the "metadata as string" path with benchmarks. The rest of "accelerating the entire pipeline" comes from ensuring that native path is the default (prebuilt, documentation, and optionally fallback observability). Beyond the pipeline: message formatting, fallback masking, and in the future compression and hashing. I/O stays in Node; Rust takes on the pure CPU work.

**Implementation plan:** To check off tasks and track progress, see **[Implementation Plan: Rust as the "Formula 1" of the Pipeline](rust-implementation-plan.md)** in this same folder.
