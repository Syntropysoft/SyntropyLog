/**
 * FILE: src/config.ts
 * DESCRIPTION: Defines and exports the configuration types for the library.
 * These types are inferred directly from the Zod schemas defined in `config.schema.ts`,
 * ensuring that static types and runtime validation are always in sync.
 */

import { z } from 'zod';
import { syntropyLog } from './SyntropyLog';
import {
  syntropyLogConfigSchema, // Using the old name temporarily
  redisInstanceConfigSchema,
  httpInstanceConfigSchema,
  httpConfigSchema,
  redisConfigSchema,
} from './config.schema';

/** The complete, top-level configuration type for the SyntropyLog framework. */
export type SyntropyLogConfig = z.infer<typeof syntropyLogConfigSchema>;

/** The configuration type for a single Redis instance. */
export type RedisInstanceConfig = z.infer<typeof redisInstanceConfigSchema>;

/** The configuration type for a single HTTP client instance. */
export type HttpClientInstanceConfig = z.infer<typeof httpInstanceConfigSchema>;

/**
 * The configuration type for the global HTTP settings.
 * `NonNullable` is used to ensure it's always an object, even if optional in the main config.
 */
export type SyntropyHttpConfig = NonNullable<z.infer<typeof httpConfigSchema>>;

/**
 * The configuration type for the global Redis settings.
 * `NonNullable` is used to ensure it's always an object, even if optional in the main config.
 */
export type SyntropyRedisConfig = NonNullable<z.infer<typeof redisConfigSchema>>;

/**
 * Defines the properties of a Redis instance that can be reconfigured dynamically.
 * Connection-related properties (like url, mode, etc.) are intentionally omitted.
 */
export type RedisInstanceReconfigurableConfig = Pick<
  RedisInstanceConfig,
  'instanceName' | 'logging'
>;
