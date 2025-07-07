/**
 * FILE: src/types/redis.ts
 * DESCRIPTION: Defines legacy types for Redis configuration.
 * @deprecated These types are from a previous version and are no longer in use.
 * The source of truth for configuration is now defined by Zod schemas in `src/config.schema.ts`
 * and inferred in `src/config.ts`. This file may be removed in a future version.
 */

import type { RedisClientOptions, RedisClusterOptions } from 'redis';

/**
 * @deprecated Use types from `src/config.ts` instead.
 * Base configuration for a Redis instance.
 */
export interface BaseBeaconRedisInstanceUserConfig {
  instanceName: string;
  useMock?: boolean;
  redactLoggedValues?: boolean;
  logFullReturnValue?: boolean;
}
/**
 * @deprecated Use types from `src/config.ts` instead.
 * Configuration for a single-node Redis instance.
 */
export interface SingleNodeRedisUserConfig
  extends BaseBeaconRedisInstanceUserConfig {
  mode: 'single';
  url: string;
  options?: Omit<RedisClientOptions, 'url' | 'database'> & {
    database?: number;
  };
}
/**
 * @deprecated Use types from `src/config.ts` instead.
 * Configuration for a Redis Sentinel setup.
 */
export interface SentinelRedisUserConfig
  extends BaseBeaconRedisInstanceUserConfig {
  mode: 'sentinel';
  name: string;
  sentinels: Array<{ host: string; port: number }>;
  options?: Omit<RedisClientOptions, 'sentinels' | 'name'>;
}
/**
 * @deprecated Use types from `src/config.ts` instead.
 * Configuration for a Redis Cluster setup.
 */
export interface ClusterRedisUserConfig
  extends BaseBeaconRedisInstanceUserConfig {
  mode: 'cluster';
  rootNodes: Array<{ host: string; port: number }>; // Use a literal object type for better compatibility
  options?: Omit<RedisClusterOptions, 'rootNodes'>;
}
/**
 * @deprecated Use types from `src/config.ts` instead.
 * A union type representing any possible Redis instance configuration.
 */
export type AnyBeaconRedisInstanceUserConfig =
  | SingleNodeRedisUserConfig
  | SentinelRedisUserConfig
  | ClusterRedisUserConfig;

/**
 * @deprecated Use `BeaconRedisConfig` from `src/config.ts` instead.
 * Represents the top-level Redis configuration.
 */
export interface RedisConfig {
  instances?: AnyBeaconRedisInstanceUserConfig[];
  defaultRedactLoggedValues?: boolean;
  defaultLogFullReturnValue?: boolean;
} 