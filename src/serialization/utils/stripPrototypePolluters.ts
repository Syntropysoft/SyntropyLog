/**
 * @file src/serialization/utils/stripPrototypePolluters.ts
 * @description Defense-in-depth helper that strips well-known
 * prototype-pollution carrier keys from log metadata before it reaches any
 * transport or formatter.
 *
 * Keys stripped:
 *   - `__proto__` — the canonical pollution vector. Even when JSON.parse
 *     protects against this at parse time, downstream code that builds
 *     objects via `Object.assign` or `obj[key] = ...` can still propagate
 *     the polluting payload to other objects' prototypes.
 *   - `constructor` — pointing this at a different value can confuse code
 *     that relies on `value.constructor` for type checks. Legitimate logs
 *     rarely need this field; if you do, rename it (e.g. `ctor`).
 *   - `prototype` — almost always indicates a leaked function prototype
 *     reference, not a real piece of business data.
 *
 * Behavior:
 *   - Recursively walks arrays and plain objects.
 *   - Returns the input untouched if no polluter keys are present
 *     (zero allocation on the safe path).
 *   - Returns a shallow copy with the bad keys removed when stripping is
 *     needed. The replacement happens at the level where the polluter was
 *     found; sibling keys keep their original references.
 *   - Skips primitives, `Date`, `RegExp`, `Map`, `Set`, `Error`, and any
 *     non-plain object — those don't have user-controlled string keys
 *     worth stripping.
 *
 * Performance:
 *   - Single-pass, no JSON.stringify, no clone of unaffected subtrees.
 *   - Cycle detection via WeakSet to keep budget bounded on adversarial
 *     inputs.
 */

/** Keys we never let pass downstream. */
const POLLUTER_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Pure check: is `value` a plain object we should walk? Returns false for
 * `null`, arrays (walked separately), and any object whose prototype is
 * not `Object.prototype` or `null` (i.e. class instances, Maps, Sets,
 * Dates, Errors, etc.).
 */
function isPlainWalkable(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Returns the input with any `__proto__` / `constructor` / `prototype`
 * own-keys removed at every depth. Returns the original reference when
 * nothing needed stripping.
 */
export function stripPrototypePolluters<T>(value: T): T {
  return walk(value, new WeakSet()) as T;
}

function walk(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;

  // Cycle guard: returning the input keeps the cycle in place for the
  // hygiene step to neutralize. We don't try to break cycles here — that's
  // not our job.
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    let modified = false;
    const out: unknown[] = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      const next = walk(value[i], seen);
      out[i] = next;
      if (next !== value[i]) modified = true;
    }
    seen.delete(value);
    return modified ? out : value;
  }

  // Hostile-input defense. `isPlainWalkable`, `Object.keys`, and property
  // access all run user-controlled traps when the input is a Proxy or has
  // throwing getters. If any of that throws, pass the value through
  // unchanged — the downstream HygieneStep has its own try/catch that
  // turns it into a `[HYGIENE_ERROR]` marker. The guard's job is to never
  // be the thing that crashes the pipeline.
  try {
    if (!isPlainWalkable(value)) {
      seen.delete(value);
      return value;
    }

    const keys = Object.keys(value);
    let hasPolluter = false;
    for (const key of keys) {
      if (POLLUTER_KEYS.has(key)) {
        hasPolluter = true;
        break;
      }
    }

    const rewritten: Record<string, unknown> = {};
    let nestedChanged = false;
    for (const key of keys) {
      if (POLLUTER_KEYS.has(key)) continue;
      const original = value[key];
      const next = walk(original, seen);
      rewritten[key] = next;
      if (next !== original) nestedChanged = true;
    }

    seen.delete(value);

    if (!hasPolluter && !nestedChanged) {
      return value; // safe path: zero allocation
    }
    return rewritten;
  } catch {
    seen.delete(value);
    return value;
  }
}
