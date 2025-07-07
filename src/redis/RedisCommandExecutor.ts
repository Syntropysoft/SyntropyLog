/**
 * FILE: src/redis/RedisCommandExecutor.ts
 *
 * DESCRIPTION:
 * Wraps the native `node-redis` client to provide a clean and consistent API
 * for command execution. This class acts as a thin abstraction layer,
 * directly delegating each call to the corresponding method of the native client.
 */
import { NodeRedisClient, RedisZMember } from './redis.types.js';
import { SetOptions } from 'redis';

/**
 * @class RedisCommandExecutor
 * Provides a set of methods that map directly to the native `redis` client commands.
 * It contains no business logic, logging, or connection handling; its sole
 * responsibility is to execute commands against an already connected client instance.
 */
export class RedisCommandExecutor {
  /**
   * Constructs a new instance of RedisCommandExecutor.
   * @param {NodeRedisClient} nativeClient - The native `redis` client (standalone or cluster) that will execute the commands.
   */
  constructor(private readonly nativeClient: NodeRedisClient) {}

  // --- Key Commands ---

  /**
   * Executes the Redis GET command.
   * @param {string} key - The key whose value to get.
   * @returns {Promise<string | null>} A promise that resolves to the value of the key, or null if the key does not exist.
   */
  get(key: string): Promise<string | null> {
    return this.nativeClient.get(key);
  }

  /**
   * Executes the Redis SET command.
   * @param {string} key - The key to set.
   * @param {string} value - The value to set for the key.
   * @param {SetOptions} [options] - Additional options for the command, such as TTL (e.g., { EX: 60 }).
   * @returns {Promise<string | null>} A promise that resolves to 'OK' if the command was successful, or null.
   */
  set(
    key: string,
    value: string,
    options?: SetOptions
  ): Promise<string | null> {
    return this.nativeClient.set(key, value, options);
  }

  /**
   * Executes the Redis DEL command.
   * @param {string | string[]} keys - One or more keys to delete.
   * @returns {Promise<number>} A promise that resolves to the number of keys that were deleted.
   */
  del(keys: string | string[]): Promise<number> {
    return this.nativeClient.del(keys);
  }

  /**
   * Executes the Redis EXISTS command.
   * @param {string | string[]} keys - One or more keys to check for existence.
   * @returns {Promise<number>} A promise that resolves to the number of keys that exist.
   */
  exists(keys: string | string[]): Promise<number> {
    return this.nativeClient.exists(keys);
  }

  /**
   * Executes the Redis EXPIRE command.
   * @param {string} key - The key to set an expiration time on.
   * @param {number} seconds - The time to live in seconds.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the timeout was set, `false` otherwise.
   */
  public async expire(key: string, seconds: number): Promise<boolean> {
    const result = await this.nativeClient.expire(key, seconds);
    return result;
  }

  /**
   * Executes the Redis TTL command.
   * @param {string} key - The key whose remaining time to live is to be checked.
   * @returns {Promise<number>} A promise that resolves to the time to live in seconds, -1 if the key has no expiry, or -2 if the key does not exist.
   */
  ttl(key: string): Promise<number> {
    return this.nativeClient.ttl(key);
  }

  // --- Numeric Commands ---

  /**
   * Executes the Redis INCR command.
   * @param {string} key - The key whose value will be incremented by one.
   * @returns {Promise<number>} A promise that resolves to the value of the key after the increment.
   */
  incr(key: string): Promise<number> {
    return this.nativeClient.incr(key);
  }

  /**
   * Executes the Redis DECR command.
   * @param {string} key - The key whose value will be decremented by one.
   * @returns {Promise<number>} A promise that resolves to the value of the key after the decrement.
   */
  decr(key: string): Promise<number> {
    return this.nativeClient.decr(key);
  }

