/**
 * FILE: src/redis/redis.types.ts
 * DESCRIPTION: Defines fundamental types extracted from `redis@v4` for use throughout the library.
 */
import {
  RedisClientType,
  RedisClusterType,
  RedisFunctions,
  RedisModules,
  RedisScripts,
} from 'redis';

/**
 * @deprecated This type is a simplified placeholder. The source of truth for Redis configuration
 * is `RedisInstanceConfig` and `BeaconRedisConfig` in `src/config.ts`, which are derived from Zod schemas.
 * This type may be removed in a future version.
 */
export type RedisInstanceConfig = {
  instanceName: string;
  mode: 'single' | 'cluster' | 'sentinel';
  url?: string; // Required for 'single' mode
  // Other fields for cluster and sentinel modes would be added here.
};

/**
 * @deprecated Use `BeaconRedisConfig` from `src/config.ts` instead.
 */
export type RedisConfig = {
  instances: RedisInstanceConfig[];
};

/**
 * Represents a Redis client instance, which can be either a single-node (standalone) or a cluster client.
 * This is the core client type used internally by `BeaconRedis` and `RedisManager`.
 */
export type NodeRedisClient =
  | RedisClientType<RedisModules, RedisFunctions, RedisScripts>
  | RedisClusterType<RedisModules, RedisFunctions, RedisScripts>;

/**
 * Defines the structure of a Sorted Set member when returned with its score.
 */
export type RedisZMember = {
  score: number;
  value: string;
};

/**
 * Represents the native transaction (multi) object from the `redis` client.
 * It is extracted using `ReturnType` to ensure it always matches the native library's type.
 */
export type RedisTransaction = ReturnType<NodeRedisClient['multi']>;

/**
 * Represents the result of a transaction's execution (EXEC).
 * It is an array containing the results of each command within the transaction.
 */
export type TransactionResult = Awaited<ReturnType<RedisTransaction['exec']>>;
