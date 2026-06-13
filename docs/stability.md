# Stability & Compatibility

This document is the contract SyntropyLog commits to from **1.0** onward. Its
purpose is simple: you should be able to upgrade within a major version and
**nothing breaks**.

## Semantic versioning

We follow [SemVer](https://semver.org/). From 1.0:

- **Patch** (`1.0.x`) — bug fixes, performance, internal changes. Always safe.
- **Minor** (`1.x.0`) — new, backwards-compatible features. Always safe.
- **Major** (`x.0.0`) — breaking changes. Documented with a migration note.

A change is "breaking" only if it affects the **public surface** defined below.

## What is public (the contract)

The public surface is exactly the named exports of the package entry points:

| Entry point | Import |
|---|---|
| Core | `import { ... } from 'syntropylog'` |
| Testing toolkit | `import { ... } from 'syntropylog/testing'` |
| Test mock | `import { ... } from 'syntropylog/testing/mock'` |
| NestJS module | `import { ... } from 'syntropylog/nestjs'` |

This surface (both **values and types**) is locked by automated tests
(`tests/index.test.ts` and `tests/public-api-surface.test.ts`). Any addition or
removal trips CI and is reviewed as a deliberate semver decision — it cannot
change by accident.

**Not part of the contract:** deep imports (`syntropylog/dist/...`, anything not
listed above), internal class internals beyond their documented methods, and the
native addon internals (see below).

## Log output shape

The emitted log record is something you parse downstream, so its shape is part
of the contract. These top-level fields are **stable** and will not be renamed
or retyped without a major:

| Field | Type | Notes |
|---|---|---|
| `level` | string | one of `audit`, `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `message` | string | the formatted message |
| `timestamp` | string | ISO 8601 / RFC 3339 |
| `service` | string | logger/service name |

Everything else in the record is **your structured metadata**, passed through as
provided (after masking/sanitization). We add fields only in a
backwards-compatible way.

## Native addon (Rust) — an optimization, not a contract

The native addon accelerates serialization + masking + sanitization. It is a
**performance optimization, never a behavioral contract**:

- When the addon is **not** available for your platform, SyntropyLog
  transparently uses the **pure-JS pipeline**. Output and behavior are
  **identical** — only slightly slower.
- The set of platforms with a prebuilt binary can grow in **minor** releases
  (more speed, no behavior change) and is therefore **not** covered by SemVer.

### Prebuilt platform matrix

| Platform | Arch | Prebuilt today | Otherwise |
|---|---|:---:|---|
| Linux (glibc) | x64 | ✅ | — |
| Windows (MSVC) | x64 | ✅ | — |
| macOS | arm64 (Apple Silicon) | ✅ | — |
| macOS | x64 (Intel) | ⬜ | JS fallback |
| Linux (glibc) | **arm64 (Graviton, etc.)** | ⬜ | JS fallback |
| Linux (**musl / Alpine**) | x64 / arm64 | ⬜ | JS fallback |
| Windows | arm64 | ⬜ | JS fallback |

> If you run on a ⬜ platform (common in containers — Alpine — and on ARM
> servers — AWS Graviton), you get **correct behavior on the JS path**, just
> without the native speedup. Expanding this matrix is on the roadmap.

To check which path you're on at runtime:

```ts
import { syntropyLog } from 'syntropylog';
// true when the native addon is active for this process
syntropyLog.isNativeAddonInUse();
```

To force the JS path (e.g. to compare, or to rule the addon out while debugging):

```bash
SYNTROPYLOG_NATIVE_DISABLE=1 node your-app.js
```

## Runtime support

- **Node.js** `>= 20`.
