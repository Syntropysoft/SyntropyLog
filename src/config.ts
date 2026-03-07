/**
 * @file src/config.ts
 * @description Defines and exports the configuration types for the library.
 * These types are now explicitly defined for better TypeScript intellisense and autocompletion,
 * while still using Zod schemas for runtime validation.
 */

import { z } from 'zod';
import {
  syntropyLogConfigSchema,
  redisInstanceConfigSchema,
  redisConfigSchema,
} from './config.schema';

/**
 * @description The complete, top-level configuration type for the SyntropyLog framework.
 * This type is inferred from the main Zod schema and represents the entire valid configuration object.
 */
export type SyntropyLogConfig = z.infer<typeof syntropyLogConfigSchema>;

/**
 * @description The configuration type for a single Redis instance.
 */
export type RedisInstanceConfig = z.infer<typeof redisInstanceConfigSchema>;

/**
 * @description The configuration type for the global Redis settings block.
 * `NonNullable` is used to ensure it's always an object, even if optional in the main config.
 */
export type SyntropyRedisConfig = NonNullable<
  z.infer<typeof redisConfigSchema>
>;

/**
 * @description Defines the properties of a Redis instance that can be reconfigured dynamically.
 * Connection-related properties (like url, mode, etc.) are intentionally omitted to prevent
 * changes that would require a full client restart.
 */
export type RedisInstanceReconfigurableConfig = Pick<
  RedisInstanceConfig,
  'instanceName' | 'logging'
>;
