/**
 * @file src/redis/BeaconRedis.ts
 * @description Implementation of IBeaconRedis that wraps a native `redis` client.
 * It centralizes command execution to add instrumentation (logging, metrics, etc.).
 */

import { IBeaconRedis, IBeaconRedisTransaction } from './IBeaconRedis';
import {
  RedisInstanceConfig,
  RedisInstanceReconfigurableConfig,
} from '../config';
import { ILogger } from '../logger/ILogger';
import { RedisCommandExecutor } from './RedisCommandExecutor';
import { RedisConnectionManager } from './RedisConnectionManager';
import { RedisZMember } from './redis.types';
import {
  RedisValue,
  RedisListElement,
  RedisSetMember,
  RedisSortedSetMember,
  RedisHashValue,
  RedisCommandOptions,
  JsonValue,
  errorToJsonValue,
} from '../types';

/**
 * The primary implementation of the `IBeaconRedis` interface.
 * This class wraps a native `redis` client and uses a central logger
 * to provide instrumentation for all commands. It delegates connection
 * management and command execution to specialized classes.
 * @implements {IBeaconRedis}
 */
export class BeaconRedis implements IBeaconRedis {
  /** @private The logger instance for this specific Redis client. */
  private readonly logger: ILogger;
  /** @private Manages the connection state and lifecycle of the native client. */
  private readonly connectionManager: RedisConnectionManager;
  /** @private Executes the actual commands against the native client. */
  private readonly commandExecutor: RedisCommandExecutor;

  /**
   * Constructs a new BeaconRedis instance.
   * @param {RedisInstanceConfig} config - The configuration specific to this Redis instance.
   * @param {RedisConnectionManager} connectionManager - The manager for the client's connection lifecycle.
   * @param {RedisCommandExecutor} commandExecutor - The executor for sending commands to Redis.
   * @param {ILogger} logger - The pre-configured logger instance for this client.
   */
  constructor(
    private config: RedisInstanceConfig,
    connectionManager: RedisConnectionManager,
    commandExecutor: RedisCommandExecutor,
    logger: ILogger
  ) {
    this.logger = logger;
    this.connectionManager = connectionManager;
    this.commandExecutor = commandExecutor;
  }

  // --- Lifecycle and Management Methods ---
  /**
   * @inheritdoc
   */
  public getInstanceName(): string {
    return this.config.instanceName;
  }

  /**
   * @inheritdoc
   */
  public async connect(): Promise<void> {
    return this.connectionManager.ensureReady();
  }

  /**
   * @inheritdoc
   */
  public async quit(): Promise<void> {
    return this.connectionManager.disconnect();
  }

  /**
   * @inheritdoc
   */
  public updateConfig(
    newConfig: Partial<RedisInstanceReconfigurableConfig>
  ): void {
    this.logger.info(
      { newConfig },
      'Dynamically updating Redis instance configuration...'
    );
    Object.assign(this.config, newConfig);
  }

  /**
   * @inheritdoc
   * @throws {Error} This method is not yet implemented.
   */
  public multi(): IBeaconRedisTransaction {
    // TODO: Implement a fully instrumented transaction class.
    // This would need a more complex implementation to queue commands and log them on exec().
    throw new Error('The multi() method is not yet implemented.');
  }

  /**
   * A centralized method for executing and instrumenting any Redis command.
   * It ensures the client is ready, executes the command, logs the outcome
   * (success or failure) with timing information, and handles errors.
   * @private
   * @template T The expected return type of the command.
   * @param {string} commandName - The name of the Redis command (e.g., 'GET', 'HSET').
   * @param {() => Promise<T>} commandFn - A function that, when called, executes the native Redis command.
   * @param {...RedisValue[]} params - The parameters passed to the original command, used for logging.
   * @returns {Promise<T>} A promise that resolves with the result of the command.
   * @throws The error from the native command is re-thrown after being logged.
   */
  private async _executeCommand<T>(
    commandName: string,
    commandFn: () => Promise<T>,
    ...params: RedisValue[]
  ): Promise<T> {
    const startTime = Date.now();
    // Use a base logger with the source pre-set for this command.
    const commandLogger = this.logger.withSource('redis');

    try {
      // 1. Ensure the client is connected and ready before executing.
      await this.connectionManager.ensureReady();

      // 2. Execute the command by calling the provided function.
      const result = await commandFn();
      const durationMs = Date.now() - startTime;

      // 3. On success, log the execution details.
      // Determine the log level from the instance's specific configuration.
      const logLevel = this.config.logging?.onSuccess ?? 'debug';

      const logPayload: Record<string, RedisValue> = {
        command: commandName,
        instance: this.getInstanceName(),
        durationMs,
      };

      // Conditionally add command parameters and return value to the log payload.
      if (this.config.logging?.logCommandValues) {
        logPayload.params = params;
      }
      if (this.config.logging?.logReturnValue) {
        logPayload.result = result as RedisValue;
      }

      // The log is sent to the central pipeline where serialization and masking occur.
      commandLogger[logLevel](
        logPayload as Record<string, JsonValue>,
        `Redis command [${commandName}] executed successfully.`
      );

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorLogLevel = this.config.logging?.onError ?? 'error';

      // The error object will be serialized by the central SerializationManager.
      commandLogger[errorLogLevel](
        {
          command: commandName,
          instance: this.getInstanceName(),
          durationMs,
          err: errorToJsonValue(error),
          params: this.config.logging?.logCommandValues ? params : undefined,
        } as any,
        `Redis command [${commandName}] failed.`
      );

      throw error;
    }
  }

