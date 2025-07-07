/**
 * FILE: src/redis/IBeaconRedis.ts
 * DESCRIPTION: Defines the contract for an instrumented Redis client.
 * It exposes common Redis commands and methods for lifecycle management.
 */

import { RedisZMember, TransactionResult } from './redis.types';

/**
 * Defines the contract for a Redis transaction (MULTI/EXEC).
 * All command methods are chainable, returning `this` to queue further commands.
 */
export interface IBeaconRedisTransaction {
  // String Commands
  get(key: string): this;
  set(key: string, value: any, ttlSeconds?: number): this;
  del(key: string | string[]): this;
  exists(keys: string | string[]): this;
  expire(key: string, seconds: number): this;
  ttl(key: string): this;
  incr(key: string): this;
  decr(key: string): this;
  incrBy(key: string, increment: number): this;
  decrBy(key: string, decrement: number): this;

  // Hash Commands
  hGet(key: string, field: string): this;
  hSet(key: string, field: string, value: any): this;
  hSet(key: string, fieldsAndValues: Record<string, any>): this;
  hGetAll(key: string): this;
  hDel(key: string, fields: string | string[]): this;
  hExists(key: string, field: string): this;
  hIncrBy(key: string, field: string, increment: number): this;

  // List Commands
  lPush(key: string, elements: any | any[]): this;
  rPush(key: string, elements: any | any[]): this;
  lPop(key: string): this;
  rPop(key: string): this;
  lRange(key: string, start: number, stop: number): this;
  lLen(key: string): this;
  lTrim(key: string, start: number, stop: number): this;

  // Set Commands
  sAdd(key: string, members: any | any[]): this;
  sMembers(key: string): this;
  sIsMember(key: string, member: any): this;
  sRem(key: string, members: any | any[]): this;
  sCard(key: string): this;

  // Sorted Set Commands
  zAdd(key: string, score: number, member: any): this;
  zAdd(key: string, members: { score: number; value: any }[]): this;
  zRange(key: string, min: string | number, max: string | number, options?: any): this;
  zRangeWithScores(key: string, min: string | number, max: string | number, options?: any): this;
  zRem(key: string, members: any | any[]): this;
  zCard(key: string): this;
  zScore(key: string, member: any): this;

  // Server Commands
  ping(message?: string): this;
  info(section?: string): this;

  /**
   * Executes all queued commands in the transaction.
   * @returns A promise that resolves with an array of results from each command.
   */
  exec(): Promise<TransactionResult>;

  /**
   * Discards the transaction, clearing all queued commands.
   * @returns A promise that resolves when the transaction is discarded.
   */
  discard(): Promise<void>;
}

/**
 * Defines the main interface for an instrumented Redis client, providing a unified API
 * for various Redis commands and lifecycle management.
 */
export interface IBeaconRedis {
  /**
   * Gets the configured name of this Redis instance.
   * @returns The instance name.
   */
  getInstanceName(): string;

  /**
   * Dynamically updates the configuration for this Redis instance.
   * @param newConfig A partial configuration object with the new values.
   */
  updateConfig(newConfig: Partial<any>): void;

  /** Establishes a connection to the Redis server. */
  connect(): Promise<void>;
  /** Closes the connection to the Redis server. */
  quit(): Promise<void>;

  /**
   * Initiates a new transaction block (MULTI).
   * @returns An `IBeaconRedisTransaction` instance for queueing commands.
   */
  multi(): IBeaconRedisTransaction;

  // String Commands
  /** Executes the Redis GET command. */
  get(key: string): Promise<string | null>;
  /** Executes the Redis SET command. */
  set(key: string, value: string, ttlSeconds?: number): Promise<string | null>;
  /** Executes the Redis DEL command. */
  del(keys: string | string[]): Promise<number>;
  /** Executes the Redis EXISTS command. */
  exists(keys: string | string[]): Promise<number>;
  /** Executes the Redis EXPIRE command. */
  expire(key: string, seconds: number): Promise<boolean>;
  /** Executes the Redis TTL command. */
  ttl(key: string): Promise<number>;
  /** Executes the Redis INCR command. */
  incr(key: string): Promise<number>;
  /** Executes the Redis DECR command. */
  decr(key: string): Promise<number>;
  /** Executes the Redis INCRBY command. */
  incrBy(key: string, increment: number): Promise<number>;
  /** Executes the Redis DECRBY command. */
  decrBy(key: string, decrement: number): Promise<number>;

  // Hash Commands
  /** Executes the Redis HGET command. */
  hGet(key: string, field: string): Promise<string | null>;
  /** Executes the Redis HSET command. */
  hSet(key: string, field: string, value: any): Promise<number>;
  hSet(key: string, fieldsAndValues: Record<string, any>): Promise<number>;
  /** Executes the Redis HGETALL command. */
  hGetAll(key: string): Promise<Record<string, string>>;
  /** Executes the Redis HDEL command. */
  hDel(key: string, fields: string | string[]): Promise<number>;
  /** Executes the Redis HEXISTS command. */
  hExists(key: string, field: string): Promise<boolean>;
  /** Executes the Redis HINCRBY command. */
  hIncrBy(key: string, field: string, increment: number): Promise<number>;

  // List Commands
  /** Executes the Redis LPUSH command. */
  lPush(key: string, elements: any | any[]): Promise<number>;
  /** Executes the Redis RPUSH command. */
  rPush(key: string, elements: any | any[]): Promise<number>;
  /** Executes the Redis LPOP command. */
  lPop(key: string): Promise<string | null>;
  /** Executes the Redis RPOP command. */
  rPop(key: string): Promise<string | null>;
  /** Executes the Redis LRANGE command. */
  lRange(key: string, start: number, stop: number): Promise<string[]>;
  /** Executes the Redis LLEN command. */
  lLen(key: string): Promise<number>;
  /** Executes the Redis LTRIM command. */
  lTrim(key: string, start: number, stop: number): Promise<string>;

  // Set Commands
  /** Executes the Redis SADD command. */
  sAdd(key: string, members: any | any[]): Promise<number>;
  /** Executes the Redis SMEMBERS command. */
  sMembers(key: string): Promise<string[]>;
  /** Executes the Redis SISMEMBER command. */
  sIsMember(key: string, member: any): Promise<boolean>;
  /** Executes the Redis SREM command. */
  sRem(key: string, members: any | any[]): Promise<number>;
  /** Executes the Redis SCARD command. */
  sCard(key: string): Promise<number>;

  // Sorted Set Commands
  /** Executes the Redis ZADD command. */
  zAdd(key: string, score: number, member: any): Promise<number>;
  zAdd(key: string, members: { score: number; value: any }[]): Promise<number>;
  /** Executes the Redis ZRANGE command. */
  zRange(key: string, min: string | number, max: string | number, options?: any): Promise<string[]>;
  /** Executes the Redis ZRANGEBYSCORE command. */
  zRangeWithScores(key: string, min: string | number, max: string | number, options?: any): Promise<RedisZMember[]>;
  /** Executes the Redis ZREM command. */
  zRem(key: string, members: any | any[]): Promise<number>;
  /** Executes the Redis ZCARD command. */
  zCard(key: string): Promise<number>;
  /** Executes the Redis ZSCORE command. */
  zScore(key: string, member: any): Promise<number | null>;

  // Server Commands
  /** Executes the Redis PING command. */
  ping(message?: string): Promise<string>;
  /** Executes the Redis INFO command. */
  info(section?: string): Promise<string>;
}