  /**
   * Executes the Redis INCRBY command.
   * @param {string} key - The key whose value will be incremented.
   * @param {number} increment - The amount to increment by.
   * @returns {Promise<number>} A promise that resolves to the value of the key after the increment.
   */
  incrBy(key: string, increment: number): Promise<number> {
    return this.nativeClient.incrBy(key, increment);
  }

  /**
   * Executes the Redis DECRBY command.
   * @param {string} key - The key whose value will be decremented.
   * @param {number} decrement - The amount to decrement by.
   * @returns {Promise<number>} A promise that resolves to the value of the key after the decrement.
   */
  decrBy(key: string, decrement: number): Promise<number> {
    return this.nativeClient.decrBy(key, decrement);
  }

  // --- Hash Commands ---

  /**
   * Executes the Redis HGET command.
   * @param {string} key - The key of the hash.
   * @param {string} field - The field to retrieve from the hash.
   * @returns {Promise<string | undefined>} A promise that resolves to the value of the field, or `undefined` if the field or key does not exist.
   */
  hGet(key: string, field: string): Promise<string | undefined> {
    return this.nativeClient.hGet(key, field);
  }

  /**
   * Executes the Redis HSET command.
   * @param {string} key - The key of the hash.
   * @param {string | Record<string, any>} fieldOrFields - The field name or an object of fields and values.
   * @param {any} [value] - The value to set if a single field is provided.
   * @returns {Promise<number>} A promise that resolves to the number of fields that were added (not updated).
   */
  hSet(key: string, fieldOrFields: any, value?: any): Promise<number> {
    return this.nativeClient.hSet(key, fieldOrFields, value);
  }

  /**
   * Executes the Redis HGETALL command.
   * @param {string} key - The key of the hash.
   * @returns {Promise<Record<string, string>>} A promise that resolves to an object containing all fields and values of the hash.
   */
  hGetAll(key: string): Promise<Record<string, string>> {
    return this.nativeClient.hGetAll(key);
  }

  /**
   * Executes the Redis HDEL command.
   * @param {string} key - The key of the hash.
   * @param {string | string[]} fields - One or more fields to delete from the hash.
   * @returns {Promise<number>} A promise that resolves to the number of fields that were removed.
   */
  hDel(key: string, fields: string | string[]): Promise<number> {
    return this.nativeClient.hDel(key, fields);
  }

  /**
   * Executes the Redis HEXISTS command.
   * @param {string} key - The key of the hash.
   * @param {string} field - The field to check for existence.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the field exists in the hash, `false` otherwise.
   */
  public async hExists(key: string, field: string): Promise<boolean> {
    return await this.nativeClient.hExists(key, field);
  }

  /**
   * Executes the Redis HINCRBY command.
   * @param {string} key - The key of the hash.
   * @param {string} field - The field whose integer value will be incremented.
   * @param {number} increment - The amount to increment by.
   * @returns {Promise<number>} A promise that resolves to the value of the field after the increment.
   */
  hIncrBy(key: string, field: string, increment: number): Promise<number> {
    return this.nativeClient.hIncrBy(key, field, increment);
  }

  // --- List Commands ---

  /**
   * Executes the Redis LPUSH command.
   * @param {string} key - The key of the list.
   * @param {string | string[]} elements - One or more elements to prepend to the list.
   * @returns {Promise<number>} A promise that resolves to the length of the list after the operation.
   */
  lPush(key: string, elements: string | string[]): Promise<number> {
    return this.nativeClient.lPush(key, elements);
  }

  /**
   * Executes the Redis RPUSH command.
   * @param {string} key - The key of the list.
   * @param {string | string[]} elements - One or more elements to append to the list.
   * @returns {Promise<number>} A promise that resolves to the length of the list after the operation.
   */
  rPush(key: string, elements: string | string[]): Promise<number> {
    return this.nativeClient.rPush(key, elements);
  }

