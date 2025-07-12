/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * FILE: src/redis/BeaconRedis.ts
 * DESCRIPTION: Implementation of IBeaconRedis that wraps a native `redis` client.
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
/**
 * The primary implementation of the `IBeaconRedis` interface.
 * This class wraps a native `redis` client and uses the central SyntropyLog logger
 * to provide instrumentation.
 */
export class BeaconRedis implements IBeaconRedis {
  private readonly logger: ILogger;
  private readonly connectionManager: RedisConnectionManager;
  private readonly commandExecutor: RedisCommandExecutor;

  /**
   * Constructs a new BeaconRedis instance.
   * @param client The native Redis client (single node or cluster) to be wrapped.
   * @param config The configuration specific to this Redis instance.
   * @param sensitiveFields A list of field names whose values should be masked in logs.
   * @param sensitivePatterns A list of regular expressions or strings to match field names for masking.
   */
  constructor(
    private config: RedisInstanceConfig,
    connectionManager: RedisConnectionManager,
    commandExecutor: RedisCommandExecutor,
    logger: ILogger
  ) {
    // The logger is now injected, pre-configured by the factory.
    this.logger = logger;
    this.connectionManager = connectionManager;
    this.commandExecutor = commandExecutor;
  }

  // --- Lifecycle and Management Methods ---
  public getInstanceName(): string {
    return this.config.instanceName;
  }

  public async connect(): Promise<void> {
    return this.connectionManager.ensureReady();
  }

  public async quit(): Promise<void> {
    return this.connectionManager.disconnect();
  }

  public updateConfig(
    newConfig: Partial<RedisInstanceReconfigurableConfig>
  ): void {
    this.logger.info('Dynamically updating Redis instance configuration...', {
      newConfig,
    });
    Object.assign(this.config, newConfig);
  }

  public multi(): IBeaconRedisTransaction {
    // This would need a more complex implementation to queue commands and log them on exec()
    throw new Error('The multi() method is not yet implemented.');
  }

  /**
   * A centralized method for executing any Redis command.
   * It handles connection management and uses the fluent logger API for instrumentation.
   * @internal
   */
  private async _executeCommand<T>(
    commandName: string,
    commandFn: () => Promise<T>,
    ...params: any[]
  ): Promise<T> {
    const startTime = Date.now();
    // Use a base logger with the source pre-set.
    const commandLogger = this.logger.withSource('redis');

    try {
      await this.connectionManager.ensureReady();
      const result = await commandFn();
      const durationMs = Date.now() - startTime;

      // Determine the log level from the instance's specific configuration.
      const logLevel = this.config.logging?.onSuccess ?? 'debug';

      const logPayload: Record<string, any> = {
        command: commandName,
        instance: this.getInstanceName(),
        durationMs,
      };

      if (this.config.logging?.logCommandValues) {
        logPayload.params = params;
      }
      if (this.config.logging?.logReturnValue) {
        logPayload.result = result;
      }

      // The log is sent to the central pipeline.
      // Serialization and masking will be handled there.
      commandLogger[logLevel](
        logPayload,
        `Redis command [${commandName}] executed successfully.`
      );

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorLogLevel = this.config.logging?.onError ?? 'error';

      // The error object itself will be serialized by the central SerializerRegistry.
      commandLogger[errorLogLevel](
        {
          command: commandName,
          instance: this.getInstanceName(),
          durationMs,
          err: error,
          params: this.config.logging?.logCommandValues ? params : undefined,
        },
        `Redis command [${commandName}] failed.`
      );

      throw error;
    }
  }

  // --- Public Command Methods ---
  // Each command now simply calls _executeCommand. The structure remains the same.
  public async get(key: string): Promise<string | null> {
    return this._executeCommand(
      'GET',
      () => this.commandExecutor.get(key),
      key
    );
  }

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

  public async del(keys: string | string[]): Promise<number> {
    return this._executeCommand(
      'DEL',
      () => this.commandExecutor.del(keys),
      keys
    );
  }