  // --- Public Command Methods ---
  // Each command now simply calls _executeCommand. The structure remains the same.
  /**
   * @inheritdoc
   */
  public async get(key: string): Promise<string | null> {
    return this._executeCommand(
      'GET',
      () => this.commandExecutor.get(key),
      key
    );
  }

  /**
   * @inheritdoc
   */
  public async set(
    key: string,
    value: string,
    ttlSeconds?: number
  ): Promise<string | null> {
    const options = ttlSeconds ? { EX: ttlSeconds } : undefined;
    return this._executeCommand(
      'SET',
      () => this.commandExecutor.set(key, value, options),
      key,
      value,
      ttlSeconds
    );
  }

  /**
   * @inheritdoc
   */
  public async del(keys: string | string[]): Promise<number> {
    return this._executeCommand(
      'DEL',
      () => this.commandExecutor.del(keys),
      keys
    );
  }

  /**
   * @inheritdoc
   */
  public async exists(keys: string | string[]): Promise<number> {
    return this._executeCommand(
      'EXISTS',
      () => this.commandExecutor.exists(keys),
      keys
    );
  }
  /**
   * @inheritdoc
   */
  public async expire(key: string, seconds: number): Promise<boolean> {
    return this._executeCommand(
      'EXPIRE',
      () => this.commandExecutor.expire(key, seconds),
      key,
      seconds
    );
  }
  /**
   * @inheritdoc
   */
  public async ttl(key: string): Promise<number> {
    return this._executeCommand(
      'TTL',
      () => this.commandExecutor.ttl(key),
      key
    );
  }
  /**
   * @inheritdoc
   */
  public async incr(key: string): Promise<number> {
    return this._executeCommand(
      'INCR',
      () => this.commandExecutor.incr(key),
      key
    );
  }
  /**
   * @inheritdoc
   */
  public async decr(key: string): Promise<number> {
    return this._executeCommand(
      'DECR',
      () => this.commandExecutor.decr(key),
      key
    );
  }
  /**
   * @inheritdoc
   */
  public async incrBy(key: string, increment: number): Promise<number> {
    return this._executeCommand(
      'INCRBY',
      () => this.commandExecutor.incrBy(key, increment),
      key,
      increment
    );
  }
  /**
   * @inheritdoc
   */
  public async decrBy(key: string, decrement: number): Promise<number> {
    return this._executeCommand(
      'DECRBY',
      () => this.commandExecutor.decrBy(key, decrement),
      key,
      decrement
    );
  }
  /**
   * @inheritdoc
   */
  public async hGet(key: string, field: string): Promise<string | null> {
    return this._executeCommand(
      'HGET',
      async () => (await this.commandExecutor.hGet(key, field)) ?? null,
      key,
      field
    );
  }
  /**
   * @inheritdoc
   */
  public async hSet(
    key: string,
    fieldsAndValues: Record<string, RedisHashValue>
  ): Promise<number>;
  public async hSet(
    key: string,
    field: string,
    value: RedisHashValue
  ): Promise<number>;
  public async hSet(
    key: string,
    fieldOrFields: string | Record<string, RedisHashValue>,
    value?: RedisHashValue
  ): Promise<number> {
    if (typeof fieldOrFields === 'string') {
      // Handle single field-value pair.
      return this._executeCommand(
        'HSET',
        () => this.commandExecutor.hSet(key, fieldOrFields, value),
        key,
        fieldOrFields,
        value
      );
    }
    // Handle object of field-value pairs.
    return this._executeCommand(
      'HSET',
      () => this.commandExecutor.hSet(key, fieldOrFields),
      key,
      fieldOrFields
    );
  }
  /**
   * @inheritdoc
   */
  public async hGetAll(key: string): Promise<Record<string, string>> {
    return this._executeCommand(
      'HGETALL',
      () => this.commandExecutor.hGetAll(key),
      key
    );
  }
  /**
   * @inheritdoc
   */
  public async hDel(key: string, fields: string | string[]): Promise<number> {
    return this._executeCommand(
      'HDEL',
      () => this.commandExecutor.hDel(key, fields),
      key,
      fields
    );
  }
  /**
   * @inheritdoc
   */
  public async hExists(key: string, field: string): Promise<boolean> {
    return this._executeCommand(
      'HEXISTS',
      () => this.commandExecutor.hExists(key, field),
      key,
      field
    );
  }
  /**
   * @inheritdoc
   */
  public async hIncrBy(
    key: string,
    field: string,
    increment: number
  ): Promise<number> {
    return this._executeCommand(
      'HINCRBY',
      () => this.commandExecutor.hIncrBy(key, field, increment),
      key,
      field,
      increment
    );
  }
  /**
   * @inheritdoc
   */
  public async lPush(key: string, element: RedisListElement): Promise<number>;
  public async lPush(
    key: string,
    elements: RedisListElement[]
  ): Promise<number>;
  public async lPush(
    key: string,
    elementOrElements: RedisListElement | RedisListElement[]
  ): Promise<number> {
    return this._executeCommand(
      'LPUSH',
      () => this.commandExecutor.lPush(key, elementOrElements),
      key,
      elementOrElements
    );
  }
  /**
   * @inheritdoc
   */
  public async rPush(key: string, element: RedisListElement): Promise<number>;
  public async rPush(
    key: string,
    elements: RedisListElement[]
  ): Promise<number>;
  public async rPush(
    key: string,
    elementOrElements: RedisListElement | RedisListElement[]
  ): Promise<number> {
    return this._executeCommand(
      'RPUSH',
      () => this.commandExecutor.rPush(key, elementOrElements),
      key,
      elementOrElements
    );
  }
  /**
   * @inheritdoc
   */
  public async lPop(key: string): Promise<string | null> {
    return this._executeCommand(
      'LPOP',
      () => this.commandExecutor.lPop(key),
      key
    );
  }
  /**
   * @inheritdoc
   */
  public async rPop(key: string): Promise<string | null> {
    return this._executeCommand(
      'RPOP',
      () => this.commandExecutor.rPop(key),
      key
    );
  }
  /**
   * @inheritdoc
   */
  public async lRange(
    key: string,
    start: number,
    stop: number
  ): Promise<string[]> {
    return this._executeCommand(
      'LRANGE',
      () => this.commandExecutor.lRange(key, start, stop),
      key,
      start,
      stop
    );
  }
  /**
   * @inheritdoc
   */
  public async lLen(key: string): Promise<number> {
    return this._executeCommand(
      'LLEN',
      () => this.commandExecutor.lLen(key),
      key
    );
  }
  /**
   * @inheritdoc
   */
  public async lTrim(
    key: string,
    start: number,
    stop: number
  ): Promise<string> {
    return this._executeCommand(
      'LTRIM',
      () => this.commandExecutor.lTrim(key, start, stop),
      key,
      start,
      stop
    );
  }
  /**
   * @inheritdoc
   */
  public async sAdd(key: string, member: RedisSetMember): Promise<number>;
  public async sAdd(key: string, members: RedisSetMember[]): Promise<number>;
  public async sAdd(
    key: string,
    memberOrMembers: RedisSetMember | RedisSetMember[]
  ): Promise<number> {
    return this._executeCommand(
      'SADD',
      () => this.commandExecutor.sAdd(key, memberOrMembers),
      key,
      memberOrMembers
    );
  }
  /**
   * @inheritdoc
   */
  public async sMembers(key: string): Promise<string[]> {
    return this._executeCommand(
      'SMEMBERS',
      () => this.commandExecutor.sMembers(key),
      key
    );
  }
  /**
   * @inheritdoc
   */
  public async sIsMember(
    key: string,
    member: RedisSetMember
  ): Promise<boolean> {
    return this._executeCommand(
      'SISMEMBER',
      () => this.commandExecutor.sIsMember(key, member),
      key,
      member
    );
  }
  /**
   * @inheritdoc
   */
  public async sRem(key: string, member: any): Promise<number>;
  public async sRem(key: string, members: any[]): Promise<number>;
  public async sRem(
    key: string,
    memberOrMembers: RedisSetMember | RedisSetMember[]
  ): Promise<number> {
    return this._executeCommand(
      'SREM',
      () => this.commandExecutor.sRem(key, memberOrMembers),
      key,
      memberOrMembers
    );
  }
  /**
   * @inheritdoc
   */
  public async sCard(key: string): Promise<number> {
    return this._executeCommand(
      'SCARD',
      () => this.commandExecutor.sCard(key),
      key
    );
  }
  /**
   * @inheritdoc
   */
  public async zAdd(key: string, score: number, member: any): Promise<number>;
  public async zAdd(
    key: string,
    members: { score: number; value: any }[]
  ): Promise<number>;
  public async zAdd(
    key: string,
    scoreOrMembers: number | RedisSortedSetMember[],
    member?: RedisValue
  ): Promise<number> {
    // Check if we are using the array overload for multiple members.
    if (Array.isArray(scoreOrMembers)) {
      return this._executeCommand(
        'ZADD',
        () => this.commandExecutor.zAdd(key, scoreOrMembers),
        key,
        scoreOrMembers
      );
    }
    // Handle single score-member pair.
    return this._executeCommand(
      'ZADD',
      () => this.commandExecutor.zAdd(key, scoreOrMembers, member),
      key,
      scoreOrMembers,
      member
    );
  }
  /**
   * @inheritdoc
   */
  public async zRange(
    key: string,
    min: string | number,
    max: string | number,
    options?: RedisCommandOptions
  ): Promise<string[]> {
    return this._executeCommand(
      'ZRANGE',
      () => this.commandExecutor.zRange(key, min, max, options),
      key,
      min,
      max,
      options
    );
  }
  /**
   * @inheritdoc
   */
  public async zRangeWithScores(
    key: string,
    min: string | number,
    max: string | number,
    options?: RedisCommandOptions
  ): Promise<RedisZMember[]> {
    return this._executeCommand(
      'ZRANGE_WITHSCORES',
      () => this.commandExecutor.zRangeWithScores(key, min, max, options),
      key,
      min,
      max,
      options
    );
  }
  /**
   * @inheritdoc
   */
  public async zRem(
    key: string,
    members: RedisValue | RedisValue[]
  ): Promise<number> {
    return this._executeCommand(
      'ZREM',
      () => this.commandExecutor.zRem(key, members),
      key,
      members
    );
  }
  /**
   * @inheritdoc
   */
  public async zCard(key: string): Promise<number> {
    return this._executeCommand(
      'ZCARD',
      () => this.commandExecutor.zCard(key),
      key
    );
  }
  /**
   * @inheritdoc
   */
  public async zScore(key: string, member: RedisValue): Promise<number | null> {
    return this._executeCommand(
      'ZSCORE',
      () => this.commandExecutor.zScore(key, member),
      key,
      member
    );
  }

