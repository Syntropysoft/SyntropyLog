/**
 * FILE: src/config.schema.ts
 * DESCRIPTION: Defines the Zod validation schemas for the entire library's configuration.
 * These schemas are the single source of truth for the configuration's structure and types.
 */

import { z } from 'zod';
import { Transport } from './logger/transports/Transport';
import { IHttpClientAdapter } from './http/adapters/adapter.types';
import { IBrokerAdapter } from './brokers/adapter.types';
import { MaskingStrategy } from './masking/MaskingEngine';

/**
 * @description Schema for logger-specific options, including serialization and transports.
 * @private
 */
const loggerOptionsSchema = z
  .object({
    name: z.string().optional(),
    level: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .optional(),
    serviceName: z.string().optional(),
    /**
     * An array of transport instances to be used by the logger, 
     * or a mapping of logger names (categories) to their respective transports.
     */
    transports: z
      .union([
        z.array(z.instanceof(Transport)),
        z.record(z.string(), z.array(z.instanceof(Transport))),
      ])
      .optional(),

    /**
     * A dictionary of custom serializer functions. The key is the field
     * to look for in the log object, and the value is the function that transforms it.
     */
    serializers: z
      .record(z.string(), z.function().args(z.any()).returns(z.string()))
      .optional(),
    /**
     * The maximum time in milliseconds a custom serializer can run before being timed out.
     * @default 50
     */
    serializerTimeoutMs: z.number().int().positive().default(50),

    /** Configuration for pretty printing logs in development. */
    prettyPrint: z
      .object({
        enabled: z.boolean().optional().default(false),
      })
      .optional(),
  })
  .optional();

/**
 * @description Reusable schema for retry options, commonly used in client configurations.
 * @private
 */
const retryOptionsSchema = z
  .object({
    maxRetries: z.number().int().positive().optional(),
    retryDelay: z.number().int().positive().optional(),
  })
  .optional();

/**
 * @description Schema for a single Redis instance, using a discriminated union for different connection modes.
 */
export const redisInstanceConfigSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('single'),
    instanceName: z.string(),
    url: z.string().url(),
    retryOptions: retryOptionsSchema,
    // --- NEW: Granular Logging Configuration for Redis ---
    logging: z
      .object({
        /** Level for successful commands. @default 'debug' */
        onSuccess: z.enum(['trace', 'debug', 'info']).default('debug'),
        /** Level for failed commands. @default 'error' */
        onError: z.enum(['warn', 'error', 'fatal']).default('error'),
        /** Whether to log command parameters. @default true */
        logCommandValues: z.boolean().default(true),
        /** Whether to log the return value of commands. @default false */
        logReturnValue: z.boolean().default(false),
      })
      .optional(),
  }),
  // Apply the same 'logging' object structure to 'sentinel' and 'cluster' modes
  z.object({
    mode: z.literal('sentinel'),
    instanceName: z.string(),
    name: z.string(),
    sentinels: z.array(z.object({ host: z.string(), port: z.number() })),
    sentinelPassword: z.string().optional(),
    retryOptions: retryOptionsSchema,
    logging: z
      .object({
        onSuccess: z.enum(['trace', 'debug', 'info']).default('debug'),
        onError: z.enum(['warn', 'error', 'fatal']).default('error'),
        logCommandValues: z.boolean().default(true),
        logReturnValue: z.boolean().default(false),
      })
      .optional(),
  }),
  z.object({
    mode: z.literal('cluster'),
    instanceName: z.string(),
    rootNodes: z.array(z.object({ host: z.string(), port: z.number() })),
    logging: z
      .object({
        /** Level for successful commands. @default 'debug' */
        onSuccess: z.enum(['trace', 'debug', 'info']).default('debug'),
        /** Level for failed commands. @default 'error' */
        onError: z.enum(['warn', 'error', 'fatal']).default('error'),
        /** Whether to log command parameters. @default true */
        logCommandValues: z.boolean().default(true),
        /** Whether to log the return value of commands. @default false */
        logReturnValue: z.boolean().default(false),
      })
      .optional(),
  }),
]);

/**
 * @description Schema for the main Redis configuration block, containing all Redis instances.
 */
export const redisConfigSchema = z
  .object({
    /** An array of Redis instance configurations. */
    instances: z.array(redisInstanceConfigSchema),
    /** The name of the default Redis instance to use when no name is provided to `getInstance()`. */
    default: z.string().optional(),
  })
  .optional();

/**
 * @description Schema for a single HTTP client instance.
 */
export const httpInstanceConfigSchema = z.object({
  instanceName: z.string(),
  adapter: z.custom<IHttpClientAdapter>((val) => {
    return (
      typeof val === 'object' &&
      val !== null &&
      'request' in val &&
      typeof (val as any).request === 'function'
    );
  }, "The provided adapter is invalid. It must be an object with a 'request' method."),
  isDefault: z.boolean().optional(),
  propagate: z.array(z.string()).optional(),
  propagateFullContext: z.boolean().optional(),
  logging: z
    .object({
      onSuccess: z.enum(['trace', 'debug', 'info']).default('info'),
      onError: z.enum(['warn', 'error', 'fatal']).default('error'),
      logSuccessBody: z.boolean().default(false),
      logSuccessHeaders: z.boolean().default(false),
      onRequest: z.enum(['trace', 'debug', 'info']).default('info'),
      logRequestBody: z.boolean().default(false),
      logRequestHeaders: z.boolean().default(false),
    })
    .partial()
    .optional(),
});

