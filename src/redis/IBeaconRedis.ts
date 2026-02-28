/**
 * @file src/redis/IBeaconRedis.ts
 * @description Defines the contract for an instrumented Redis client.
 * It exposes common Redis commands and methods for lifecycle management.
 */

import { RedisZMember, TransactionResult } from './redis.types';
import {
  RedisValue,
  RedisListElement,
  RedisSetMember,
  RedisSortedSetMember,
  RedisHashValue,
  RedisCommandOptions,
} from '../types';

/**
 * Defines the contract for a Redis transaction (MULTI/EXEC).
 * All command methods are chainable, returning `this` to queue further commands.
 */
export interface IBeaconRedisTransaction {
  // --- String Commands ---
  /** Queues a GET command. */
  get(key: string): this;
  /** Queues a SET command. */
  set(key: string, value: RedisValue, ttlSeconds?: number): this;
  /** Queues a DEL command. */
  del(key: string | string[]): this;
  /** Queues an EXISTS command. */
  exists(keys: string | string[]): this;
  /** Queues an EXPIRE command. */
  expire(key: string, seconds: number): this;
  /** Queues a TTL command. */
  ttl(key: string): this;
  /** Queues an INCR command. */
  incr(key: string): this;
  /** Queues a DECR command. */
  decr(key: string): this;
  /** Queues an INCRBY command. */
  incrBy(key: string, increment: number): this;
  /** Queues a DECRBY command. */
  decrBy(key: string, decrement: number): this;

  // --- Hash Commands ---
  /** Queues an HGET command. */
  hGet(key: string, field: string): this;
  /** Queues an HSET command for a single field. */
  hSet(key: string, field: string, value: RedisHashValue): this;
  /** Queues an HSET command for multiple fields. */
  hSet(key: string, fieldsAndValues: Record<string, RedisHashValue>): this;
  /** Queues an HGETALL command. */
  hGetAll(key: string): this;
  /** Queues an HDEL command. */
  hDel(key: string, fields: string | string[]): this;
  /** Queues an HEXISTS command. */
  hExists(key: string, field: string): this;
  /** Queues an HINCRBY command. */
  hIncrBy(key: string, field: string, increment: number): this;

  // --- List Commands ---
  /** Queues an LPUSH command. */
  lPush(key: string, elements: RedisListElement | RedisListElement[]): this;
  /** Queues an RPUSH command. */
  rPush(key: string, elements: RedisListElement | RedisListElement[]): this;
  /** Queues an LPOP command. */
  lPop(key: string): this;
  /** Queues an RPOP command. */
  rPop(key: string): this;
  /** Queues an LRANGE command. */
  lRange(key: string, start: number, stop: number): this;
  /** Queues an LLEN command. */
  lLen(key: string): this;
  /** Queues an LTRIM command. */
  lTrim(key: string, start: number, stop: number): this;

  // --- Set Commands ---
  /** Queues an SADD command. */
  sAdd(key: string, members: RedisSetMember | RedisSetMember[]): this;
  /** Queues an SMEMBERS command. */
  sMembers(key: string): this;
  /** Queues an SISMEMBER command. */
  sIsMember(key: string, member: RedisSetMember): this;
  /** Queues an SREM command. */
  sRem(key: string, members: RedisSetMember | RedisSetMember[]): this;
  /** Queues an SCARD command. */
  sCard(key: string): this;

  // --- Sorted Set Commands ---
  /** Queues a ZADD command for a single member. */
  zAdd(key: string, score: number, member: RedisValue): this;
  /** Queues a ZADD command for multiple members. */
  zAdd(key: string, members: RedisSortedSetMember[]): this;
  /** Queues a ZRANGE command. */
  zRange(
    key: string,
    min: string | number,
    max: string | number,
    options?: RedisCommandOptions
  ): this;
  /** Queues a ZRANGE command with scores. */
  zRangeWithScores(
    key: string,
    min: string | number,
    max: string | number,
    options?: RedisCommandOptions
  ): this;
  /** Queues a ZREM command. */
  zRem(key: string, members: RedisValue | RedisValue[]): this;
  /** Queues a ZCARD command. */
  zCard(key: string): this;
  /** Queues a ZSCORE command. */
  zScore(key: string, member: RedisValue): this;

  // --- Server Commands ---
  /** Queues a PING command. */
  ping(message?: string): this;
  /** Queues an INFO command. */
  info(section?: string): this;

  /**
   * Queues a Lua script execution.
   * Note: Some implementations may not support this inside transactions.
   */
  executeScript(script: string, keys: string[], args: string[]): this;

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
  updateConfig(newConfig: Partial<Record<string, unknown>>): void;

  /**
   * Establishes a connection to the Redis server if not already connected.
   * @returns {Promise<void>} A promise that resolves when the client is connected and ready.
   */
  connect(): Promise<void>;

