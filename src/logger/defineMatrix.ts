/**
 * @file src/logger/defineMatrix.ts
 * @description Type-safe builder for a `LoggingMatrix`. Catches typos and unknown
 * context keys at compile time, without changing the runtime contract or the
 * shape of the existing `loggingMatrix` config field.
 *
 * Why this exists:
 *   The framework's declarative pitch is "declare what every log carries, the
 *   framework enforces it everywhere". But the underlying `LoggingMatrix` is
 *   `Partial<Record<string, string[]>>` — stringly-typed end to end. A typo in
 *   a key name silently drops a field from the output. `defineMatrix` flips
 *   that: the compiler refuses to build a matrix that references a key you
 *   didn't declare as valid.
 *
 * Drop-in compatible: returns `LoggingMatrix`. Pass it anywhere a matrix is
 * accepted (`init({ loggingMatrix: defineMatrix(...) })`,
 * `syntropyLog.reconfigureLoggingMatrix(defineMatrix(...))`).
 */

import type { LoggingMatrix } from '../types';
import type { LogLevel } from './levels';

/**
 * Levels the matrix may key on. Mirrors `LogLevel`, plus `default` which acts
 * as a fallback for any level not listed.
 */
export type MatrixLevel = LogLevel | 'default';

/**
 * Per-level value: any subset of the user-declared valid keys, or the
 * `'*'` wildcard meaning "all current context fields".
 */
export type MatrixFor<K extends string> = Partial<
  Record<MatrixLevel, readonly (K | '*')[]>
>;

/**
 * Declare which context keys are valid, then build a `LoggingMatrix` against
 * that set. Typos in any per-level array become compile errors:
 *
 * ```ts
 * const matrix = defineMatrix(
 *   ['correlationId', 'userId', 'tenantId', 'operation', 'errorCode'] as const,
 *   {
 *     default: ['correlationId'],
 *     info:    ['correlationId', 'userId', 'operation'],
 *     error:   ['correlationId', 'userId', 'operation', 'errorCode', 'tenantId'],
 *     fatal:   ['*'],
 *     // info: ['correlationId', 'userld'] // ❌ ts(2322) — 'userld' is not in the valid keys
 *   },
 * );
 *
 * await syntropyLog.init({ logger: { ... }, loggingMatrix: matrix });
 * ```
 *
 * The runtime payload is identical to writing the matrix inline. The compiler
 * is the only thing that gains; production behavior does not change.
 *
 * @param _validKeys A readonly tuple of context field names the matrix is
 *   allowed to reference. Pass with `as const` so the literal types survive
 *   into the type parameter. The argument is not read at runtime — it exists
 *   purely to anchor the generic.
 * @param matrix The per-level whitelist. Each array entry must be a member of
 *   `_validKeys` or the literal `'*'`.
 * @returns The same matrix, typed as `LoggingMatrix` for downstream consumers.
 */
export function defineMatrix<const K extends readonly string[]>(
  _validKeys: K,
  matrix: MatrixFor<K[number]>
): LoggingMatrix {
  return matrix as LoggingMatrix;
}