/**
 * @description Schema for the main HTTP configuration block.
 */
export const httpConfigSchema = z
  .object({
    /** An array of HTTP client instance configurations. */
    instances: z.array(httpInstanceConfigSchema),
    /** The name of the default HTTP client instance to use when no name is provided to `getInstance()`. */
    default: z.string().optional(),
  })
  .optional();

/**
 * @description Schema for the main data masking configuration block.
 */
const maskingConfigSchema = z
  .object({
    /** Array of masking rules with patterns and strategies. */
    rules: z.array(z.object({
      /** Regex pattern to match field names */
      pattern: z.union([z.string(), z.instanceof(RegExp)]),
      /** Masking strategy to apply */
      strategy: z.nativeEnum(MaskingStrategy),
      /** Whether to preserve original length */
      preserveLength: z.boolean().optional(),
      /** Character to use for masking */
      maskChar: z.string().optional(),
      /** Custom masking function (for CUSTOM strategy) */
      customMask: z.function().args(z.string()).returns(z.string()).optional(),
    })).optional(),
    /** Default mask character */
    maskChar: z.string().optional(),
    /** Whether to preserve original length by default */
    preserveLength: z.boolean().optional(),
    /** Enable default rules for common data types */
    enableDefaultRules: z.boolean().optional(),
  })
  .optional();

/**
 * @description Schema for a single message broker client instance.
 * It validates that a valid `IBrokerAdapter` is provided.
 * @private
 */
export const brokerInstanceConfigSchema = z.object({
  instanceName: z.string(),
  adapter: z.custom<IBrokerAdapter>((val) => {
    return (
      typeof val === 'object' &&
      val !== null &&
      typeof (val as any).publish === 'function' &&
      typeof (val as any).subscribe === 'function'
    );
  }, 'The provided broker adapter is invalid.'),
  /**
   * An array of context keys to propagate as message headers/properties.
   * To propagate all keys, provide an array with a single wildcard: `['*']`.
   * If not provided, only `correlationId` and `transactionId` are propagated by default.
   */
  propagate: z.array(z.string()).optional(),

  /**
   * @deprecated Use `propagate` instead.
   * If true, propagates the entire asynchronous context map as headers.
   * If false (default), only propagates `correlationId` and `transactionId`.
   */
  propagateFullContext: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

/**
 * @description Schema for the main message broker configuration block.
 */
export const brokerConfigSchema = z
  .object({
    /** An array of broker client instance configurations. */
    instances: z.array(brokerInstanceConfigSchema),
    /** The name of the default broker instance to use when no name is provided to `getInstance()`. */
    default: z.string().optional(),
  })
  .optional();

/**
 * @description Schema for the declarative logging matrix.
 * It controls which context properties are included in the final log output based on the log level.
 * @private
 */
const loggingMatrixSchema = z
  .object({
    /** An array of context keys to include in logs by default. Can be overridden by level-specific rules. */
    default: z.array(z.string()).optional(),
    /** An array of context keys to include for 'trace' level logs. Use `['*']` to include all context properties. */
    trace: z.array(z.string()).optional(),
    /** An array of context keys to include for 'debug' level logs. Use `['*']` to include all context properties. */
    debug: z.array(z.string()).optional(),
    /** An array of context keys to include for 'info' level logs. Use `['*']` to include all context properties. */
    info: z.array(z.string()).optional(),
    /** An array of context keys to include for 'warn' level logs. Use `['*']` to include all context properties. */
    warn: z.array(z.string()).optional(),
    /** An array of context keys to include for 'error' level logs. Use `['*']` to include all context properties. */
    error: z.array(z.string()).optional(),
    /** An array of context keys to include for 'fatal' level logs. Use `['*']` to include all context properties. */
    fatal: z.array(z.string()).optional(),
  })
  .optional();

/**
 * @description The main schema for the entire SyntropyLog configuration.
 * This is the single source of truth for validating the user's configuration object.
 */
export const syntropyLogConfigSchema = z.object({
  /** Logger-specific configuration. */
  logger: loggerOptionsSchema,

  /** Declarative matrix to control context data in logs. */
  loggingMatrix: loggingMatrixSchema,

  /** Redis client configuration. */
  redis: redisConfigSchema,
  /** HTTP client configuration. */
  http: httpConfigSchema,
  /** Message broker client configuration. */
  brokers: brokerConfigSchema,

  /** Centralized data masking configuration. */
  masking: maskingConfigSchema,

  /** Context propagation configuration. */
  context: z
    .object({
      /** The HTTP header name to use for the correlation ID. @default 'x-correlation-id' */
      correlationIdHeader: z.string().optional(),
      /** The HTTP header name to use for the external transaction/trace ID. @default 'x-trace-id' */
      transactionIdHeader: z.string().optional(),
    })
    .optional(),

  /**
   * The maximum time in milliseconds to wait for a graceful shutdown before timing out.
   * @default 5000
   */
  shutdownTimeout: z
    .number({
      description: 'The maximum time in ms to wait for a graceful shutdown.',
    })
    .int()
    .positive()
    .optional(),


});
