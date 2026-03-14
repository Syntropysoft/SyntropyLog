/**
 * @file src/config/config.validator.ts
 * @description Zero-dependency config validator using ROP combinators.
 * Replaces valibot for runtime config validation while keeping identical error quality.
 */

import { ok, err, optional, object, arrayOf, Result } from './Result';
import {
  isString,
  isBoolean,
  isPositiveInt,
  isFunction,
  isStringOrRegExp,
  recordOf,
  oneOf,
} from './validators';
import { Transport } from '../logger/transports/Transport';
export { Transport };
import { MaskingStrategy } from '../masking/MaskingEngine';
import type { SyntropyLogConfig } from '../config.schema';

// ─── Custom error ─────────────────────────────────────────────────────────────

export class ConfigValidationError extends Error {
  public readonly issues: string[];

  constructor(issues: string[]) {
    super(
      `[SyntropyLog] Configuration validation failed:\n${issues.map((i) => `  • ${i}`).join('\n')}`
    );
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

// ─── Field validators ─────────────────────────────────────────────────────────

const LOG_LEVELS = [
  'audit',
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;
const validateLogLevel = oneOf(LOG_LEVELS);

// Transport is abstract; use a type guard instead of isInstance
const validateTransport = (input: unknown): Result<Transport> =>
  input instanceof Transport
    ? ok(input)
    : err('must be an instance of Transport');

const validateTransportEntry = (input: unknown): Result<unknown> => {
  // Either a Transport instance directly...
  const r1 = validateTransport(input);
  if (r1.ok) return r1;
  // ...or a descriptor object { transport, env? }
  return object({
    transport: validateTransport,
    env: optional(
      (v: unknown): Result<string | string[]> =>
        typeof v === 'string'
          ? ok(v)
          : Array.isArray(v)
            ? ok(v)
            : err('env must be a string or string[]')
    ),
  })(input);
};

const validateMaskingRule = object({
  pattern: isStringOrRegExp,
  strategy: oneOf(Object.values(MaskingStrategy)),
  preserveLength: optional(isBoolean),
  maskChar: optional(isString),
  customMask: optional(isFunction),
});

const validateLoggerOptions = object({
  name: optional(isString),
  level: optional(validateLogLevel),
  serviceName: optional(isString),
  environment: optional(isString),
  transportList: optional(recordOf(validateTransport)),
  env: optional(recordOf(arrayOf(isString))),
  transports: optional((input: unknown): Result<unknown> => {
    if (Array.isArray(input)) {
      const r = arrayOf(validateTransportEntry)(input);
      return r.ok ? ok(r.value) : r;
    }
    if (input !== null && typeof input === 'object') {
      // record of arrays
      return ok(input);
    }
    return err('transports must be an array or a record of arrays');
  }),
  serializerTimeoutMs: optional(isPositiveInt),
  prettyPrint: optional(
    object({
      enabled: optional(isBoolean),
    })
  ),
});

const validateMasking = object({
  rules: optional(arrayOf(validateMaskingRule)),
  maskChar: optional(isString),
  preserveLength: optional(isBoolean),
  enableDefaultRules: optional(isBoolean),
  regexTimeoutMs: optional(isPositiveInt),
  onMaskingError: optional(isFunction),
});

const validateLoggingMatrix = object({
  default: optional(arrayOf(isString)),
  trace: optional(arrayOf(isString)),
  debug: optional(arrayOf(isString)),
  info: optional(arrayOf(isString)),
  warn: optional(arrayOf(isString)),
  error: optional(arrayOf(isString)),
  fatal: optional(arrayOf(isString)),
});

const validateContext = object({
  correlationIdHeader: optional(isString),
  transactionIdHeader: optional(isString),
});

// ─── Root validator ───────────────────────────────────────────────────────────

const validateSyntropyLogConfig = object({
  logger: optional(validateLoggerOptions),
  loggingMatrix: optional(validateLoggingMatrix),
  masking: optional(validateMasking),
  context: optional(validateContext),
  shutdownTimeout: optional(isPositiveInt),
  onLogFailure: optional(isFunction),
  onTransportError: optional(isFunction),
  onStepError: optional(isFunction),
  onSerializationFallback: optional(isFunction),
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validates and parses a raw config object into a typed `SyntropyLogConfig`.
 * Throws `ConfigValidationError` with detailed messages if validation fails.
 */
export function parseConfig(raw: unknown): SyntropyLogConfig {
  const result = validateSyntropyLogConfig(raw);
  if (!result.ok) {
    throw new ConfigValidationError(result.errors);
  }
  return result.value as SyntropyLogConfig;
}
