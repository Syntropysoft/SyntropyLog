# Resolving a retention policy outside the logger

**Status:** proposal · **Type:** additive API · **Affects:** `SyntropyLog` facade, docs

Retention policies are registered once at `init({ retentionPolicies })` and are reachable **only
through a logger instance**. That is the right entry point when the record *is* the log entry. It
leaves nothing for the case where the retention rule has to be stored as a **field of a record the
framework never sees**.

This document describes the gap, the case that exposed it, and a two-method read-only API that
closes it without touching the fluent path.

---

## 1. How retention flows today

| Step | Where |
| --- | --- |
| Registry declared | `init({ retentionPolicies })` — `config.schema.ts:102` |
| Frozen defensive copy taken | `LoggerFactory` constructor — `LoggerFactory.ts:309-311` |
| Injected into every logger | `LoggerDependencies.retentionPolicies` — `LoggerFactory.ts:350` |
| Looked up by name | `Logger.withRetention(name)` — `Logger.ts:581-591` |
| Bound to the child logger | `withMeta` → `child({ retention })` — `Logger.ts:568-570` |
| Delivered to the transport | `logEntry.retention` |

Every hop is inside the logging pipeline. The registry itself has no public reader.

## 2. The case that exposed it

An audit journal (BCRA A7724 §9.1, ≥6 year retention) with two write paths into the same table:

- **technical path** — `appLogger.audit(...)` → transports → the journal's executor. A logger is
  involved, so `withRetention` applies.
- **domain path** — `recordTrace(event)` → recorder → writer → Postgres. **No logger is involved.**
  Every operation and configuration event goes this way.

The regulation requires the record to carry the policy it was filed under. Resolving it later by
joining a catalog table does not satisfy that: the catalog is mutable, so a record written in 2026
and read in 2030 would report the 2030 policy. The policy has to land in a column, at write time,
on both paths.

With today's surface, the only way to get the policy onto the domain path is for the consumer to
read the object it passed to `init()` — which is **not the object the framework uses**. The factory
holds a frozen copy (`LoggerFactory.ts:309-311`); the consumer holds the original. What gets
persisted and what the framework tags can diverge with nothing to detect it.

## 3. What exists today, and why it is not enough

`syntropyLog.getConfig().retentionPolicies?.[name]` (`SyntropyLog.ts:138-141`) does reach a
registry. Three problems:

1. **It is the caller's live config object, not the factory's frozen copy.** Mutate the config after
   `init()` and the two disagree. `ILogger.withRetention` already warns that the rules object is
   stored by reference (`ILogger.ts:95`) — the same hazard, now with a database row on the other end.
2. **A miss returns `undefined`.** The fluent path throws `RetentionPolicyNotFoundError` listing
   every registered name (`Logger.ts:35-54`). One lookup, two failure modes — and the silent one is
   the one that reaches a compliance column as `NULL`.
3. **It is a config accessor, not a semantic one.** The caller has to know the registry's shape and
   re-implement the lookup rule at every call site.

## 4. Proposal

Two read-only methods on the facade, alongside `getContextManager()` and `getFilteredContext()`:

```ts
/**
 * Resolves a registered retention policy by name — the same registry and the same
 * failure mode as `logger.withRetention(name)`, for callers that persist the policy
 * instead of tagging a log entry with it.
 *
 * @throws {RetentionPolicyNotFoundError} if the name is not registered.
 */
public getRetentionPolicy(name: string): Readonly<Record<string, unknown>>;

/** The frozen registry, for listing, diagnostics, or seeding a catalog table. */
public getRetentionPolicies(): Readonly<Record<string, Readonly<Record<string, unknown>>>>;
```

Semantics:

- **Reads the factory's frozen registry** — the same object `withRetention(name)` resolves against.
  One source, one answer, whichever way you ask.
- **An unknown name throws `RetentionPolicyNotFoundError`**, identical to the fluent path, with the
  sorted `available` list. Loud by design: a compliance field that silently lands `NULL` is worse
  than a failure at the call site.
- **`ensureReady()`**, like the other accessors — before `init()` there is nothing to resolve.
- **No normalization.** The object comes back as registered: same keys, same values.

At the call site:

```ts
const policy = syntropyLog.getRetentionPolicy('Operaciones eCheq');

await auditRepo.insert({
  ...record,
  retention: policy,                                   // the rule, filed with the record
  retention_until: addYears(record.at, policy.years),  // the same rule, indexable
});
```

## 5. Payload shape — say it in the docs

`LogRetentionRules` is open (`internal-types.ts:55-62`) and the framework never inspects it. Two
properties matter once consumers start *persisting* the payload rather than only tagging with it:

- **Keep it flat and primitive.** The type's own contract notes that the object is serialized with
  the entry and is **shallow in the native path — nested values become JSON strings**
  (`internal-types.ts:53`). A policy read through the accessor is intact, but the same policy read
  off `entry.retention` in a transport may not be. A flat object reads identically on both paths.
- **JSON-serializable end to end.** A `Date`, a `BigInt`, or a class instance survives the tag path
  (the executor receives the object) and then breaks a `jsonb` insert or an OTLP export.

Optional hardening, consistent with `UnknownExemptTransportError`: validate at `init()` that every
registered policy is JSON-serializable and fail there. That class already chose boot-time failure
over silent compliance damage; this is the same trade.

## 6. Non-goals

- **No enforcement.** The framework tags and routes; archival and deletion stay with the store —
  as [compliance.md](compliance.md) already states. Worth restating next to the new API so it does
  not read as a promise of enforcement.
- **No change to `withRetention`.** Fluent remains the entry point when the record *is* the entry.
  This adds a reader; it does not move the writer.

## 7. Test plan

- registered name → the frozen object, identical to what `withRetention(name)` binds.
- unknown name → `RetentionPolicyNotFoundError`, with `available` sorted.
- no registry configured → same error, "no policies registered" hint branch.
- called before `init()` → the same failure as the other `ensureReady()` accessors.
- caller mutates its own config object after `init()` → both the fluent binding and the accessor
  still return the value that was registered.
- a policy holding a nested object → the accessor returns it intact (documents the difference from
  the native-path entry, which flattens).

## 8. Versioning

Additive; no existing behaviour changes. Minor release.

---

## Appendix — related surface

- [fluent-api.md](fluent-api.md) — `withRetention`, `withMeta`.
- [compliance.md](compliance.md) — where retention sits among the compliance primitives, and the
  standing statement that enforcement belongs to the storage tier.
- [transports.md](transports.md) — `DurableAdapterTransport` routes on the presence of `retention`
  (`hasRetention`), which is the tag path, not the resolution path this document is about.
