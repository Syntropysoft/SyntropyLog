/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @file src/redis/BeaconRedisMock.ts
 * @description
 * A comprehensive, in-memory mock implementation of the `IBeaconRedis` interface.
 * It simulates Redis behavior for fast and reliable unit and integration testing,
 * supporting strings, hashes, lists, sets, sorted sets, and expirations.
 */
import { IBeaconRedis, IBeaconRedisTransaction } from './IBeaconRedis';
import { ILogger } from '../logger';
import { RedisZMember, TransactionResult } from './redis.types';

// --- Internal Mock Storage Types ---

/**
 * @internal
 * The possible data types that can be stored for a key in the mock store.
 */
type StoreValue =
  | string
  | Record<string, string>
  | string[]
  | Set<string>
  | RedisZMember[];

/**
 * @internal
 * Represents a single entry in the mock's in-memory store, including its value, type, and expiration timestamp.
 */
type StoreEntry = {
  value: StoreValue;
  expiresAt: number | null;
  type: 'string' | 'hash' | 'list' | 'set' | 'zset';
};

/**
 * A mock implementation of `IBeaconRedisTransaction` for testing.
 * It queues commands and executes them sequentially against the main `BeaconRedisMock` instance
 * when `exec()` is called, simulating a Redis MULTI/EXEC block.
 * @internal
 */
class BeaconRedisMockTransaction implements IBeaconRedisTransaction {
  private commands: Array<() => Promise<any>> = [];

  /**
   * Constructs a mock transaction.
   * @param {BeaconRedisMock} mockRedis - The parent `BeaconRedisMock` instance to execute commands against.
   * @param {ILogger} logger - The logger instance for debugging.
   */
  constructor(
    private readonly mockRedis: BeaconRedisMock,
    private readonly logger: ILogger
  ) {
    this.logger.debug(`[BeaconRedisMockTransaction] Initiated.`);
  }

  /**
   * Queues a command to be executed later.
   * @private
   * @param {() => Promise<any>} command - A function that, when called, executes a mock Redis command.
   * @returns {this} The transaction instance for chaining.
   */
  private _queue(command: () => Promise<any>): this {
    this.commands.push(command);
    return this;
  }

