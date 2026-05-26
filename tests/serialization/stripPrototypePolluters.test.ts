import { describe, it, expect, afterEach } from 'vitest';
import { stripPrototypePolluters } from '../../src/serialization/utils/stripPrototypePolluters';

/**
 * Behavioral tests for the prototype-pollution guard.
 *
 * The contract:
 *   - Polluter keys (`__proto__`, `constructor`, `prototype`) never appear
 *     on the value returned to downstream code at any depth.
 *   - `Object.prototype` is never modified by passing a polluting payload
 *     through the guard.
 *   - The safe path (no polluter keys in the input) returns the original
 *     reference — zero allocation.
 *   - Sibling subtrees that did not need stripping keep their original
 *     references; only the affected subtree is rebuilt.
 *   - Class instances, arrays, primitives are handled correctly.
 */

describe('stripPrototypePolluters — keys actually disappear', () => {
  it('strips top-level __proto__', () => {
    const input = JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}');
    const out = stripPrototypePolluters(input);
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(false);
    expect((out as { ok: number }).ok).toBe(1);
  });

  it('strips top-level constructor', () => {
    const input = { constructor: { name: 'evil' }, userId: 42 };
    const out = stripPrototypePolluters(input);
    expect(Object.prototype.hasOwnProperty.call(out, 'constructor')).toBe(
      false
    );
    expect((out as { userId: number }).userId).toBe(42);
  });

  it('strips top-level prototype', () => {
    const input = { prototype: { thing: 1 }, op: 'charge' };
    const out = stripPrototypePolluters(input);
    expect(Object.prototype.hasOwnProperty.call(out, 'prototype')).toBe(false);
    expect((out as { op: string }).op).toBe('charge');
  });

  it('strips polluter keys at nested depth', () => {
    const input = JSON.parse(
      '{"user": {"__proto__": {"isAdmin": true}, "id": 1}, "ts": 100}'
    );
    const out = stripPrototypePolluters(input) as {
      user: Record<string, unknown>;
      ts: number;
    };
    expect(Object.prototype.hasOwnProperty.call(out.user, '__proto__')).toBe(
      false
    );
    expect(out.user.id).toBe(1);
    expect(out.ts).toBe(100);
  });

  it('strips polluters inside array entries', () => {
    const input = [
      { a: 1 },
      JSON.parse('{"__proto__": {"x": 1}, "b": 2}'),
      { c: 3 },
    ];
    const out = stripPrototypePolluters(input);
    expect(Array.isArray(out)).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call((out as never[])[1], '__proto__')
    ).toBe(false);
    expect(((out as { b: number }[])[1] as { b: number }).b).toBe(2);
  });

  it('strips all three keys when all are present', () => {
    const input = JSON.parse(
      '{"__proto__": 1, "constructor": 2, "prototype": 3, "keep": 4}'
    );
    const out = stripPrototypePolluters(input);
    for (const k of ['__proto__', 'constructor', 'prototype']) {
      expect(Object.prototype.hasOwnProperty.call(out, k)).toBe(false);
    }
    expect((out as { keep: number }).keep).toBe(4);
  });
});

describe('stripPrototypePolluters — Object.prototype is not mutated', () => {
  // We snapshot whatever lives on Object.prototype today and verify the
  // guard does not add new properties to it.
  let baseline: Set<string>;

  afterEach(() => {
    // If a polluted property somehow leaked, force-restore.
    for (const k of Object.getOwnPropertyNames(Object.prototype)) {
      if (!baseline.has(k)) {
        delete (Object.prototype as Record<string, unknown>)[k];
      }
    }
  });

  it('does not pollute Object.prototype even with a hostile payload', () => {
    baseline = new Set(Object.getOwnPropertyNames(Object.prototype));

    const hostile = JSON.parse(
      '{"__proto__": {"isAdminGlobally": true}, "user": "alice"}'
    );
    stripPrototypePolluters(hostile);

    // Sanity: no new own-properties showed up on Object.prototype.
    const after = Object.getOwnPropertyNames(Object.prototype);
    const added = after.filter((k) => !baseline.has(k));
    expect(added).toEqual([]);

    // And the global accessor doesn't see the polluted property either.
    expect(({} as Record<string, unknown>).isAdminGlobally).toBeUndefined();
  });
});

describe('stripPrototypePolluters — zero-allocation safe path', () => {
  it('returns the same reference when there is nothing to strip', () => {
    const input = {
      user: { id: 1, name: 'a' },
      deep: { also: { fine: true } },
    };
    const out = stripPrototypePolluters(input);
    expect(out).toBe(input);
  });

  it('returns the same reference for an array with no polluters', () => {
    const input = [{ a: 1 }, { b: 2 }, { c: 3 }];
    const out = stripPrototypePolluters(input);
    expect(out).toBe(input);
  });

  it('returns the same reference for primitives', () => {
    expect(stripPrototypePolluters(42)).toBe(42);
    expect(stripPrototypePolluters('hello')).toBe('hello');
    expect(stripPrototypePolluters(null)).toBe(null);
    expect(stripPrototypePolluters(undefined)).toBe(undefined);
    expect(stripPrototypePolluters(true)).toBe(true);
  });

  it('keeps non-affected subtrees as identical references', () => {
    const safeSubtree = { unchanged: true };
    const input = {
      safe: safeSubtree,
      bad: JSON.parse('{"__proto__": 1, "kept": 2}'),
    };
    const out = stripPrototypePolluters(input) as {
      safe: typeof safeSubtree;
      bad: { kept: number };
    };
    // The affected branch is rewritten, but the safe branch is the same ref.
    expect(out.safe).toBe(safeSubtree);
    expect(out.bad.kept).toBe(2);
  });
});

describe('stripPrototypePolluters — non-plain objects pass through', () => {
  it('leaves Date instances untouched', () => {
    const d = new Date('2026-05-26T00:00:00Z');
    expect(stripPrototypePolluters(d)).toBe(d);
  });

  it('leaves Error instances untouched (Hygiene handles them)', () => {
    const e = new Error('boom');
    expect(stripPrototypePolluters(e)).toBe(e);
  });

  it('leaves class instances untouched', () => {
    class Money {
      constructor(
        public amount: number,
        public currency: string
      ) {}
    }
    const m = new Money(1500, 'USD');
    expect(stripPrototypePolluters(m)).toBe(m);
  });

  it('handles cycles without infinite recursion', () => {
    const a: Record<string, unknown> = { name: 'a' };
    const b: Record<string, unknown> = { name: 'b' };
    a.peer = b;
    b.peer = a;
    // Should not stack-overflow.
    const out = stripPrototypePolluters(a);
    expect(out).toBe(a); // no polluters → identical reference
  });
});