  /**
   * Closes the connection to the Redis server.
   * @returns {Promise<void>} A promise that resolves when the connection is successfully closed.
   */
  quit(): Promise<void>;

  /**
   * Initiates a new transaction block (MULTI).
   * @returns {IBeaconRedisTransaction} An instance for queueing commands.
   */
  multi(): IBeaconRedisTransaction;

  // --- String Commands ---

  /**
   * Gets the value of a key. Corresponds to the Redis GET command.
   * @param {string} key The key to retrieve.
   * @returns {Promise<string | null>} A promise that resolves with the value of the key, or null if the key does not exist.
   */
  get(key: string): Promise<string | null>;

  /**
   * Sets the string value of a key. Corresponds to the Redis SET command.
   * @param {string} key The key to set.
   * @param {string} value The value to set for the key.
   * @param {number} [ttlSeconds] Optional. The time-to-live for the key in seconds.
   * @returns {Promise<string | null>} A promise that resolves with 'OK' on success.
   */
  set(key: string, value: string, ttlSeconds?: number): Promise<string | null>;

  /**
   * Deletes one or more keys. Corresponds to the Redis DEL command.
   * @param {string | string[]} keys A single key or an array of keys to delete.
   * @returns {Promise<number>} A promise that resolves with the number of keys that were deleted.
   */
  del(keys: string | string[]): Promise<number>;

  /**
   * Determines if one or more keys exist. Corresponds to the Redis EXISTS command.
   * @param {string | string[]} keys A single key or an array of keys to check.
   * @returns {Promise<number>} A promise that resolves with the number of keys that exist.
   */
  exists(keys: string | string[]): Promise<number>;

  /**
   * Sets a key's time to live in seconds. Corresponds to the Redis EXPIRE command.
   * @param {string} key The key to set the expiration for.
   * @param {number} seconds The time-to-live in seconds.
   * @returns {Promise<boolean>} A promise that resolves with true if the timeout was set, false otherwise.
   */
  expire(key: string, seconds: number): Promise<boolean>;

  /**
   * Gets the time to live for a key. Corresponds to the Redis TTL command.
   * @param {string} key The key to check.
   * @returns {Promise<number>} A promise that resolves with the remaining time to live in seconds.
   */
  ttl(key: string): Promise<number>;

  /**
   * Increments the integer value of a key by one. Corresponds to the Redis INCR command.
   * @param {string} key The key to increment.
   * @returns {Promise<number>} A promise that resolves with the value of the key after the increment.
   */
  incr(key: string): Promise<number>;

  /**
   * Decrements the integer value of a key by one. Corresponds to the Redis DECR command.
   * @param {string} key The key to decrement.
   * @returns {Promise<number>} A promise that resolves with the value of the key after the decrement.
   */
  decr(key: string): Promise<number>;

  /**
   * Increments the integer value of a key by the given amount. Corresponds to the Redis INCRBY command.
   * @param {string} key The key to increment.
   * @param {number} increment The amount to increment by.
   * @returns {Promise<number>} A promise that resolves with the value of the key after the increment.
   */
  incrBy(key: string, increment: number): Promise<number>;

  /**
   * Decrements the integer value of a key by the given amount. Corresponds to the Redis DECRBY command.
   * @param {string} key The key to decrement.
   * @param {number} decrement The amount to decrement by.
   * @returns {Promise<number>} A promise that resolves with the value of the key after the decrement.
   */
  decrBy(key: string, decrement: number): Promise<number>;

  // --- Hash Commands ---

  /**
   * Gets the value of a hash field. Corresponds to the Redis HGET command.
   * @param {string} key The key of the hash.
   * @param {string} field The field to get from the hash.
   * @returns {Promise<string | null>} A promise that resolves with the value of the field, or null if the field or key does not exist.
   */
  hGet(key: string, field: string): Promise<string | null>;

  /**
   * Sets the string value of a hash field. Corresponds to the Redis HSET command.
   * @param {string} key The key of the hash.
   * @param {string} field The field to set in the hash.
   * @param {RedisHashValue} value The value to set for the field.
   * @returns {Promise<number>} A promise that resolves with the number of fields that were added.
   */
  hSet(key: string, field: string, value: RedisHashValue): Promise<number>;
  /**
   * Sets multiple hash fields to multiple values. Corresponds to the Redis HSET command.
   * @param {string} key The key of the hash.
   * @param {Record<string, RedisHashValue>} fieldsAndValues An object of field-value pairs to set.
   * @returns {Promise<number>} A promise that resolves with the number of fields that were added.
   */
  hSet(
    key: string,
    fieldsAndValues: Record<string, RedisHashValue>
  ): Promise<number>;

