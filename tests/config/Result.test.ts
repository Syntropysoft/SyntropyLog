/**
 * FILE: tests/config/Result.test.ts
 * Unit tests for the ROP Result type and combinators.
 */
import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  optional,
  chain,
  arrayOf,
  object,
} from '../../src/config/Result';

describe('Result combinators', () => {
  describe('ok / err constructors', () => {
    it('ok creates a success Result', () => {
      const r = ok(42);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(42);
    });

    it('err creates a failure Result with one error', () => {
      const r = err('bad input');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors).toContain('bad input');
    });

    it('err accepts multiple errors', () => {
      const r = err('e1', 'e2');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors).toHaveLength(2);
    });
  });

  describe('optional', () => {
    const notUndefined = (v: unknown) =>
      typeof v === 'string' ? ok(v as string) : err('not a string');
    const optValidator = optional(notUndefined);

    it('passes through undefined', () => {
      expect(optValidator(undefined).ok).toBe(true);
    });

    it('passes through null as undefined', () => {
      expect(optValidator(null).ok).toBe(true);
    });

    it('delegates to wrapped validator for non-null', () => {
      const r = optValidator('hello');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe('hello');
    });

    it('returns error for invalid non-null value', () => {
      expect(optValidator(123).ok).toBe(false);
    });
  });

  describe('chain', () => {
    const parseNum = (v: unknown) =>
      typeof v === 'number' ? ok(v) : err('not a number');
    const positive = (v: unknown) =>
      typeof v === 'number' && v > 0 ? ok(v) : err('not positive');

    const posNum = chain(parseNum, positive);

    it('passes when both validators succeed', () => {
      const r = posNum(5);
      expect(r.ok).toBe(true);
    });

    it('fails on first validator failure', () => {
      const r = posNum('five');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toContain('not a number');
    });

    it('fails on second validator failure', () => {
      const r = posNum(-1);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toContain('not positive');
    });
  });

  describe('arrayOf', () => {
    const isStr = (v: unknown) =>
      typeof v === 'string' ? ok(v as string) : err('not a string');
    const arrValidator = arrayOf(isStr);

    it('accepts an empty array', () => {
      expect(arrValidator([]).ok).toBe(true);
    });

    it('validates all elements', () => {
      const r = arrValidator(['a', 'b']);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual(['a', 'b']);
    });

    it('rejects non-array input', () => {
      expect(arrValidator('not-array').ok).toBe(false);
    });

    it('collects errors from invalid elements with index', () => {
      const r = arrValidator(['ok', 123, 'ok2', 456]);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.errors.some((e) => e.includes('[1]'))).toBe(true);
        expect(r.errors.some((e) => e.includes('[3]'))).toBe(true);
      }
    });
  });

  describe('object', () => {
    const schema = {
      name: (v: unknown) =>
        typeof v === 'string' ? ok(v as string) : err('not a string'),
      age: (v: unknown) =>
        typeof v === 'number' ? ok(v as number) : err('not a number'),
    };
    const objValidator = object(schema);

    it('accepts a valid object', () => {
      const r = objValidator({ name: 'Alice', age: 30 });
      expect(r.ok).toBe(true);
    });

    it('rejects non-object input', () => {
      expect(objValidator('string').ok).toBe(false);
      expect(objValidator(null).ok).toBe(false);
      expect(objValidator([]).ok).toBe(false);
    });

    it('collects all field errors', () => {
      const r = objValidator({ name: 123, age: 'old' });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.errors.some((e) => e.startsWith('name:'))).toBe(true);
        expect(r.errors.some((e) => e.startsWith('age:'))).toBe(true);
      }
    });

    it('passes through unknown keys', () => {
      const r = objValidator({ name: 'Alice', age: 30, extra: 'ignored' });
      expect(r.ok).toBe(true);
      if (r.ok) expect((r.value as any).extra).toBe('ignored');
    });
  });
});
