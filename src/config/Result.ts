/**
 * @file src/config/Result.ts
 * @description Railway-Oriented Programming (ROP) Result type and composable combinators.
 * Zero dependencies. Every combinator is a pure function.
 */

// ─── Core types ──────────────────────────────────────────────────────────────

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly errors: E[] };
export type Result<T, E = string> = Ok<T> | Err<E>;

/** Validator signature: any unknown input → typed Result */
export type Validator<T, E = string> = (input: unknown) => Result<T, E>;

// ─── Constructors ─────────────────────────────────────────────────────────────

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(...errors: E[]): Err<E> => ({ ok: false, errors });

// ─── Combinators ─────────────────────────────────────────────────────────────

/**
 * If the input is undefined or null, succeeds with undefined.
 * Otherwise delegates to the wrapped validator.
 */
export const optional =
  <T, E = string>(validator: Validator<T, E>): Validator<T | undefined, E> =>
  (input) =>
    input === undefined || input === null ? ok(undefined) : validator(input);

/**
 * Runs v1, then if ok, runs v2 on the result value.
 */
export const chain =
  <A, B, E = string>(
    v1: Validator<A, E>,
    v2: Validator<B, E>
  ): Validator<B, E> =>
  (input) => {
    const r1 = v1(input);
    return r1.ok ? v2(r1.value) : r1;
  };

/**
 * Validates each value in an array with the given element validator.
 * Collects all errors across all elements.
 */
export const arrayOf =
  <T, E = string>(elementValidator: Validator<T, E>): Validator<T[], E> =>
  (input) => {
    if (!Array.isArray(input)) {
      return err('must be an array' as unknown as E);
    }
    const results: T[] = [];
    const errors: E[] = [];
    for (let i = 0; i < input.length; i++) {
      const r = elementValidator(input[i]);
      if (r.ok) {
        results.push(r.value);
      } else {
        errors.push(
          ...r.errors.map((e) => `[${i}]: ${String(e)}` as unknown as E)
        );
      }
    }
    return errors.length > 0 ? { ok: false, errors } : ok(results);
  };

/**
 * Validates an object against a schema of validators.
 * Unknown keys are passed through.
 * Collects all errors across all fields.
 */
export const object =
  <T extends Record<string, unknown>, E = string>(schema: {
    [K in keyof T]: Validator<T[K], E>;
  }): Validator<T, E> =>
  (input) => {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      return err('must be an object' as unknown as E);
    }
    const raw = input as Record<string, unknown>;
    const result: Record<string, unknown> = { ...raw };
    const errors: E[] = [];

    for (const key of Object.keys(schema) as (keyof T & string)[]) {
      const validator = schema[key];
      const r = validator(raw[key]);
      if (r.ok) {
        result[key] = r.value;
      } else {
        errors.push(
          ...r.errors.map((e) => `${key}: ${String(e)}` as unknown as E)
        );
      }
    }

    return errors.length > 0 ? { ok: false, errors } : ok(result as T);
  };
