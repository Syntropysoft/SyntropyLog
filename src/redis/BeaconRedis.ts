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
import {
  RedisZMember,
  RedisTransaction,
  TransactionResult,
} from './redis.types';
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
 * Instrumented Redis transaction (MULTI/EXEC). Wraps the native client's transaction
 * and delegates exec() and discard() through BeaconRedis for logging and error handling.
 * @internal
 */
class BeaconRedisTransaction implements IBeaconRedisTransaction {
  constructor(
    private readonly nativeTx: RedisTransaction,
    private readonly beacon: BeaconRedis
  ) {}

  get(key: string): this {
    this.nativeTx.get(key);
    return this;
  }
  set(key: string, value: RedisValue, ttlSeconds?: number): this {
    const options = ttlSeconds ? { EX: ttlSeconds } : undefined;
    this.nativeTx.set(key, value as string, options as any);
    return this;
  }
  del(key: string | string[]): this {
    this.nativeTx.del(key);
    return this;
  }
  exists(keys: string | string[]): this {
    this.nativeTx.exists(keys);
    return this;
  }
  expire(key: string, seconds: number): this {
    this.nativeTx.expire(key, seconds);
    return this;
  }
  ttl(key: string): this {
    this.nativeTx.ttl(key);
    return this;
  }
  incr(key: string): this {
    this.nativeTx.incr(key);
    return this;
  }
  decr(key: string): this {
    this.nativeTx.decr(key);
    return this;
  }
  incrBy(key: string, increment: number): this {
    this.nativeTx.incrBy(key, increment);
    return this;
  }
  decrBy(key: string, decrement: number): this {
    this.nativeTx.decrBy(key, decrement);
    return this;
  }
  hGet(key: string, field: string): this {
    this.nativeTx.hGet(key, field);
    return this;
  }
  hSet(key: string, field: string, value: RedisHashValue): this;
  hSet(key: string, fieldsAndValues: Record<string, RedisHashValue>): this;
  hSet(
    key: string,
    fieldOrFields: string | Record<string, RedisHashValue>,
    value?: RedisHashValue
  ): this {
    if (typeof fieldOrFields === 'string') {
      this.nativeTx.hSet(key, fieldOrFields, value as RedisHashValue);
    } else {
      this.nativeTx.hSet(key, fieldOrFields);
    }
    return this;
  }
  hGetAll(key: string): this {
    this.nativeTx.hGetAll(key);
    return this;
  }
  hDel(key: string, fields: string | string[]): this {
    this.nativeTx.hDel(key, fields);
    return this;
  }
  hExists(key: string, field: string): this {
    this.nativeTx.hExists(key, field);
    return this;
  }
  hIncrBy(key: string, field: string, increment: number): this {
    this.nativeTx.hIncrBy(key, field, increment);
    return this;
  }
  lPush(key: string, elements: RedisListElement | RedisListElement[]): this {
    this.nativeTx.lPush(key, elements as any);
    return this;
  }
  rPush(key: string, elements: RedisListElement | RedisListElement[]): this {
    this.nativeTx.rPush(key, elements as any);
    return this;
  }
  lPop(key: string): this {
    this.nativeTx.lPop(key);
    return this;
  }
  rPop(key: string): this {
    this.nativeTx.rPop(key);
    return this;
  }
  lRange(key: string, start: number, stop: number): this {
    this.nativeTx.lRange(key, start, stop);
    return this;
  }
  lLen(key: string): this {
    this.nativeTx.lLen(key);
    return this;
  }
  lTrim(key: string, start: number, stop: number): this {
    this.nativeTx.lTrim(key, start, stop);
    return this;
  }
  sAdd(key: string, members: RedisSetMember | RedisSetMember[]): this {
    this.nativeTx.sAdd(key, members as any);
    return this;
  }
  sMembers(key: string): this {
    this.nativeTx.sMembers(key);
    return this;
  }
  sIsMember(key: string, member: RedisSetMember): this {
    this.nativeTx.sIsMember(key, member as any);
    return this;
  }
  sRem(key: string, members: RedisSetMember | RedisSetMember[]): this {
    this.nativeTx.sRem(key, members as any);
    return this;
  }
  sCard(key: string): this {
    this.nativeTx.sCard(key);
    return this;
  }
  zAdd(key: string, score: number, member: RedisValue): this;
  zAdd(key: string, members: RedisSortedSetMember[]): this;
  zAdd(
    key: string,
    scoreOrMembers: number | RedisSortedSetMember[],
    member?: RedisValue
  ): this {
    if (Array.isArray(scoreOrMembers)) {
      this.nativeTx.zAdd(key, scoreOrMembers as any);
    } else {
      this.nativeTx.zAdd(key, {
        score: scoreOrMembers,
        value: member,
      } as any);
    }
    return this;
  }
  zRange(
    key: string,
    min: string | number,
    max: string | number,
    options?: RedisCommandOptions
  ): this {
    this.nativeTx.zRange(key, min, max, options);
    return this;
  }
  zRangeWithScores(
    key: string,
    min: string | number,
    max: string | number,
    options?: RedisCommandOptions
  ): this {
    this.nativeTx.zRangeWithScores(key, min, max, options);
    return this;
  }
  zRem(key: string, members: RedisValue | RedisValue[]): this {
    this.nativeTx.zRem(key, members as any);
    return this;
  }
  zCard(key: string): this {
    this.nativeTx.zCard(key);
    return this;
  }
  zScore(key: string, member: RedisValue): this {
    this.nativeTx.zScore(key, member as any);
    return this;
  }
  ping(message?: string): this {
    (this.nativeTx as any).ping(message);
    return this;
  }
  info(section?: string): this {
    (this.nativeTx as any).info(section);
    return this;
  }
  executeScript(_script: string, _keys: string[], _args: string[]): this {
    throw new Error(
      'executeScript is not supported inside a Redis transaction (MULTI/EXEC).'
    );
  }
  exec(): Promise<TransactionResult> {
    return this.beacon.runTransactionExec(() => this.nativeTx.exec());
  }
  discard(): Promise<void> {
    return this.beacon.runTransactionDiscard(() =>
      (this.nativeTx as any).discard()
    );
  }
}

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
   */
  public multi(): IBeaconRedisTransaction {
    const nativeTx = this.commandExecutor.multi();
    return new BeaconRedisTransaction(nativeTx, this);
  }

  /**
   * Runs a transaction exec with the same instrumentation as single commands.
   * @internal Used by BeaconRedisTransaction
   */
  public runTransactionExec(
    execFn: () => Promise<TransactionResult>
  ): Promise<TransactionResult> {
    return this._executeCommand('MULTI/EXEC', execFn);
  }

  /**
   * Runs a transaction discard with the same instrumentation as single commands.
   * @internal Used by BeaconRedisTransaction
   */
  public runTransactionDiscard(discardFn: () => Promise<void>): Promise<void> {
    return this._executeCommand('DISCARD', discardFn);
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