  // --- Full Implementation of the Transaction Interface ---
  /** @inheritdoc */
  get(key: string): this {
    return this._queue(() => this.mockRedis.get(key));
  }
  /** @inheritdoc */
  set(key: string, value: any, ttlSeconds?: number): this {
    return this._queue(() => this.mockRedis.set(key, value, ttlSeconds));
  }
  /** @inheritdoc */
  del(key: string | string[]): this {
    return this._queue(() => this.mockRedis.del(key));
  }
  /** @inheritdoc */
  exists(keys: string | string[]): this {
    return this._queue(() => this.mockRedis.exists(keys));
  }
  /** @inheritdoc */
  expire(key: string, seconds: number): this {
    return this._queue(() => this.mockRedis.expire(key, seconds));
  }
  /** @inheritdoc */
  ttl(key: string): this {
    return this._queue(() => this.mockRedis.ttl(key));
  }
  /** @inheritdoc */
  incr(key: string): this {
    return this._queue(() => this.mockRedis.incr(key));
  }
  /** @inheritdoc */
  decr(key: string): this {
    return this._queue(() => this.mockRedis.decr(key));
  }
  /** @inheritdoc */
  incrBy(key: string, increment: number): this {
    return this._queue(() => this.mockRedis.incrBy(key, increment));
  }
  /** @inheritdoc */
  decrBy(key: string, decrement: number): this {
    return this._queue(() => this.mockRedis.decrBy(key, decrement));
  }
  /** @inheritdoc */
  hGet(key: string, field: string): this {
    return this._queue(() => this.mockRedis.hGet(key, field));
  }
  /** @inheritdoc */
  hSet(key: string, field: string, value: any): this;
  /** @inheritdoc */
  hSet(key: string, fieldsAndValues: Record<string, any>): this;
  /** @inheritdoc */
  hSet(key: string, fieldOrFields: any, value?: any): this {
    return this._queue(() => this.mockRedis.hSet(key, fieldOrFields, value));
  }
  /** @inheritdoc */
  hGetAll(key: string): this {
    return this._queue(() => this.mockRedis.hGetAll(key));
  }
  /** @inheritdoc */
  hDel(key: string, fields: string | string[]): this {
    return this._queue(() => this.mockRedis.hDel(key, fields));
  }
  /** @inheritdoc */
  hExists(key: string, field: string): this {
    return this._queue(() => this.mockRedis.hExists(key, field));
  }
  /** @inheritdoc */
  hIncrBy(key: string, field: string, increment: number): this {
    return this._queue(() => this.mockRedis.hIncrBy(key, field, increment));
  }
  /** @inheritdoc */
  lPush(key: string, elements: any | any[]): this {
    return this._queue(() => this.mockRedis.lPush(key, elements));
  }
  /** @inheritdoc */
  rPush(key: string, elements: any | any[]): this {
    return this._queue(() => this.mockRedis.rPush(key, elements));
  }
  /** @inheritdoc */
  lPop(key: string): this {
    return this._queue(() => this.mockRedis.lPop(key));
  }
  /** @inheritdoc */
  rPop(key: string): this {
    return this._queue(() => this.mockRedis.rPop(key));
  }
  /** @inheritdoc */
  lRange(key: string, start: number, stop: number): this {
    return this._queue(() => this.mockRedis.lRange(key, start, stop));
  }
  /** @inheritdoc */
  lLen(key: string): this {
    return this._queue(() => this.mockRedis.lLen(key));
  }
  /** @inheritdoc */
  lTrim(key: string, start: number, stop: number): this {
    return this._queue(() => this.mockRedis.lTrim(key, start, stop));
  }
  /** @inheritdoc */
  sAdd(key: string, members: any | any[]): this {
    return this._queue(() => this.mockRedis.sAdd(key, members));
  }
  /** @inheritdoc */
  sMembers(key: string): this {
    return this._queue(() => this.mockRedis.sMembers(key));
  }
  /** @inheritdoc */
  sIsMember(key: string, member: any): this {
    return this._queue(() => this.mockRedis.sIsMember(key, member));
  }
  /** @inheritdoc */
  sRem(key: string, members: any | any[]): this {
    return this._queue(() => this.mockRedis.sRem(key, members));
  }
  /** @inheritdoc */
  sCard(key: string): this {
    return this._queue(() => this.mockRedis.sCard(key));
  }
  /** @inheritdoc */
  zAdd(key: string, score: number, member: any): this;
  /** @inheritdoc */
  zAdd(key: string, members: { score: number; value: any }[]): this;
  /** @inheritdoc */
  zAdd(key: string, scoreOrMembers: any, member?: any): this {
    return this._queue(() => this.mockRedis.zAdd(key, scoreOrMembers, member));
  }
  /** @inheritdoc */
  zRange(
    key: string,
    min: string | number,
    max: string | number,
    options?: any
  ): this {
    return this._queue(() => this.mockRedis.zRange(key, min, max, options));
  }
  /** @inheritdoc */
  zRangeWithScores(
    key: string,
    min: string | number,
    max: string | number,
    options?: any
  ): this {
    return this._queue(() =>
      this.mockRedis.zRangeWithScores(key, min, max, options)
    );
  }
  /** @inheritdoc */
  zRem(key: string, members: any | any[]): this {
    return this._queue(() => this.mockRedis.zRem(key, members));
  }
  /** @inheritdoc */
  zCard(key: string): this {
    return this._queue(() => this.mockRedis.zCard(key));
  }
  /** @inheritdoc */
  zScore(key: string, member: any): this {
    return this._queue(() => this.mockRedis.zScore(key, member));
  }
  /** @inheritdoc */
  ping(message?: string): this {
    return this._queue(() => this.mockRedis.ping(message));
  }
  /** @inheritdoc */
  info(section?: string): this {
    return this._queue(() => this.mockRedis.info(section));
  }
  eval(script: string, keys: string[], args: string[]): this {
    // EVAL can be part of a transaction
    return this._queue(() => this.mockRedis.eval(script, keys, args));
  }

