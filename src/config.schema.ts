/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * FILE: src/config.schema.ts
 * DESCRIPTION: Defines the Zod validation schemas for the entire library's configuration.
 * These schemas are the single source of truth for the configuration's structure and types.
 */

import { z } from 'zod';
import { Transport } from './logger/transports/Transport';
import { IHttpClientAdapter } from './http/adapters/adapter.types';
import { IBrokerAdapter } from './brokers/adapter.types';

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
     * An array of transport instances to be used by the logger.
     */
    transports: z.array(z.instanceof(Transport)).optional(),

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
    instances: z.array(redisInstanceConfigSchema),
  })
  .optional();

/** Schema for a single HTTP client instance. */
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

  /**
   * Logging settings specific to this HTTP client instance.
   */
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
    .partial() // Makes all properties within the logging object optional.
    .optional(),
});

/**
 * @description Schema for the main HTTP configuration block.
 */
export const httpConfigSchema = z
  .object({
    /** An array of HTTP client instance configurations. */
    instances: z.array(httpInstanceConfigSchema),
  })
  .optional();

/**
 * @description Schema for a single field's masking configuration.
 * @private
 */
const fieldMaskConfigSchema = z.object({
  /** The path to the field (e.g., "user.password") or a RegExp to match field names. */
  path: z.union([z.string(), z.instanceof(RegExp)]),
  /** The masking strategy: 'full' or 'partial'. */
  type: z.enum(['full', 'partial']),
  /** For 'partial' masking, the number of characters to show at the end. @default 4 */
  showLast: z.number().int().positive().optional(),
});

/**
 * @description Schema for the main data masking configuration block.
 */
const maskingConfigSchema = z
  .object({
    /** An array of sensitive field names or RegExp. */
    fields: z.array(z.union([z.string(), z.instanceof(RegExp)])).optional(),
    /** The character(s) to use for masking. If `style` is 'preserve-length', only the first character is used. */
    maskChar: z.string().optional(),
    /** The maximum recursion depth for masking nested objects. Defaults to 3. */
    maxDepth: z.number().int().positive().optional(),
    /**
     * The masking style.
     * - `fixed`: (Default) Replaces the value with a fixed-length string ('******'). Maximum security.
     * - `preserve-length`: Replaces the value with a mask string of the same length. Leaks length metadata.
     */
    style: z.enum(['fixed', 'preserve-length']).optional(),
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
});

/**
 * @description Schema for the main message broker configuration block.
 */
export const brokerConfigSchema = z
  .object({
    /** An array of broker client instance configurations. */
    instances: z.array(brokerInstanceConfigSchema),
  })
  .optional();

/**
 * @description The main schema for the entire SyntropyLog configuration.
 * This is the single source of truth for validating the user's configuration object.
 */
export const syntropyLogConfigSchema = z.object({
  /** Logger-specific configuration. */
  logger: loggerOptionsSchema,
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

  /** Configuration for the `syntropylog doctor` CLI tool. */
  doctor: z
    .object({
      /** An array of rule IDs to disable during a diagnostic run. */
      disableRules: z.array(z.string()).optional(),
    })
    .optional(),
});