  /** Executes the Redis EXISTS command. */
  public async exists(keys: string | string[]): Promise<number> {
    return this._executeCommand(
      'EXISTS',
      () => this.commandExecutor.exists(keys),
      keys
    );
  }
  /** Executes the Redis EXPIRE command. */
  public async expire(key: string, seconds: number): Promise<boolean> {
    return this._executeCommand(
      'EXPIRE',
      () => this.commandExecutor.expire(key, seconds),
      key,
      seconds
    );
  }
  /** Executes the Redis TTL command. */
  public async ttl(key: string): Promise<number> {
    return this._executeCommand(
      'TTL',
      () => this.commandExecutor.ttl(key),
      key
    );
  }
  /** Executes the Redis INCR command. */
  public async incr(key: string): Promise<number> {
    return this._executeCommand(
      'INCR',
      () => this.commandExecutor.incr(key),
      key
    );
  }
  /** Executes the Redis DECR command. */
  public async decr(key: string): Promise<number> {
    return this._executeCommand(
      'DECR',
      () => this.commandExecutor.decr(key),
      key
    );
  }
  /** Executes the Redis INCRBY command. */
  public async incrBy(key: string, increment: number): Promise<number> {
    return this._executeCommand(
      'INCRBY',
      () => this.commandExecutor.incrBy(key, increment),
      key,
      increment
    );
  }
  /** Executes the Redis DECRBY command. */
  public async decrBy(key: string, decrement: number): Promise<number> {
    return this._executeCommand(
      'DECRBY',
      () => this.commandExecutor.decrBy(key, decrement),
      key,
      decrement
    );
  }
  /** Executes the Redis HGET command. */
  public async hGet(key: string, field: string): Promise<string | null> {
    return this._executeCommand(
      'HGET',
      async () => (await this.commandExecutor.hGet(key, field)) ?? null,
      key,
      field
    );
  }
  /** Executes the Redis HSET command. */
  public async hSet(
    key: string,
    fieldsAndValues: Record<string, any>
  ): Promise<number>;
  public async hSet(key: string, field: string, value: any): Promise<number>;
  public async hSet(
    key: string,
    fieldOrFields: string | Record<string, any>,
    value?: any
  ): Promise<number> {
    return this._executeCommand(
      'HSET',
      () => {
        if (typeof fieldOrFields === 'string') {
          return this.commandExecutor.hSet(key, fieldOrFields, value);
        }
        return this.commandExecutor.hSet(key, fieldOrFields);
      },
      key,
      fieldOrFields,
      value
    );
  }
  /** Executes the Redis HGETALL command. */
  public async hGetAll(key: string): Promise<Record<string, string>> {
    return this._executeCommand(
      'HGETALL',
      () => this.commandExecutor.hGetAll(key),
      key
    );
  }
  /** Executes the Redis HDEL command. */
  public async hDel(key: string, fields: string | string[]): Promise<number> {
    return this._executeCommand(
      'HDEL',
      () => this.commandExecutor.hDel(key, fields),
      key,
      fields
    );
  }
  /** Executes the Redis HEXISTS command. */
  public async hExists(key: string, field: string): Promise<boolean> {
    return this._executeCommand(
      'HEXISTS',
      () => this.commandExecutor.hExists(key, field),
      key,
      field
    );
  }
  /** Executes the Redis HINCRBY command. */
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
  /** Executes the Redis LPUSH command. */
  public async lPush(key: string, elements: any | any[]): Promise<number> {
    return this._executeCommand(
      'LPUSH',
      () => this.commandExecutor.lPush(key, elements),
      key,
      elements
    );
  }
  /** Executes the Redis RPUSH command. */
  public async rPush(key: string, elements: any | any[]): Promise<number> {
    return this._executeCommand(
      'RPUSH',
      () => this.commandExecutor.rPush(key, elements),
      key,
      elements
    );
  }
  /** Executes the Redis LPOP command. */
  public async lPop(key: string): Promise<string | null> {
    return this._executeCommand(
      'LPOP',
      () => this.commandExecutor.lPop(key),
      key
    );
  }
  /** Executes the Redis RPOP command. */
  public async rPop(key: string): Promise<string | null> {
    return this._executeCommand(
      'RPOP',
      () => this.commandExecutor.rPop(key),
      key
    );
  }
  /** Executes the Redis LRANGE command. */
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
  /** Executes the Redis LLEN command. */
  public async lLen(key: string): Promise<number> {
    return this._executeCommand(
      'LLEN',
      () => this.commandExecutor.lLen(key),
      key
    );
  }
  /** Executes the Redis LTRIM command. */
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
  /** Executes the Redis SADD command. */
  public async sAdd(key: string, members: any | any[]): Promise<number> {
    return this._executeCommand(
      'SADD',
      () => this.commandExecutor.sAdd(key, members),
      key,
      members
    );
  }
  /** Executes the Redis SMEMBERS command. */
  public async sMembers(key: string): Promise<string[]> {
    return this._executeCommand(
      'SMEMBERS',
      () => this.commandExecutor.sMembers(key),
      key
    );
  }
  /** Executes the Redis SISMEMBER command. */
  public async sIsMember(key: string, member: any): Promise<boolean> {
    return this._executeCommand(
      'SISMEMBER',
      () => this.commandExecutor.sIsMember(key, member),
      key,
      member
    );
  }
  /** Executes the Redis SREM command. */
  public async sRem(key: string, members: any | any[]): Promise<number> {
    return this._executeCommand(
      'SREM',
      () => this.commandExecutor.sRem(key, members),
      key,
      members
    );
  }
  /** Executes the Redis SCARD command. */
  public async sCard(key: string): Promise<number> {
    return this._executeCommand(
      'SCARD',
      () => this.commandExecutor.sCard(key),
      key
    );
  }
  /** Executes the Redis ZADD command. */
  public async zAdd(key: string, score: number, member: any): Promise<number>;
  public async zAdd(
    key: string,
    members: { score: number; value: any }[]
  ): Promise<number>;
  public async zAdd(
    key: string,
    scoreOrMembers: any,
    member?: any
  ): Promise<number> {
    return this._executeCommand(
      'ZADD',
      () => {
        // Check if we are using the array overload for multiple members.
        if (Array.isArray(scoreOrMembers)) {
          return this.commandExecutor.zAdd(key, scoreOrMembers);
        }
        return this.commandExecutor.zAdd(key, scoreOrMembers, member);
      },
      key,
      scoreOrMembers,
      member
    );
  }
  /** Executes the Redis ZRANGE command. */
  public async zRange(
    key: string,
    min: string | number,
    max: string | number,
    options?: any
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
  /** Executes the Redis ZRANGE WITHSCORES command. */
  public async zRangeWithScores(
    key: string,
    min: string | number,
    max: string | number,
    options?: any
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
  /** Executes the Redis ZREM command. */
  public async zRem(key: string, members: any | any[]): Promise<number> {
    return this._executeCommand(
      'ZREM',
      () => this.commandExecutor.zRem(key, members),
      key,
      members
    );
  }
  /** Executes the Redis ZCARD command. */
  public async zCard(key: string): Promise<number> {
    return this._executeCommand(
      'ZCARD',
      () => this.commandExecutor.zCard(key),
      key
    );
  }
  /** Executes the Redis ZSCORE command. */
  public async zScore(key: string, member: any): Promise<number | null> {
    return this._executeCommand(
      'ZSCORE',
      () => this.commandExecutor.zScore(key, member),
      key,
      member
    );
  }

  public async ping(message?: string): Promise<string> {
    return this._executeCommand(
      'PING',
      () => this.connectionManager.ping(message),
      message
    );
  }

  public async info(section?: string): Promise<string> {
    return this._executeCommand(
      'INFO',
      () => this.connectionManager.info(section),
      section
    );
  }
}