  /** @inheritdoc */
  async exec(): Promise<TransactionResult> {
    const results = [];
    for (const cmd of this.commands) {
      results.push(await cmd());
    }
    this.commands = [];
    return results;
  }
  /** @inheritdoc */
  async discard(): Promise<void> {
    this.commands = [];
    return;
  }
}

/**
 * A full in-memory mock of a Redis client, implementing the `IBeaconRedis` interface.
 * This class is designed for testing purposes, providing a predictable and fast
 * alternative to a real Redis server. It supports most common commands and data types.
 * @implements {IBeaconRedis}
 */
export class BeaconRedisMock implements IBeaconRedis {
  /** The internal in-memory data store. */
  private store: Map<string, StoreEntry> = new Map();
  private readonly logger: ILogger;
  private readonly instanceName: string;

  /**
   * Constructs a new BeaconRedisMock instance.
   * @param {string} [instanceName='default_mock'] - A name for this mock instance.
   * @param {ILogger} [parentLogger] - An optional parent logger to create a child logger from.
   */
  constructor(instanceName = 'default_mock', parentLogger?: ILogger) {
    this.instanceName = instanceName;
    if (parentLogger) {
      this.logger = parentLogger.child({
        component: `BeaconRedisMock[${this.instanceName}]`,
      });
    } else {
      // If no logger is provided, create a lightweight, no-op mock logger
      // to avoid pulling in the entire logging stack.
      this.logger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        fatal: () => {},
        trace: () => {},
        child: () => this.logger,
        withSource: () => this.logger,
        setLevel: () => {},
        withRetention: () => this.logger,
        withTransactionId: () => this.logger,
      };
    }
  }
  /**
   * Retrieves an entry from the store if it exists and has not expired.
   * Also validates that the entry is of the expected type.
   * @private
   * @param {string} key - The key of the entry to retrieve.
   * @param {StoreEntry['type']} [expectedType] - The expected data type for the key.
   * @returns {StoreEntry | null} The store entry, or null if not found or expired.
   * @throws {Error} WRONGTYPE error if the key holds a value of the wrong type.
   */
  private _getValidEntry(
    key: string,
    expectedType?: StoreEntry['type']
  ): StoreEntry | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    if (expectedType && entry.type !== expectedType) {
      throw new Error(
        `WRONGTYPE Operation against a key holding the wrong kind of value`
      );
    }
    return entry;
  }

  /**
   * Serializes a value to a string for storage, similar to how Redis stores data.
   * @private
   * @param {any} value - The value to serialize.
   * @returns {string} A string representation of the value.
   */
  private _serialize(value: any): string {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  // --- Key Commands ---
  /** @inheritdoc */
  async get(key: string): Promise<string | null> {
    const entry = this._getValidEntry(key, 'string');
    return entry ? (entry.value as string) : null;
  }
  /** @inheritdoc */
  async set(
    key: string,
    value: any,
    ttlSeconds?: number
  ): Promise<string | null> {
    const entry: StoreEntry = {
      value: this._serialize(value),
      type: 'string',
      expiresAt: null,
    };
    if (ttlSeconds) entry.expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, entry);
    return 'OK';
  }
  /** @inheritdoc */
  async del(keys: string | string[]): Promise<number> {
    const keysToDelete = Array.isArray(keys) ? keys : [keys];
    let count = 0;
    for (const key of keysToDelete) {
      if (this.store.delete(key)) count++;
    }
    return count;
  }
  /** @inheritdoc */
  async exists(keys: string | string[]): Promise<number> {
    const keysToCheck = Array.isArray(keys) ? keys : [keys];
    let count = 0;
    for (const key of keysToCheck) {
      if (this._getValidEntry(key)) count++;
    }
    return count;
  }
  /** @inheritdoc */
  async expire(key: string, seconds: number): Promise<boolean> {
    const entry = this.store.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + seconds * 1000;
      return true;
    }
    return false;
  }
  /** @inheritdoc */
  async ttl(key: string): Promise<number> {
    const entry = this._getValidEntry(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.round((entry.expiresAt - Date.now()) / 1000);
  }

  // --- Numeric Commands ---
  /** @inheritdoc */
  async incr(key: string): Promise<number> {
    return this.incrBy(key, 1);
  }
  /** @inheritdoc */
  async decr(key: string): Promise<number> {
    return this.decrBy(key, 1);
  }
  /** @inheritdoc */
  async incrBy(key: string, increment: number): Promise<number> {
    const entry = this._getValidEntry(key, 'string');
    const currentValue = entry ? parseInt(entry.value as string, 10) : 0;
    if (isNaN(currentValue))
      throw new Error('ERR value is not an integer or out of range');
    const newValue = currentValue + increment;
    this.store.set(key, {
      value: newValue.toString(),
      type: 'string',
      expiresAt: entry?.expiresAt || null,
    });
    return newValue;
  }
  /** @inheritdoc */
  async decrBy(key: string, decrement: number): Promise<number> {
    return this.incrBy(key, -decrement);
  }

  // --- Hash Commands ---
  /** @inheritdoc */
  async hGet(key: string, field: string): Promise<string | null> {
    const entry = this._getValidEntry(key, 'hash');
    return entry
      ? ((entry.value as Record<string, string>)[field] ?? null)
      : null;
  }
  /** @inheritdoc */
  async hSet(key: string, field: string, value: any): Promise<number>;
  /** @inheritdoc */
  async hSet(
    key: string,
    fieldsAndValues: Record<string, any>
  ): Promise<number>;
  /** @inheritdoc */
  async hSet(key: string, fieldOrFields: any, value?: any): Promise<number> {
    let entry = this._getValidEntry(key, 'hash');
    if (!entry) {
      entry = { value: {}, type: 'hash', expiresAt: null };
      this.store.set(key, entry);
    }
    const hash = entry.value as Record<string, string>;
    let addedCount = 0;
    if (typeof fieldOrFields === 'string') {
      if (!Object.prototype.hasOwnProperty.call(hash, fieldOrFields))
        addedCount++;
      hash[fieldOrFields] = this._serialize(value);
    } else {
      for (const field in fieldOrFields) {
        if (!Object.prototype.hasOwnProperty.call(hash, field)) addedCount++;
        hash[field] = this._serialize(fieldOrFields[field]);
      }
    }
    return addedCount;
  }
  /** @inheritdoc */
  async hGetAll(key: string): Promise<Record<string, string>> {
    const entry = this._getValidEntry(key, 'hash');
    return entry ? { ...(entry.value as Record<string, string>) } : {};
  }
  /** @inheritdoc */
  async hDel(key: string, fields: string | string[]): Promise<number> {
    const entry = this._getValidEntry(key, 'hash');
    if (!entry) return 0;
    const hash = entry.value as Record<string, string>;
    const fieldsToDelete = Array.isArray(fields) ? fields : [fields];
    let deletedCount = 0;
    for (const field of fieldsToDelete) {
      if (Object.prototype.hasOwnProperty.call(hash, field)) {
        delete hash[field];
        deletedCount++;
      }
    }
    return deletedCount;
  }
  /** @inheritdoc */
  async hExists(key: string, field: string): Promise<boolean> {
    const entry = this._getValidEntry(key, 'hash');
    return !!entry && Object.prototype.hasOwnProperty.call(entry.value, field);
  }
  /** @inheritdoc */
  async hIncrBy(
    key: string,
    field: string,
    increment: number
  ): Promise<number> {
    const entry = this._getValidEntry(key, 'hash');
    const hash = entry ? (entry.value as Record<string, string>) : {};
    const currentValue = parseInt(hash[field] || '0', 10);
    if (isNaN(currentValue))
      throw new Error('ERR hash value is not an integer');
    const newValue = currentValue + increment;
    hash[field] = newValue.toString();
    if (!entry)
      this.store.set(key, { value: hash, type: 'hash', expiresAt: null });
    return newValue;
  }

  // --- List Commands ---
  /** @inheritdoc */
  async lPush(key: string, elements: any | any[]): Promise<number> {
    let entry = this._getValidEntry(key, 'list');
    if (!entry) {
      entry = { value: [], type: 'list', expiresAt: null };
      this.store.set(key, entry);
    }
    const list = entry.value as string[];
    const valuesToPush = (Array.isArray(elements) ? elements : [elements]).map(
      this._serialize
    );
    return list.unshift(...valuesToPush.reverse()); // Reverse to match Redis LPUSH behavior for multiple args
  }
  /** @inheritdoc */
  async rPush(key: string, elements: any | any[]): Promise<number> {
    let entry = this._getValidEntry(key, 'list');
    if (!entry) {
      entry = { value: [], type: 'list', expiresAt: null };
      this.store.set(key, entry);
    }
    const list = entry.value as string[];
    const values = (Array.isArray(elements) ? elements : [elements]).map(
      this._serialize
    );
    return list.push(...values);
  }
  /** @inheritdoc */
  async lPop(key: string): Promise<string | null> {
    const entry = this._getValidEntry(key, 'list');
    return entry ? ((entry.value as string[]).shift() ?? null) : null;
  }
  /** @inheritdoc */
  async rPop(key: string): Promise<string | null> {
    const entry = this._getValidEntry(key, 'list');
    return entry ? ((entry.value as string[]).pop() ?? null) : null;
  }
  /** @inheritdoc */
  async lRange(key: string, start: number, stop: number): Promise<string[]> {
    const entry = this._getValidEntry(key, 'list');
    if (!entry) return [];
    const list = entry.value as string[];
    const realStop = stop < 0 ? list.length + stop : stop;
    return list.slice(start, realStop + 1);
  }
  /** @inheritdoc */
  async lLen(key: string): Promise<number> {
    const entry = this._getValidEntry(key, 'list');
    return entry ? (entry.value as string[]).length : 0;
  }
  /** @inheritdoc */
  async lTrim(key: string, start: number, stop: number): Promise<string> {
    const entry = this._getValidEntry(key, 'list');
    if (entry) {
      const list = entry.value as string[];
      const realStop = stop < 0 ? list.length + stop : stop;
      entry.value = list.slice(start, realStop + 1);
    }
    return 'OK';
  }

  // --- Set Commands ---
  /** @inheritdoc */
  async sAdd(key: string, members: any | any[]): Promise<number> {
    let entry = this._getValidEntry(key, 'set');
    if (!entry) {
      entry = { value: new Set(), type: 'set', expiresAt: null };
      this.store.set(key, entry);
    }
    const set = entry.value as Set<string>;
    const values = (Array.isArray(members) ? members : [members]).map(
      this._serialize
    );
    let addedCount = 0;
    for (const val of values) {
      if (!set.has(val)) {
        set.add(val);
        addedCount++;
      }
    }
    return addedCount;
  }
  /** @inheritdoc */
  async sMembers(key: string): Promise<string[]> {
    const entry = this._getValidEntry(key, 'set');
    return entry ? Array.from(entry.value as Set<string>) : [];
  }
  /** @inheritdoc */
  async sIsMember(key: string, member: any): Promise<boolean> {
    const entry = this._getValidEntry(key, 'set');
    return !!entry && (entry.value as Set<string>).has(this._serialize(member));
  }
  /** @inheritdoc */
  async sRem(key: string, members: any | any[]): Promise<number> {
    const entry = this._getValidEntry(key, 'set');
    if (!entry) return 0;
    const set = entry.value as Set<string>;
    const values = (Array.isArray(members) ? members : [members]).map(
      this._serialize
    );
    let removedCount = 0;
    for (const val of values) {
      if (set.delete(val)) removedCount++;
    }
    return removedCount;
  }
  /** @inheritdoc */
  async sCard(key: string): Promise<number> {
    const entry = this._getValidEntry(key, 'set');
    return entry ? (entry.value as Set<string>).size : 0;
  }

  // --- Sorted Set Commands ---
  /** @inheritdoc */
  async zAdd(key: string, score: number, member: any): Promise<number>;
  /** @inheritdoc */
  async zAdd(
    key: string,
    members: { score: number; value: any }[]
  ): Promise<number>;
  /** @inheritdoc */
  async zAdd(key: string, scoreOrMembers: any, member?: any): Promise<number> {
    let entry = this._getValidEntry(key, 'zset');
    if (!entry) {
      entry = { value: [], type: 'zset', expiresAt: null };
      this.store.set(key, entry);
    }
    const zset = entry.value as RedisZMember[];
    const membersToAdd: { score: number; value: any }[] = Array.isArray(
      scoreOrMembers
    )
      ? scoreOrMembers
      : [{ score: scoreOrMembers, value: member }];
    let addedCount = 0;
    for (const m of membersToAdd) {
      const val = this._serialize(m.value);
      const existingIndex = zset.findIndex((e) => e.value === val);
      if (existingIndex > -1) {
        zset[existingIndex].score = m.score;
      } else {
        zset.push({ value: val, score: m.score });
        addedCount++;
      }
    }
    zset.sort((a, b) => a.score - b.score);
    return addedCount;
  }
  /** @inheritdoc */
  async zRange(
    key: string,
    min: string | number,
    max: string | number,
    options?: any
  ): Promise<string[]> {
    const entry = this._getValidEntry(key, 'zset');
    if (!entry) return [];
    const zset = [...(entry.value as RedisZMember[])];
    if (options?.REV) zset.reverse();
    // Simplified: does not support BYSCORE or BYLEX
    const start = Number(min);
    const end = Number(max) === -1 ? zset.length : Number(max) + 1;
    return zset.slice(start, end).map((m) => m.value);
  }

  /** @inheritdoc */
  async zRangeWithScores(
    key: string,
    min: string | number,
    max: string | number,
    options?: any
  ): Promise<RedisZMember[]> {
    const entry = this._getValidEntry(key, 'zset');
    if (!entry) return [];
    const zset = [...(entry.value as RedisZMember[])];
    if (options?.REV) {
      zset.reverse();
    }
    const start = Number(min);
    const end = Number(max) === -1 ? zset.length : Number(max) + 1;
    return zset.slice(start, end);
  }

  /** @inheritdoc */
  async zRem(key: string, members: any | any[]): Promise<number> {
    const entry = this._getValidEntry(key, 'zset');
    if (!entry) return 0;
    const zset = entry.value as RedisZMember[];
    const valuesToRemove = new Set(
      (Array.isArray(members) ? members : [members]).map(this._serialize)
    );
    let removedCount = 0;
    entry.value = zset.filter((m) => {
      if (valuesToRemove.has(m.value)) {
        removedCount++;
        return false;
      }
      return true;
    });
    return removedCount;
  }
  /** @inheritdoc */
  async zCard(key: string): Promise<number> {
    const entry = this._getValidEntry(key, 'zset');
    return entry ? (entry.value as RedisZMember[]).length : 0;
  }
  /** @inheritdoc */
  async zScore(key: string, member: any): Promise<number | null> {
    const entry = this._getValidEntry(key, 'zset');
    if (!entry) return null;
    const zset = entry.value as RedisZMember[];
    const found = zset.find((m) => m.value === this._serialize(member));
    return found ? found.score : null;
  }

  // --- Pub/Sub, Scripting, and Server Commands ---

  private pubSubListeners: Map<
    string,
    Array<(message: string, channel: string) => void>
  > = new Map();

  /**
   * Simulates the SUBSCRIBE command for testing Pub/Sub.
   * @param {string | string[]} channels - The channel or channels to subscribe to.
   * @param {(message: string, channel: string) => void} listener - The callback to execute on message receipt.
   * @returns {Promise<void>}
   */
  async subscribe(
    channels: string | string[],
    listener: (message: string, channel: string) => void
  ): Promise<void> {
    const channelArr = Array.isArray(channels) ? channels : [channels];
    for (const channel of channelArr) {
      if (!this.pubSubListeners.has(channel))
        this.pubSubListeners.set(channel, []);
      this.pubSubListeners.get(channel)!.push(listener);
    }
  }
  /**
   * Simulates the UNSUBSCRIBE command.
   * @param {string | string[]} [channels] - The channel or channels to unsubscribe from. If omitted, unsubscribes from all.
   * @returns {Promise<void>}
   */
  async unsubscribe(channels?: string | string[]): Promise<void> {
    const channelArr = channels
      ? Array.isArray(channels)
        ? channels
        : [channels]
      : Array.from(this.pubSubListeners.keys());
    for (const channel of channelArr) {
      this.pubSubListeners.delete(channel);
    }
  }
  /**
   * Simulates the PUBLISH command for testing purposes.
   * @param {string} channel - The channel to publish the message to.
   * @param {string} message - The message to publish.
   * @returns {Promise<number>} A promise that resolves with the number of clients that received the message.
   */
  async publish(channel: string, message: string): Promise<number> {
    const listeners = this.pubSubListeners.get(channel) || [];
    listeners.forEach((listener) => listener(message, channel));
    return listeners.length; // Return number of subscribers
  }
  /**
   * Simulates the EVAL command. This is not implemented and will throw an error.
   * @throws {Error}
   */
  async eval(_script: string, _keys: string[], _args: string[]): Promise<any> {
    throw new Error('EVAL command not implemented in mock.');
  }
  /** @inheritdoc */
  async ping(message?: string): Promise<string> {
    return message || 'PONG';
  }
  /** @inheritdoc */
  async info(section?: string): Promise<string> {
    return `${section ? section + ':' : ''}
    }# Mock Server\r\nversion:1.0.0`;
  }

  // --- Orchestration Methods ---
  /** @inheritdoc */
  multi(): IBeaconRedisTransaction {
    return new BeaconRedisMockTransaction(this, this.logger);
  }

  // --- Lifecycle and Management Methods ---
  /**
   * Checks if the mock client is "healthy". For the mock, this always returns true.
   * @returns {Promise<boolean>} A promise that resolves to true.
   */
  async isHealthy(): Promise<boolean> {
    return true;
  }
  /** A no-op connect method to satisfy the interface. */
  async connect(): Promise<void> {
    /* no-op */
  }
  /** A no-op quit method to satisfy the interface. */
  async quit(): Promise<void> {
    /* no-op */
  }
  /**
   * Returns the mock instance itself, as it acts as the native client for testing.
   * @returns {this} The mock instance.
   */
  getNativeClient(): any {
    return this;
  }
  /**
   * Gets the configured name of this mock Redis instance.
   * @returns {string} The instance name.
   */
  getInstanceName(): string {
    return this.instanceName;
  }

  /**
   * A mock implementation of `updateConfig` for testing purposes.
   * It logs the call and does nothing else, satisfying the `IBeaconRedis` interface.
   * @param {Partial<any>} newConfig - The configuration object.
   */
  public updateConfig(newConfig: Partial<any>): void {
    this.logger.debug('[BeaconRedisMock] updateConfig called', { newConfig });
  }
}
