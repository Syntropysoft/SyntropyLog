/**
 * FILE: src/config.schema.ts
 * DESCRIPTION: Defines the Zod validation schemas for the entire library's configuration.
 * These schemas are the single source of truth for the configuration's structure and types.
 */

import { z } from 'zod';
import { Transport } from './logger/transports/Transport';

/** Schema for logger options, including serialization and pretty printing. */
const loggerOptionsSchema = z
  .object({
    name: z.string().optional(),
    level: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .optional(),
    serviceName: z.string().optional(),
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
    serializerTimeoutMs: z.number().int().positive().optional().default(50),

    /** Configuration for pretty printing logs in development. */
    prettyPrint: z
      .object({
        enabled: z.boolean().optional().default(false),
      })
      .optional(),
  })
  .optional();

/** Reusable schema for retry options. */
const retryOptionsSchema = z.object({
  maxRetries: z.number().int().positive().optional(),
  retryDelay: z.number().int().positive().optional(),
}).optional();

/** Schema for a single Redis instance, using a discriminated union for different modes. */
export const redisInstanceConfigSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('single'),
    instanceName: z.string(),
    url: z.string().url(),
    retryOptions: retryOptionsSchema,
    // --- NEW: Granular Logging Configuration for Redis ---
    logging: z.object({
        /** Level for successful commands. @default 'debug' */
        onSuccess: z.enum(['trace', 'debug', 'info']).default('debug'),
        /** Level for failed commands. @default 'error' */
        onError: z.enum(['warn', 'error', 'fatal']).default('error'),
        /** Whether to log command parameters. @default true */
        logCommandValues: z.boolean().default(true),
        /** Whether to log the return value of commands. @default false */
        logReturnValue: z.boolean().default(false),
    }).optional(),
  }),
  // Apply the same 'logging' object structure to 'sentinel' and 'cluster' modes
  z.object({
    mode: z.literal('sentinel'),
    instanceName: z.string(),
    name: z.string(),
    sentinels: z.array(z.object({ host: z.string(), port: z.number() })),
    sentinelPassword: z.string().optional(),
    retryOptions: retryOptionsSchema,
    logging: z.object({
        onSuccess: z.enum(['trace', 'debug', 'info']).default('debug'),
        onError: z.enum(['warn', 'error', 'fatal']).default('error'),
        logCommandValues: z.boolean().default(true),
        logReturnValue: z.boolean().default(false),
    }).optional(),
  }),
  z.object({
    mode: z.literal('cluster'),
    instanceName: z.string(),
    rootNodes: z.array(z.object({ host: z.string(), port: z.number() })),
    logging: z.object({
        onSuccess: z.enum(['trace', 'debug', 'info']).default('debug'),
        onError: z.enum(['warn', 'error', 'fatal']).default('error'),
        logCommandValues: z.boolean().default(true),
        logReturnValue: z.boolean().default(false),
    }).optional(),
  }),
]);

/** Schema for the main Redis configuration block. */
export const redisConfigSchema = z.object({
  instances: z.array(redisInstanceConfigSchema),
}).optional();



/** Schema for a single HTTP client instance. */
export const httpInstanceConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('axios'), instanceName: z.string(), config: z.any().optional() }),
  z.object({ type: z.literal('fetch'), instanceName: z.string(), config: z.any().optional() }),
  z.object({ type: z.literal('got'), instanceName: z.string(), config: z.any().optional() }),
]);

/**
 * Schema for the main HTTP configuration block.
 * It now only contains the list of instances to create.
 * All logging and masking is handled globally.
 */
export const httpConfigSchema = z
  .object({
    instances: z.array(httpInstanceConfigSchema),
    // --- REMOVED ---
    // logRequestHeaders, logRequestBody, sensitiveHeaders, etc., are no longer needed here.
    // This will be controlled by the global `logging` and `masking` configurations.
  })
  .optional();



// --- UPDATED: Centralized Masking Configuration Schema ---
/** Schema for a single field's masking configuration. */
const fieldMaskConfigSchema = z.object({
  /** The path to the field (e.g., "user.password") or a RegExp to match field names. */
  path: z.union([z.string(), z.instanceof(RegExp)]),
  /** The masking strategy: 'full' or 'partial'. */
  type: z.enum(['full', 'partial']),
  /** For 'partial' masking, the number of characters to show at the end. @default 4 */
  showLast: z.number().int().positive().optional(),
});

/** Schema for the main masking configuration block. */
const maskingConfigSchema = z
  .object({
    /** An array of field-specific masking configurations. */
    fields: z.array(fieldMaskConfigSchema).optional(),
    /** The character(s) to use for masking. Defaults to '******'. */
    maskChar: z.string().optional(),
    /** The maximum recursion depth for masking nested objects. Defaults to 10. */
    maxDepth: z.number().int().positive().optional(),
  })
  .optional();

/** The main schema for the entire SyntropyLog configuration. */
export const syntropyLogConfigSchema = z.object({
  logger: loggerOptionsSchema,
  redis: redisConfigSchema,
  http: httpConfigSchema,

  /** Centralized data masking configuration. */
  masking: maskingConfigSchema,

  context: z
    .object({
      correlationIdHeader: z.string().optional(),
    })
    .optional(),

  /** The maximum time in milliseconds to wait for a graceful shutdown. Defaults to 5000ms. */
  shutdownTimeout: z
    .number({
      description: 'The maximum time in ms to wait for a graceful shutdown.',
    })
    .int()
    .positive()
    .optional(),

  doctor: z
    .object({
      disableRules: z.array(z.string()).optional(),
    })
    .optional(),
});