  /**
   * @inheritdoc
   */
  public async ping(message?: string): Promise<string> {
    return this._executeCommand(
      'PING',
      () => this.connectionManager.ping(message),
      message
    );
  }

  /**
   * @inheritdoc
   */
  public async info(section?: string): Promise<string> {
    return this._executeCommand(
      'INFO',
      () => this.connectionManager.info(section),
      section
    );
  }

  /**
   * Executes a Lua script on the server with instrumentation.
   * @param {string} script - The Lua script to execute.
   * @param {string[]} keys - An array of key names used by the script.
   * @param {string[]} args - An array of argument values for the script.
   * @returns {Promise<any>} A promise that resolves with the result of the script execution.
   */
  public async executeScript(
    script: string,
    keys: string[],
    args: string[]
  ): Promise<RedisValue> {
    return this._executeCommand(
      'SCRIPT_EXEC',
      () => this.commandExecutor.executeScript(script, keys, args),
      script,
      keys,
      args
    );
  }

  // --- Pub/Sub Commands ---

  /**
   * @inheritdoc
   */
  public async subscribe(
    channel: string,
    listener: (message: string, channel: string) => void
  ): Promise<void> {
    return this._executeCommand(
      'SUBSCRIBE',
      () => this.commandExecutor.subscribe(channel, listener),
      channel
    );
  }

  /**
   * @inheritdoc
   */
  public async unsubscribe(channel?: string): Promise<void> {
    return this._executeCommand(
      'UNSUBSCRIBE',
      () => this.commandExecutor.unsubscribe(channel),
      channel
    );
  }

  /**
   * @inheritdoc
   */
  public async publish(channel: string, message: string): Promise<number> {
    return this._executeCommand(
      'PUBLISH',
      () => this.commandExecutor.publish(channel, message),
      channel
    );
  }

  // --- Key Enumeration Commands ---

  /**
   * @inheritdoc
   */
  public async scan(
    cursor: number,
    options?: { MATCH?: string; COUNT?: number }
  ): Promise<{ cursor: number; keys: string[] }> {
    return this._executeCommand(
      'SCAN',
      () => this.commandExecutor.scan(cursor, options),
      cursor
    );
  }

  /**
   * @inheritdoc
   */
  public async keys(pattern: string): Promise<string[]> {
    return this._executeCommand(
      'KEYS',
      () => this.commandExecutor.keys(pattern),
      pattern
    );
  }
}