  /**
   * Executes the Redis LPOP command.
   * @param {string} key - The key of the list.
   * @returns {Promise<string | null>} A promise that resolves to the removed element, or null if the list is empty.
   */
  lPop(key: string): Promise<string | null> {
    return this.nativeClient.lPop(key);
  }

  /**
   * Executes the Redis RPOP command.
   * @param {string} key - The key of the list.
   * @returns {Promise<string | null>} A promise that resolves to the removed element, or null if the list is empty.
   */
  rPop(key: string): Promise<string | null> {
    return this.nativeClient.rPop(key);
  }

  /**
   * Executes the Redis LRANGE command.
   * @param {string} key - The key of the list.
   * @param {number} start - The starting index.
   * @param {number} stop - The ending index.
   * @returns {Promise<string[]>} A promise that resolves to an array of elements within the specified range.
   */
  lRange(key: string, start: number, stop: number): Promise<string[]> {
    return this.nativeClient.lRange(key, start, stop);
  }

  /**
   * Executes the Redis LLEN command.
   * @param {string} key - The key of the list.
   * @returns {Promise<number>} A promise that resolves to the length of the list.
   */
  lLen(key: string): Promise<number> {
    return this.nativeClient.lLen(key);
  }

  /**
   * Executes the Redis LTRIM command.
   * @param {string} key - The key of the list.
   * @param {number} start - The start index of the trim.
   * @param {number} stop - The end index of the trim.
   * @returns {Promise<'OK'>} A promise that resolves to 'OK'.
   */
  async lTrim(key: string, start: number, stop: number): Promise<'OK'> {
    await this.nativeClient.lTrim(key, start, stop);
    return 'OK';
  }

  // --- Set Commands ---

  /**
   * Executes the Redis SADD command.
   * @param {string} key - The key of the set.
   * @param {string | string[]} members - One or more members to add to the set.
   * @returns {Promise<number>} A promise that resolves to the number of elements that were added.
   */
  sAdd(key: string, members: string | string[]): Promise<number> {
    return this.nativeClient.sAdd(key, members);
  }

  /**
   * Executes the Redis SMEMBERS command.
   * @param {string} key - The key of the set.
   * @returns {Promise<string[]>} A promise that resolves to an array containing all the members of the set.
   */
  sMembers(key: string): Promise<string[]> {
    return this.nativeClient.sMembers(key);
  }

  /**
   * Executes the Redis SISMEMBER command.
   * @param {string} key - The key of the set.
   * @param {string} member - The member to check for existence.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the member exists, `false` otherwise.
   */
  sIsMember(key: string, member: string): Promise<boolean> {
    return this.nativeClient.sIsMember(key, member);
  }

  /**
   * Executes the Redis SREM command.
   * @param {string} key - The key of the set.
   * @param {string | string[]} members - One or more members to remove from the set.
   * @returns {Promise<number>} A promise that resolves to the number of members that were removed.
   */
  sRem(key: string, members: string | string[]): Promise<number> {
    return this.nativeClient.sRem(key, members);
  }

  /**
   * Executes the Redis SCARD command.
   * @param {string} key - The key of the set.
   * @returns {Promise<number>} A promise that resolves to the number of members in the set (cardinality).
   */
  sCard(key: string): Promise<number> {
    return this.nativeClient.sCard(key);
  }

  // --- Sorted Set Commands ---

  /**
   * Executes the Redis ZADD command.
   * @param key The key of the sorted set.
   * @param scoreOrMembers The score of a single member, or an array of members with scores.
   * @param [member] The value of a single member.
   * @returns The number of elements added to the sorted set.
   */
  zAdd(key: string, scoreOrMembers: any, member?: any): Promise<number> {
    // La librería 'redis' es inteligente y sabe cómo manejar ambos casos.
    // Simplemente le pasamos los argumentos tal como vienen.
    return this.nativeClient.zAdd(key, scoreOrMembers, member);
  }

