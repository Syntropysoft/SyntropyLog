/**
 * FILE: tests/config/validators.test.ts
 * Unit tests for primitive validators in validators.ts.
 * Targets the uncovered lines: 34 (isRegExp), 71 (isStringOrRegExp),
 * 80-81 (isInstance), 90-102 (recordOf).
 */
import { describe, it, expect } from 'vitest';
import {
  isString,
  isNumber,
  isBoolean,
  isFunction,
  isRegExp,
  isPositiveInt,
  oneOf,
  isStringOrRegExp,
  isRecord,
  isInstance,
  recordOf,
} from '../../src/config/validators';

describe('Primitive validators', () => {
  describe('isString', () => {
    it('accepts a string', () => expect(isString('hello').ok).toBe(true));
    it('rejects a number', () => expect(isString(42).ok).toBe(false));
    it('rejects null', () => expect(isString(null).ok).toBe(false));
  });

  describe('isNumber', () => {
    it('accepts a number', () => expect(isNumber(3.14).ok).toBe(true));
    it('rejects NaN', () => expect(isNumber(NaN).ok).toBe(false));
    it('rejects a string', () => expect(isNumber('1').ok).toBe(false));
  });

  describe('isBoolean', () => {
    it('accepts true', () => expect(isBoolean(true).ok).toBe(true));
    it('accepts false', () => expect(isBoolean(false).ok).toBe(true));
    it('rejects 0', () => expect(isBoolean(0).ok).toBe(false));
  });

  describe('isFunction', () => {
    it('accepts an arrow function', () =>
      expect(isFunction(() => 0).ok).toBe(true));
    it('accepts a named function', () =>
      expect(isFunction(function foo() {}).ok).toBe(true));
    it('rejects a string', () => expect(isFunction('fn').ok).toBe(false));
    it('rejects null', () => expect(isFunction(null).ok).toBe(false));
  });

  describe('isRegExp', () => {
    it('accepts a RegExp literal', () =>
      expect(isRegExp(/foo/i).ok).toBe(true));
    it('accepts new RegExp()', () =>
      expect(isRegExp(new RegExp('bar')).ok).toBe(true));
    it('rejects a string pattern', () => {
      const r = isRegExp('foo');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toContain('RegExp instance');
    });
    it('rejects null', () => expect(isRegExp(null).ok).toBe(false));
  });

  describe('isPositiveInt', () => {
    it('accepts 1', () => expect(isPositiveInt(1).ok).toBe(true));
    it('accepts 1000', () => expect(isPositiveInt(1000).ok).toBe(true));
    it('rejects 0', () => expect(isPositiveInt(0).ok).toBe(false));
    it('rejects -1', () => expect(isPositiveInt(-1).ok).toBe(false));
    it('rejects 1.5 (float)', () => expect(isPositiveInt(1.5).ok).toBe(false));
    it('rejects a string', () => expect(isPositiveInt('1').ok).toBe(false));
  });

  describe('oneOf', () => {
    const validator = oneOf(['a', 'b', 'c'] as const);
    it('accepts a valid value', () => expect(validator('a').ok).toBe(true));
    it('rejects an invalid value', () => {
      const r = validator('d');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toContain('must be one of');
    });
  });

  describe('isStringOrRegExp', () => {
    it('accepts a string', () => {
      const r = isStringOrRegExp('hello');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe('hello');
    });
    it('accepts a RegExp', () => {
      const r = isStringOrRegExp(/world/);
      expect(r.ok).toBe(true);
    });
    it('rejects a number', () => {
      const r = isStringOrRegExp(42);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toContain('expected string or RegExp');
    });
    it('rejects null', () => expect(isStringOrRegExp(null).ok).toBe(false));
  });

  describe('isRecord', () => {
    it('accepts a plain object', () =>
      expect(isRecord({ a: 1 }).ok).toBe(true));
    it('rejects an array', () => {
      const r = isRecord([]);
      expect(r.ok).toBe(false);
    });
    it('rejects null', () => expect(isRecord(null).ok).toBe(false));
    it('rejects a string', () => expect(isRecord('str').ok).toBe(false));
  });

  describe('isInstance', () => {
    class Foo {}
    class Bar {}
    const isFoo = isInstance(Foo, 'Foo');

    it('accepts an instance of the given class', () => {
      expect(isFoo(new Foo()).ok).toBe(true);
    });

    it('rejects an instance of a different class', () => {
      const r = isFoo(new Bar());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toContain('Foo');
    });

    it('should use constructor name if no custom name is provided', () => {
      const isBarNoName = isInstance(Bar);
      const r = isBarNoName(new Foo());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toContain('Bar');
    });

    it('rejects a plain string', () => {
      expect(isFoo('string').ok).toBe(false);
    });

    it('rejects null', () => {
      expect(isFoo(null).ok).toBe(false);
    });
  });

  describe('recordOf', () => {
    const recordOfStrings = recordOf(isString);

    it('accepts a record of valid values', () => {
      const r = recordOfStrings({ a: 'hello', b: 'world' });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual({ a: 'hello', b: 'world' });
    });

    it('rejects non-object input', () => {
      expect(recordOfStrings('not-an-object').ok).toBe(false);
    });

    it('collects errors from invalid values', () => {
      const r = recordOfStrings({ a: 'ok', b: 123, c: 'ok2', d: true });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.errors.some((e) => e.startsWith('b:'))).toBe(true);
        expect(r.errors.some((e) => e.startsWith('d:'))).toBe(true);
      }
    });

    it('rejects an array', () => {
      expect(recordOfStrings([]).ok).toBe(false);
    });

    it('accepts an empty record', () => {
      expect(recordOfStrings({}).ok).toBe(true);
    });
  });
});
