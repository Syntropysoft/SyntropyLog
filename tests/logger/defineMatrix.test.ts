import { describe, it, expect, expectTypeOf } from 'vitest';
import { defineMatrix } from '../../src/logger/defineMatrix';
import type { LoggingMatrix } from '../../src/types';

describe('defineMatrix', () => {
  it('returns the same shape as a hand-written LoggingMatrix', () => {
    const validKeys = [
      'correlationId',
      'userId',
      'tenantId',
      'operation',
      'errorCode',
    ] as const;

    const matrix = defineMatrix(validKeys, {
      default: ['correlationId'],
      info: ['correlationId', 'userId', 'operation'],
      warn: ['correlationId', 'userId', 'operation', 'errorCode'],
      error: ['correlationId', 'userId', 'operation', 'errorCode', 'tenantId'],
      fatal: ['*'],
    });

    expect(matrix).toEqual({
      default: ['correlationId'],
      info: ['correlationId', 'userId', 'operation'],
      warn: ['correlationId', 'userId', 'operation', 'errorCode'],
      error: ['correlationId', 'userId', 'operation', 'errorCode', 'tenantId'],
      fatal: ['*'],
    });
  });

  it('returns the wildcard array as-is', () => {
    const matrix = defineMatrix(['correlationId'] as const, {
      info: ['correlationId'],
      error: ['*'],
    });
    expect(matrix.error).toEqual(['*']);
  });

  it('allows partial coverage of log levels', () => {
    const matrix = defineMatrix(['correlationId', 'userId'] as const, {
      default: ['correlationId'],
      error: ['correlationId', 'userId'],
    });

    expect(matrix.info).toBeUndefined();
    expect(matrix.fatal).toBeUndefined();
    expect(matrix.default).toEqual(['correlationId']);
    expect(matrix.error).toEqual(['correlationId', 'userId']);
  });

  it('typed return is assignable to LoggingMatrix (interop check)', () => {
    const matrix = defineMatrix(['correlationId'] as const, {
      info: ['correlationId'],
    });
    expectTypeOf(matrix).toMatchTypeOf<LoggingMatrix>();
  });

  // The following block is a compile-time assertion via @ts-expect-error.
  // It encodes the central guarantee of defineMatrix: typos and unknown keys
  // become type errors at the call site. Vitest doesn't need to "run" this —
  // it executes (the values are typed as never) but the type checker is what
  // matters. If @ts-expect-error stops being applicable, tsc will flag this
  // test (TS2578: "Unused '@ts-expect-error' directive") and the build fails.
  describe('compile-time guarantees', () => {
    it('rejects unknown keys in per-level arrays', () => {
      const validKeys = ['correlationId', 'userId'] as const;

      defineMatrix(validKeys, {
        // @ts-expect-error 'userld' is a typo — not in the valid keys
        info: ['correlationId', 'userld'],
      });
    });

    it('rejects keys not declared in validKeys', () => {
      const validKeys = ['correlationId'] as const;

      defineMatrix(validKeys, {
        // @ts-expect-error 'tenantId' was not declared as valid
        error: ['correlationId', 'tenantId'],
      });
    });

    it('rejects unknown level names in the matrix object', () => {
      defineMatrix(['correlationId'] as const, {
        // @ts-expect-error 'critical' is not a LogLevel
        critical: ['correlationId'],
      });
    });
  });
});