  /**
   * Executes the Redis ZRANGE command.
   * @param {string} key - The key of the sorted set.
   * @param {number | string} min - The starting index (or value, if using BYSCORE/BYLEX).
   * @param {number | string} max - The ending index (or value).
   * @param {any} [options] - Additional options like REV, BYSCORE, WITHSCORES.
   * @returns {Promise<string[]>} A promise that resolves to an array of members in the range.
   */
  zRange(
    key: string,
    min: number | string,
    max: number | string,
    options?: any
  ): Promise<string[]> {
    return this.nativeClient.zRange(key, min, max, options);
  }

  /**
   * Executes the Redis ZRANGE command with the WITHSCORES option.
   * @param {string} key - The key of the sorted set.
   * @param {number | string} min - The starting index (or value).
   * @param {number | string} max - The ending index (or value).
   * @param {any} [options] - Additional options.
   * @returns {Promise<RedisZMember[]>} A promise that resolves to an array of members with their scores.
   */
  zRangeWithScores(
    key: string,
    min: number | string,
    max: number | string,
    options?: any
  ): Promise<RedisZMember[]> {
    return this.nativeClient.zRangeWithScores(key, min, max, options);
  }

  /**
   * Executes the Redis ZREM command.
   * @param {string} key - The key of the sorted set.
   * @param {string | string[]} members - One or more members to remove.
   * @returns {Promise<number>} A promise that resolves to the number of members removed.
   */
  zRem(key: string, members: string | string[]): Promise<number> {
    return this.nativeClient.zRem(key, members);
  }

  /**
   * Executes the Redis ZCARD command.
   * @param {string} key - The key of the sorted set.
   * @returns {Promise<number>} A promise that resolves to the number of members in the set (cardinality).
   */
  zCard(key: string): Promise<number> {
    return this.nativeClient.zCard(key);
  }

  /**
   * Executes the Redis ZSCORE command.
   * @param {string} key - The key of the sorted set.
   * @param {string} member - The member whose score to retrieve.
   * @returns {Promise<number | null>} A promise that resolves to the score of the member, or null if the member does not exist.
   */
  async zScore(key: string, member: string): Promise<number | null> {
    return this.nativeClient.zScore(key, member);
  }

  // --- Pub/Sub & Scripting ---

  /**
   * Executes the Redis PUBLISH command.
   * @param {string} channel - The channel to publish the message to.
   * @param {string} message - The message to publish.
   * @returns {Promise<number>} A promise that resolves to the number of clients that received the message.
   */
  publish(channel: string, message: string): Promise<number> {
    return this.nativeClient.publish(channel, message);
  }

  /**
   * Executes the Redis SUBSCRIBE command.
   * @param {string | string[]} channel - One or more channels to subscribe to.
   * @param {(message: string, channel: string) => void} listener - The function that will handle received messages.
   * @returns {Promise<void>}
   */
  subscribe(
    channel: string | string[],
    listener: (message: string, channel: string) => void
  ): Promise<void> {
    return this.nativeClient.subscribe(channel, listener);
  }

  /**
   * Executes the Redis UNSUBSCRIBE command.
   * @param {string | string[]} [channel] - The channel(s) to unsubscribe from. If not provided, unsubscribes from all channels.
   * @returns {Promise<void>}
   */
  unsubscribe(channel?: string | string[]): Promise<void> {
    return this.nativeClient.unsubscribe(channel);
  }

  /**
   * Executes the Redis EVAL command.
   * @param {string} script - The Lua script to execute.
   * @param {object} options - An object containing the keys (KEYS) and arguments (ARGUMENTS) for the script.
   * @returns {Promise<any>} A promise that resolves to the result of the script's execution.
   */
  eval(
    script: string,
    options: { KEYS?: string[]; ARGUMENTS?: string[] }
  ): Promise<any> {
    return this.nativeClient.eval(script, {
      keys: options.KEYS,
      arguments: options.ARGUMENTS,
    });
  }
}
