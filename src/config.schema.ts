/**
 * FILE: src/config.schema.ts
 * DESCRIPTION: Defines the Zod validation schemas for the entire library's configuration.
 * These schemas are the single source of truth for the configuration's structure and types.
 */

import * as v from 'valibot';
import { Transport } from './logger/transports/Transport';
import { MaskingStrategy } from './masking/MaskingEngine';

// --- Pure predicates for custom validators (same input → same output, no side effects) ---

/**
 * @description Schema for a transport descriptor: enable the transport only when current env is in `env`.
 * @private
 */
const transportDescriptorSchema = v.object({
  transport: v.custom<Transport>(
    (val) => val instanceof Transport,
    'Must be an instance of Transport'
  ),
  /** When set, the transport is only enabled when the environment (e.g. NODE_ENV) is in this list. */
  env: v.optional(v.union([v.string(), v.array(v.string())])),
});

/**
 * @description A transport entry is either a Transport instance or a descriptor with optional env filter.
 * @private
 */
const transportEntrySchema = v.union([
  v.custom<Transport>(
    (val) => val instanceof Transport,
    'Must be an instance of Transport'
  ),
  transportDescriptorSchema,
]);

/**
 * @description Schema for logger-specific options, including serialization and transports.
 * @private
 */
const loggerOptionsSchema = v.optional(
  v.object({
    name: v.optional(v.string()),
    level: v.optional(
      v.picklist([
        'audit',
        'fatal',
        'error',
        'warn',
        'info',
        'debug',
        'trace',
        'silent',
      ])
    ),
    serviceName: v.optional(v.string()),
    /**
     * The explicit environment name used to resolve conditional transports (e.g. 'development', 'production').
     * @default 'development'
     */
    environment: v.optional(v.string()),
    /**
     * Pool of transports by name. Use together with `env` to pick per-environment defaults.
     * When both transportList and env are set, this form is used instead of `transports`.
     */
    transportList: v.optional(
      v.record(
        v.string(),
        v.custom<Transport>(
          (val) => val instanceof Transport,
          'Must be an instance of Transport'
        )
      )
    ),
    /**
     * Per-environment list of transport names (keys from transportList) to use as default.
     * E.g. { development: ['consola'], production: ['consola', 'db'] }.
     * Used only when transportList is also set.
     */
    env: v.optional(v.record(v.string(), v.array(v.string()))),
    /**
     * Legacy: array of transport instances or descriptors { transport, env? },
     * or a mapping of logger names (categories) to such arrays.
     * Ignored when both transportList and env are set.
     */
    transports: v.optional(
      v.union([
        v.array(transportEntrySchema),
        v.record(v.string(), v.array(transportEntrySchema)),
      ])
    ),

    /**
     * The maximum time in milliseconds a custom serializer can run before being timed out.
     * @default 50
     */
    serializerTimeoutMs: v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(1)),
      50
    ),

    /** Configuration for pretty printing logs in development. */
    prettyPrint: v.optional(
      v.object({
        enabled: v.optional(v.boolean(), false),
      })
    ),
  })
);

// Removed Redis connection schemas

/**
 * @description Schema for the main data masking configuration block.
 */
const maskingConfigSchema = v.optional(
  v.object({
    /** Array of masking rules with patterns and strategies. */
    rules: v.optional(
      v.array(
        v.object({
          /** Regex pattern to match field names */
          pattern: v.union([v.string(), v.instance(RegExp)]),
          /** Masking strategy to apply */
          strategy: v.enum(MaskingStrategy),
          /** Whether to preserve original length */
          preserveLength: v.optional(v.boolean()),
          /** Character to use for masking */
          maskChar: v.optional(v.string()),
          /** Custom masking function (for CUSTOM strategy) */
          customMask: v.optional(
            v.custom<(val: string) => string>(
              (val) => typeof val === 'function',
              'Must be a function'
            )
          ),
        })
      )
    ),
    /** Default mask character */
    maskChar: v.optional(v.string()),
    /** Whether to preserve original length by default */
    preserveLength: v.optional(v.boolean()),
    /** Enable default rules for common data types */
    enableDefaultRules: v.optional(v.boolean()),
    /**
     * Max ms for evaluating each custom rule regex; if exceeded, no match and a warning is logged.
     * @default 100
     */
    regexTimeoutMs: v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(1)),
      100
    ),
  })
);

/**
 * @description Schema for the declarative logging matrix.
 * It controls which context properties are included in the final log output based on the log level.
 * @private
 */
const loggingMatrixSchema = v.optional(
  v.object({
    /** An array of context keys to include in logs by default. Can be overridden by level-specific rules. */
    default: v.optional(v.array(v.string())),
    /** An array of context keys to include for 'trace' level logs. Use `['*']` to include all context properties. */
    trace: v.optional(v.array(v.string())),
    /** An array of context keys to include for 'debug' level logs. Use `['*']` to include all context properties. */
    debug: v.optional(v.array(v.string())),
    /** An array of context keys to include for 'info' level logs. Use `['*']` to include all context properties. */
    info: v.optional(v.array(v.string())),
    /** An array of context keys to include for 'warn' level logs. Use `['*']` to include all context properties. */
    warn: v.optional(v.array(v.string())),
    /** An array of context keys to include for 'error' level logs. Use `['*']` to include all context properties. */
    error: v.optional(v.array(v.string())),
    /** An array of context keys to include for 'fatal' level logs. Use `['*']` to include all context properties. */
    fatal: v.optional(v.array(v.string())),
  })
);

/**
 * @description The main schema for the entire SyntropyLog configuration.
 * This is the single source of truth for validating the user's configuration object.
 */
export const syntropyLogConfigSchema = v.object({
  /** Logger-specific configuration. */
  logger: loggerOptionsSchema,

  /** Declarative matrix to control context data in logs. */
  loggingMatrix: loggingMatrixSchema,

  /** Centralized data masking configuration. */
  masking: maskingConfigSchema,

  /** Context propagation configuration. */
  context: v.optional(
    v.object({
      /** The HTTP header name to use for the correlation ID. @default 'x-correlation-id' */
      correlationIdHeader: v.optional(v.string()),
      /** The HTTP header name to use for the external transaction/trace ID. @default 'x-trace-id' */
      transactionIdHeader: v.optional(v.string()),
    })
  ),

  /**
   * The maximum time in milliseconds to wait for a graceful shutdown before timing out.
   * @default 5000
   */
  shutdownTimeout: v.optional(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(1),
      v.description('The maximum time in ms to wait for a graceful shutdown.')
    )
  ),
});