  /**
   * Gets all the fields and values in a hash. Corresponds to the Redis HGETALL command.
   * @param {string} key The key of the hash.
   * @returns {Promise<Record<string, string>>} A promise that resolves with an object containing all fields and values.
   */
  hGetAll(key: string): Promise<Record<string, string>>;

  /**
   * Deletes one or more hash fields. Corresponds to the Redis HDEL command.
   * @param {string} key The key of the hash.
   * @param {string | string[]} fields The field or fields to delete.
   * @returns {Promise<number>} A promise that resolves with the number of fields that were removed.
   */
  hDel(key: string, fields: string | string[]): Promise<number>;

  /**
   * Determines if a hash field exists. Corresponds to the Redis HEXISTS command.
   * @param {string} key The key of the hash.
   * @param {string} field The field to check.
   * @returns {Promise<boolean>} A promise that resolves with true if the field exists, false otherwise.
   */
  hExists(key: string, field: string): Promise<boolean>;

  /**
   * Increments the integer value of a hash field by the given number. Corresponds to the Redis HINCRBY command.
   * @param {string} key The key of the hash.
   * @param {string} field The field to increment.
   * @param {number} increment The amount to increment by.
   * @returns {Promise<number>} A promise that resolves with the value of the field after the increment.
   */
  hIncrBy(key: string, field: string, increment: number): Promise<number>;

  // --- List Commands ---

  /**
   * Prepends one or multiple values to a list. Corresponds to the Redis LPUSH command.
   * @param {string} key The key of the list.
   * @param {RedisListElement | RedisListElement[]} elements The value or values to prepend.
   * @returns {Promise<number>} A promise that resolves with the length of the list after the push operation.
   */
  lPush(
    key: string,
    elements: RedisListElement | RedisListElement[]
  ): Promise<number>;

  /**
   * Appends one or multiple values to a list. Corresponds to the Redis RPUSH command.
   * @param {string} key The key of the list.
   * @param {RedisListElement | RedisListElement[]} elements The value or values to append.
   * @returns {Promise<number>} A promise that resolves with the length of the list after the push operation.
   */
  rPush(
    key: string,
    elements: RedisListElement | RedisListElement[]
  ): Promise<number>;

  /**
   * Removes and gets the first element in a list. Corresponds to the Redis LPOP command.
   * @param {string} key The key of the list.
   * @returns {Promise<string | null>} A promise that resolves with the value of the first element, or null if the list is empty.
   */
  lPop(key: string): Promise<string | null>;

  /**
   * Removes and gets the last element in a list. Corresponds to the Redis RPOP command.
   * @param {string} key The key of the list.
   * @returns {Promise<string | null>} A promise that resolves with the value of the last element, or null if the list is empty.
   */
  rPop(key: string): Promise<string | null>;

  /**
   * Gets a range of elements from a list. Corresponds to the Redis LRANGE command.
   * @param {string} key The key of the list.
   * @param {number} start The starting index.
   * @param {number} stop The ending index.
   * @returns {Promise<string[]>} A promise that resolves with an array of elements in the specified range.
   */
  lRange(key: string, start: number, stop: number): Promise<string[]>;

  /**
   * Gets the length of a list. Corresponds to the Redis LLEN command.
   * @param {string} key The key of the list.
   * @returns {Promise<number>} A promise that resolves with the length of the list.
   */
  lLen(key: string): Promise<number>;

  /**
   * Trims a list to the specified range. Corresponds to the Redis LTRIM command.
   * @param {string} key The key of the list.
   * @param {number} start The starting index.
   * @param {number} stop The ending index.
   * @returns {Promise<string>} A promise that resolves with 'OK'.
   */
  lTrim(key: string, start: number, stop: number): Promise<string>;

  // --- Set Commands ---

  /**
   * Adds one or more members to a set. Corresponds to the Redis SADD command.
   * @param {string} key The key of the set.
   * @param {RedisSetMember | RedisSetMember[]} members The member or members to add.
   * @returns {Promise<number>} A promise that resolves with the number of members that were added to the set.
   */
  sAdd(
    key: string,
    members: RedisSetMember | RedisSetMember[]
  ): Promise<number>;

  /**
   * Gets all the members in a set. Corresponds to the Redis SMEMBERS command.
   * @param {string} key The key of the set.
   * @returns {Promise<string[]>} A promise that resolves with an array of all the members in the set.
   */
  sMembers(key: string): Promise<string[]>;

  /**
   * Determines if a given value is a member of a set. Corresponds to the Redis SISMEMBER command.
   * @param {string} key The key of the set.
   * @param {RedisSetMember} member The member to check for.
   * @returns {Promise<boolean>} A promise that resolves with true if the member exists in the set, false otherwise.
   */
  sIsMember(key: string, member: RedisSetMember): Promise<boolean>;

