/**
 * @file src/config.ts
 * @description Defines and exports the configuration types for the library.
 * These types are inferred directly from the Zod schemas defined in `config.schema.ts`,
 * ensuring that static types and runtime validation are always in sync.
 */

import { z } from 'zod';
import {
  syntropyLogConfigSchema,
  redisInstanceConfigSchema,
  redisConfigSchema,
  httpInstanceConfigSchema,
  httpConfigSchema,
  brokerInstanceConfigSchema,
  brokerConfigSchema,
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
 * @description The configuration type for a single HTTP client instance.
 */
export type HttpClientInstanceConfig = z.infer<typeof httpInstanceConfigSchema>;

/**
 * @description The configuration type for a single message broker client instance.
 */
export type BrokerInstanceConfig = z.infer<typeof brokerInstanceConfigSchema>;

/**
 * @description The configuration type for the global HTTP settings block.
 * `NonNullable` is used to ensure it's always an object, even if optional in the main config.
 */
export type SyntropyHttpConfig = NonNullable<z.infer<typeof httpConfigSchema>>;

/**
 * @description The configuration type for the global Redis settings block.
 * `NonNullable` is used to ensure it's always an object, even if optional in the main config.
 */
export type SyntropyRedisConfig = NonNullable<z.infer<typeof redisConfigSchema>>;

/**
 * @description The configuration type for the global message broker settings block.
 * `NonNullable` is used to ensure it's always an object, even if optional in the main config.
 */
export type SyntropyBrokerConfig = NonNullable<
  z.infer<typeof brokerConfigSchema>
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
