/**
 * @file src/config/validators.ts
 * @description Primitive validators as pure functions.
 * Each validator is `(unknown) => Result<T>`. Zero dependencies.
 */

import { Result, Validator, ok, err } from './Result';

// ─── Primitive type guards ────────────────────────────────────────────────────

export const isString: Validator<string> = (input) =>
  typeof input === 'string'
    ? ok(input)
    : err(`expected string, got ${typeof input}`);

export const isNumber: Validator<number> = (input) =>
  typeof input === 'number' && !Number.isNaN(input)
    ? ok(input)
    : err(`expected number, got ${typeof input}`);

export const isBoolean: Validator<boolean> = (input) =>
  typeof input === 'boolean'
    ? ok(input)
    : err(`expected boolean, got ${typeof input}`);

// A callable that accepts anything — avoids the banned `Function` type
export type AnyCallable = (...args: unknown[]) => unknown;

export const isFunction: Validator<AnyCallable> = (input) =>
  typeof input === 'function'
    ? ok(input as AnyCallable)
    : err(`expected function, got ${typeof input}`);
export const isRegExp: Validator<RegExp> = (input) =>
  input instanceof RegExp ? ok(input) : err('expected RegExp instance');

// ─── Numeric constraints ──────────────────────────────────────────────────────

/** Integer ≥ 1 */
export const isPositiveInt: Validator<number> = (input) => {
  const r = isNumber(input);
  if (!r.ok) return r;
  if (!Number.isInteger(r.value) || r.value < 1)
    return err(`must be a positive integer (>= 1), got ${r.value}`);
  return ok(r.value);
};

// ─── Enum / union ─────────────────────────────────────────────────────────────

/** Succeeds only if the value is strictly equal to one of the provided options. */
export const oneOf =
  <T extends string | number>(values: readonly T[]): Validator<T> =>
  (input) =>
    (values as readonly unknown[]).includes(input)
      ? ok(input as T)
      : err(`must be one of [${values.join(', ')}], got ${String(input)}`);

// ─── String / pattern union ──────────────────────────────────────────────────

/** Accepts either a string or a RegExp. */
export const isStringOrRegExp: Validator<string | RegExp> = (input) =>
  typeof input === 'string'
    ? ok(input)
    : input instanceof RegExp
      ? ok(input)
      : err(`expected string or RegExp, got ${typeof input}`);

// ─── Object predicate ────────────────────────────────────────────────────────

/** Passes if value is a non-null, non-array object. Does NOT validate fields. */
export const isRecord: Validator<Record<string, unknown>> = (input) =>
  input !== null && typeof input === 'object' && !Array.isArray(input)
    ? ok(input as Record<string, unknown>)
    : err(`expected object, got ${input === null ? 'null' : typeof input}`);

// ─── Instance check ──────────────────────────────────────────────────────────

/** Passes if value is an instance of the given class. */
export const isInstance =
  <T>(ctor: new (...args: unknown[]) => T, name?: string): Validator<T> =>
  (input) =>
    input instanceof ctor
      ? ok(input)
      : err(`must be an instance of ${name ?? ctor.name}`);

// ─── Record with validated values (string keys) ──────────────────────────────

export const recordOf =
  <V>(valueValidator: Validator<V>): Validator<Record<string, V>> =>
  (input) => {
    const r = isRecord(input);
    if (!r.ok) return r as Result<Record<string, V>>;
    const out: Record<string, V> = {};
    const errors: string[] = [];
    for (const [key, val] of Object.entries(r.value)) {
      const rv = valueValidator(val);
      if (rv.ok) {
        out[key] = rv.value;
      } else {
        errors.push(...rv.errors.map((e) => `${key}: ${e}`));
      }
    }
    return errors.length ? { ok: false, errors } : ok(out);
  };