  /**
   * Removes one or more members from a set. Corresponds to the Redis SREM command.
   * @param {string} key The key of the set.
   * @param {RedisSetMember | RedisSetMember[]} members The member or members to remove.
   * @returns {Promise<number>} A promise that resolves with the number of members that were removed from the set.
   */
  sRem(
    key: string,
    members: RedisSetMember | RedisSetMember[]
  ): Promise<number>;

  /**
   * Gets the number of members in a set. Corresponds to the Redis SCARD command.
   * @param {string} key The key of the set.
   * @returns {Promise<number>} A promise that resolves with the number of members in the set.
   */
  sCard(key: string): Promise<number>;

  // --- Sorted Set Commands ---

  /**
   * Adds a member to a sorted set, or updates its score if it already exists. Corresponds to the Redis ZADD command.
   * @param {string} key The key of the sorted set.
   * @param {number} score The score for the member.
   * @param {RedisValue} member The member to add.
   * @returns {Promise<number>} A promise that resolves with the number of elements added to the sorted set.
   */
  zAdd(key: string, score: number, member: RedisValue): Promise<number>;
  /**
   * Adds multiple members to a sorted set, or updates their scores if they already exist. Corresponds to the Redis ZADD command.
   * @param {string} key The key of the sorted set.
   * @param {RedisSortedSetMember[]} members An array of member-score objects to add.
   * @returns {Promise<number>} A promise that resolves with the number of elements added to the sorted set.
   */
  zAdd(key: string, members: RedisSortedSetMember[]): Promise<number>;

  /**
   * Returns a range of members in a sorted set, by index. Corresponds to the Redis ZRANGE command.
   * @param {string} key The key of the sorted set.
   * @param {string | number} min The minimum index or score.
   * @param {string | number} max The maximum index or score.
   * @param {RedisCommandOptions} [options] Additional options (e.g., { REV: true }).
   * @returns {Promise<string[]>} A promise that resolves with an array of members in the specified range.
   */
  zRange(
    key: string,
    min: string | number,
    max: string | number,
    options?: RedisCommandOptions
  ): Promise<string[]>;

  /**
   * Returns a range of members in a sorted set, by index, with scores. Corresponds to the Redis ZRANGE command with WITHSCORES.
   * @param {string} key The key of the sorted set.
   * @param {string | number} min The minimum index or score.
   * @param {string | number} max The maximum index or score.
   * @param {RedisCommandOptions} [options] Additional options (e.g., { REV: true }).
   * @returns {Promise<RedisZMember[]>} A promise that resolves with an array of members and their scores.
   */
  zRangeWithScores(
    key: string,
    min: string | number,
    max: string | number,
    options?: RedisCommandOptions
  ): Promise<RedisZMember[]>;

  /**
   * Removes one or more members from a sorted set. Corresponds to the Redis ZREM command.
   * @param {string} key The key of the sorted set.
   * @param {RedisValue | RedisValue[]} members The member or members to remove.
   * @returns {Promise<number>} A promise that resolves with the number of members removed.
   */
  zRem(key: string, members: RedisValue | RedisValue[]): Promise<number>;

  /**
   * Gets the number of members in a sorted set. Corresponds to the Redis ZCARD command.
   * @param {string} key The key of the sorted set.
   * @returns {Promise<number>} A promise that resolves with the sorted set's cardinality.
   */
  zCard(key: string): Promise<number>;

  /**
   * Gets the score associated with the given member in a sorted set. Corresponds to the Redis ZSCORE command.
   * @param {string} key The key of the sorted set.
   * @param {RedisValue} member The member whose score to retrieve.
   * @returns {Promise<number | null>} A promise that resolves with the score of the member, or null if the member does not exist.
   */
  zScore(key: string, member: RedisValue): Promise<number | null>;

  // --- Server Commands ---

  /**
   * Pings the server. Corresponds to the Redis PING command.
   * @param {string} [message] An optional message to include in the ping.
   * @returns {Promise<string>} A promise that resolves with 'PONG' or the provided message.
   */
  ping(message?: string): Promise<string>;

  /**
   * Gets information and statistics about the server. Corresponds to the Redis INFO command.
   * @param {string} [section] An optional section to query (e.g., 'server', 'clients').
   * @returns {Promise<string>} A promise that resolves with a string containing the server information.
   */
  info(section?: string): Promise<string>;

  /**
   * Executes a Lua script on the server.
   * @param {string} script The Lua script to execute.
   * @param {string[]} keys An array of key names used by the script.
   * @param {string[]} args An array of argument values for the script.
   * @returns {Promise<any>} A promise that resolves with the result of the script execution.
   */
  executeScript(
    script: string,
    keys: string[],
    args: string[]
  ): Promise<any>;
}
