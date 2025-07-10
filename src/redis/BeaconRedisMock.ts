/**
 * FILE: src/redis/BeaconRedisMock.ts
 *
 * DESCRIPCIÓN:
 * A comprehensive in-memory mock implementation of the IBeaconRedis interface.
 * It simulates Redis behavior for fast and reliable unit and integration testing,
 * supporting strings, hashes, lists, sets, sorted sets, and expirations.
 */
import { IBeaconRedis, IBeaconRedisTransaction } from './IBeaconRedis';
import { ILogger } from '../logger';
// =================================================================
//  CORRECCIÓN: Importamos los componentes necesarios para crear un logger
//  de prueba sin depender de una configuración completa.
// =================================================================
import { Logger } from '../logger/Logger';
import { MockContextManager } from '../context/MockContextManager';
import { SpyTransport } from '../logger/transports/SpyTransport';
import { SerializerRegistry } from '../serialization/SerializerRegistry';
import { MaskingEngine } from '../masking/MaskingEngine';
import { SanitizationEngine } from '../sanitization/SanitizationEngine';
import { RedisZMember, TransactionResult } from './redis.types';

// --- Internal Mock Storage Types ---

/** The possible data types that can be stored for a key. */
type StoreValue =
  | string
  | Record<string, string>
  | string[]
  | Set<string>
  | RedisZMember[];

/** Represents a single entry in the mock's in-memory store, including value, type, and expiration. */
type StoreEntry = {
  value: StoreValue;
  expiresAt: number | null;
  type: 'string' | 'hash' | 'list' | 'set' | 'zset';
};

/** The in-memory data store, mapping keys to their corresponding StoreEntry. */
type Store = Map<string, StoreEntry>;

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
   * @param mockRedis The parent `BeaconRedisMock` instance to execute commands against.
   * @param logger The logger instance for debugging.
   */
  constructor(
    private readonly mockRedis: BeaconRedisMock,
    private readonly logger: ILogger
  ) {
    this.logger.debug(`[BeaconRedisMockTransaction] Initiated.`);
  }

  /**
   * Queues a command to be executed later.
   * @param command A function that, when called, executes a mock Redis command.
   * @returns The transaction instance for chaining.
   */
  private _queue(command: () => Promise<any>): this {
    this.commands.push(command);
    return this;
  }

  // --- Full Implementation of the Transaction Interface ---
  get(key: string): this {
    return this._queue(() => this.mockRedis.get(key));
  }
  set(key: string, value: any, ttlSeconds?: number): this {
    return this._queue(() => this.mockRedis.set(key, value, ttlSeconds));
  }
  del(key: string | string[]): this {
    return this._queue(() => this.mockRedis.del(key));
  }
  exists(keys: string | string[]): this {
    return this._queue(() => this.mockRedis.exists(keys));
  }
  expire(key: string, seconds: number): this {
    return this._queue(() => this.mockRedis.expire(key, seconds));
  }
  ttl(key: string): this {
    return this._queue(() => this.mockRedis.ttl(key));
  }
  incr(key: string): this {
    return this._queue(() => this.mockRedis.incr(key));
  }
  decr(key: string): this {
    return this._queue(() => this.mockRedis.decr(key));
  }
  incrBy(key: string, increment: number): this {
    return this._queue(() => this.mockRedis.incrBy(key, increment));
  }
  decrBy(key: string, decrement: number): this {
    return this._queue(() => this.mockRedis.decrBy(key, decrement));
  }
  hGet(key: string, field: string): this {
    return this._queue(() => this.mockRedis.hGet(key, field));
  }
  hSet(key: string, field: string, value: any): this;
  hSet(key: string, fieldsAndValues: Record<string, any>): this;
  hSet(key: string, fieldOrFields: any, value?: any): this {
    return this._queue(() => this.mockRedis.hSet(key, fieldOrFields, value));
  }
  hGetAll(key: string): this {
    return this._queue(() => this.mockRedis.hGetAll(key));
  }
  hDel(key: string, fields: string | string[]): this {
    return this._queue(() => this.mockRedis.hDel(key, fields));
  }
  hExists(key: string, field: string): this {
    return this._queue(() => this.mockRedis.hExists(key, field));
  }
  hIncrBy(key: string, field: string, increment: number): this {
    return this._queue(() => this.mockRedis.hIncrBy(key, field, increment));
  }
  lPush(key: string, elements: any | any[]): this {
    return this._queue(() => this.mockRedis.lPush(key, elements));
  }
  rPush(key: string, elements: any | any[]): this {
    return this._queue(() => this.mockRedis.rPush(key, elements));
  }
  lPop(key: string): this {
    return this._queue(() => this.mockRedis.lPop(key));
  }
  rPop(key: string): this {
    return this._queue(() => this.mockRedis.rPop(key));
  }
  lRange(key: string, start: number, stop: number): this {
    return this._queue(() => this.mockRedis.lRange(key, start, stop));
  }
  lLen(key: string): this {
    return this._queue(() => this.mockRedis.lLen(key));
  }
  lTrim(key: string, start: number, stop: number): this {
    return this._queue(() => this.mockRedis.lTrim(key, start, stop));
  }
  sAdd(key: string, members: any | any[]): this {
    return this._queue(() => this.mockRedis.sAdd(key, members));
  }
  sMembers(key: string): this {
    return this._queue(() => this.mockRedis.sMembers(key));
  }
  sIsMember(key: string, member: any): this {
    return this._queue(() => this.mockRedis.sIsMember(key, member));
  }
  sRem(key: string, members: any | any[]): this {
    return this._queue(() => this.mockRedis.sRem(key, members));
  }
  sCard(key: string): this {
    return this._queue(() => this.mockRedis.sCard(key));
  }
  zAdd(key: string, score: number, member: any): this;
  zAdd(key: string, members: { score: number; value: any }[]): this;
  zAdd(key: string, scoreOrMembers: any, member?: any): this {
    return this._queue(() => this.mockRedis.zAdd(key, scoreOrMembers, member));
  }
  zRange(
    key: string,
    min: string | number,
    max: string | number,
    options?: any
  ): this {
    return this._queue(() => this.mockRedis.zRange(key, min, max, options));
  }
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
  zRem(key: string, members: any | any[]): this {
    return this._queue(() => this.mockRedis.zRem(key, members));
  }
  zCard(key: string): this {
    return this._queue(() => this.mockRedis.zCard(key));
  }
  zScore(key: string, member: any): this {
    return this._queue(() => this.mockRedis.zScore(key, member));
  }
  ping(message?: string): this {
    return this._queue(() => this.mockRedis.ping(message));
  }
  info(section?: string): this {
    return this._queue(() => this.mockRedis.info(section));
  }

  /**
   * Executes all queued commands in order.
   * @returns A promise that resolves with an array of results from each command.
   */
  async exec(): Promise<TransactionResult> {
    const results = [];
    for (const cmd of this.commands) {
      results.push(await cmd());
    }
    this.commands = [];
    return results;
  }
  /**
   * Discards all queued commands.
   * @returns A resolved promise.
   */
  async discard(): Promise<void> {
    this.commands = [];
    return;
  }
}

/**
 * A full in-memory mock of a Redis client, implementing the `IBeaconRedis` interface.
 * This class is designed for testing purposes, providing a predictable and fast
 * alternative to a real Redis server. It supports most common commands and data types.
 */
export class BeaconRedisMock implements IBeaconRedis {
  /** The internal in-memory data store. */
  private store: Map<string, any> = new Map();
  private readonly logger: ILogger;
  private readonly instanceName: string;

  /**
   * Constructs a new BeaconRedisMock instance.
   * @param [instanceName='default_mock'] A name for this mock instance.
   * @param [parentLogger] An optional parent logger to create a child logger from.
   */
  constructor(instanceName = 'default_mock', parentLogger?: ILogger) {
    this.instanceName = instanceName;
    if (parentLogger) {
      this.logger = parentLogger.child({
        component: `BeaconRedisMock[${this.instanceName}]`,
      });
    } else {
      // =================================================================
      //  CORRECCIÓN: Creamos un logger funcional para el mock sin necesidad
      //  de una configuración global. Usa un SpyTransport por defecto.
      // =================================================================
      this.logger = new Logger({
        contextManager: new MockContextManager(),
        transports: [new SpyTransport()],
        serializerRegistry: new SerializerRegistry(),
        maskingEngine: new MaskingEngine(),
        sanitizationEngine: new SanitizationEngine(),
        serviceName: `BeaconRedisMock[${this.instanceName}]`,
      });
    }
  }
  /**
   * Retrieves an entry from the store if it exists and has not expired.
   * Also validates that the entry is of the expected type.
   * @param key The key of the entry to retrieve.
   * @param [expectedType] The expected data type for the key.
   * @returns The store entry, or null if not found or expired.
   * @throws {Error} if the key holds a value of the wrong type.
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
   * @param value The value to serialize.
   * @returns A string representation of the value.
   */
  private _serialize(value: any): string {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  // --- Key Commands ---
  /** Simulates the GET command. */
  async get(key: string): Promise<string | null> {
    const entry = this._getValidEntry(key, 'string');
    return entry ? (entry.value as string) : null;
  }
  /** Simulates the SET command with optional TTL. */
  async set(
    key: string,
    value: any,
    ttlSeconds?: number
  ): Promise<'OK' | null> {
    const entry: StoreEntry = {
      value: this._serialize(value),
      type: 'string',
      expiresAt: null,
    };
    if (ttlSeconds) entry.expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, entry);
    return 'OK';
  }
  /** Simulates the DEL command. */
  async del(keys: string | string[]): Promise<number> {
    const keysToDelete = Array.isArray(keys) ? keys : [keys];
    let count = 0;
    for (const key of keysToDelete) {
      if (this.store.delete(key)) count++;
    }
    return count;
  }
  /** Simulates the EXISTS command. */
  async exists(keys: string | string[]): Promise<number> {
    const keysToCheck = Array.isArray(keys) ? keys : [keys];
    let count = 0;
    for (const key of keysToCheck) {
      if (this._getValidEntry(key)) count++;
    }
    return count;
  }
  /** Simulates the EXPIRE command. */
  async expire(key: string, seconds: number): Promise<boolean> {
    const entry = this.store.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + seconds * 1000;
      return true;
    }
    return false;
  }
  /** Simulates the TTL command. */
  async ttl(key: string): Promise<number> {
    const entry = this._getValidEntry(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.round((entry.expiresAt - Date.now()) / 1000);
  }

  // --- Numeric Commands ---
  /** Simulates the INCR command. */
  async incr(key: string): Promise<number> {
    return this.incrBy(key, 1);
  }
  /** Simulates the DECR command. */
  async decr(key: string): Promise<number> {
    return this.decrBy(key, 1);
  }
  /** Simulates the INCRBY command. */
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
  /** Simulates the DECRBY command. */
  async decrBy(key: string, decrement: number): Promise<number> {
    return this.incrBy(key, -decrement);
  }

  // --- Hash Commands ---
  /** Simulates the HGET command. */
  async hGet(key: string, field: string): Promise<string | null> {
    const entry = this._getValidEntry(key, 'hash');
    return entry
      ? ((entry.value as Record<string, string>)[field] ?? null)
      : null;
  }
  /** Simulates the HSET command. */
  async hSet(key: string, field: string, value: any): Promise<number>;
  async hSet(
    key: string,
    fieldsAndValues: Record<string, any>
  ): Promise<number>;
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
  /** Simulates the HGETALL command. */
  async hGetAll(key: string): Promise<Record<string, string>> {
    const entry = this._getValidEntry(key, 'hash');
    return entry ? { ...(entry.value as Record<string, string>) } : {};
  }
  /** Simulates the HDEL command. */
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
  /** Simulates the HEXISTS command. */
  async hExists(key: string, field: string): Promise<boolean> {
    const entry = this._getValidEntry(key, 'hash');
    return !!entry && Object.prototype.hasOwnProperty.call(entry.value, field);
  }
  /** Simulates the HINCRBY command. */
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
  /** Simulates the LPUSH command. */
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
  /** Simulates the RPUSH command. */
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
  /** Simulates the LPOP command. */
  async lPop(key: string): Promise<string | null> {
    const entry = this._getValidEntry(key, 'list');
    return entry ? ((entry.value as string[]).shift() ?? null) : null;
  }
  /** Simulates the RPOP command. */
  async rPop(key: string): Promise<string | null> {
    const entry = this._getValidEntry(key, 'list');
    return entry ? ((entry.value as string[]).pop() ?? null) : null;
  }
  /** Simulates the LRANGE command. */
  async lRange(key: string, start: number, stop: number): Promise<string[]> {
    const entry = this._getValidEntry(key, 'list');
    if (!entry) return [];
    const list = entry.value as string[];
    const realStop = stop < 0 ? list.length + stop : stop;
    return list.slice(start, realStop + 1);
  }
  /** Simulates the LLEN command. */
  async lLen(key: string): Promise<number> {
    const entry = this._getValidEntry(key, 'list');
    return entry ? (entry.value as string[]).length : 0;
  }
  /** Simulates the LTRIM command. */
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
  /** Simulates the SADD command. */
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
  /** Simulates the SMEMBERS command. */
  async sMembers(key: string): Promise<string[]> {
    const entry = this._getValidEntry(key, 'set');
    return entry ? Array.from(entry.value as Set<string>) : [];
  }
  /** Simulates the SISMEMBER command. */
  async sIsMember(key: string, member: any): Promise<boolean> {
    const entry = this._getValidEntry(key, 'set');
    return !!entry && (entry.value as Set<string>).has(this._serialize(member));
  }
  /** Simulates the SREM command. */
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
  /** Simulates the SCARD command. */
  async sCard(key: string): Promise<number> {
    const entry = this._getValidEntry(key, 'set');
    return entry ? (entry.value as Set<string>).size : 0;
  }

  // --- Sorted Set Commands ---
  /** Simulates the ZADD command. */
  async zAdd(key: string, score: number, member: any): Promise<number>;
  async zAdd(
    key: string,
    members: { score: number; value: any }[]
  ): Promise<number>;
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
  /** Simulates the ZRANGE command. */
  async zRange(
    key: string,
    min: string | number,
    max: string | number,
    options?: any
  ): Promise<string[]> {
    const entry = this._getValidEntry(key, 'zset');
    if (!entry) return [];
    let zset = [...(entry.value as RedisZMember[])];
    if (options?.REV) zset.reverse();
    // Simplified: does not support BYSCORE or BYLEX
    const start = Number(min);
    const end = Number(max) === -1 ? zset.length : Number(max) + 1;
    return zset.slice(start, end).map((m) => m.value);
  }

  /** Simulates the ZRANGE WITHSCORES command. */
  async zRangeWithScores(
    key: string,
    min: string | number,
    max: string | number,
    options?: any
  ): Promise<RedisZMember[]> {
    const entry = this._getValidEntry(key, 'zset');
    if (!entry) return [];
    let zset = [...(entry.value as RedisZMember[])];
    if (options?.REV) {
      zset.reverse();
    }
    const start = Number(min);
    const end = Number(max) === -1 ? zset.length : Number(max) + 1;
    return zset.slice(start, end);
  }

  /** Simulates the ZREM command. */
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
  /** Simulates the ZCARD command. */
  async zCard(key: string): Promise<number> {
    const entry = this._getValidEntry(key, 'zset');
    return entry ? (entry.value as RedisZMember[]).length : 0;
  }
  /** Simulates the ZSCORE command. */
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

  /** Simulates the SUBSCRIBE command. */
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
  /** Simulates the UNSUBSCRIBE command. */
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
  /** Simulates the PUBLISH command. */
  async publish(channel: string, message: string): Promise<number> {
    const listeners = this.pubSubListeners.get(channel) || [];
    listeners.forEach((listener) => listener(message, channel));
    return listeners.length; // Return number of subscribers
  }
  async eval(): Promise<any> {
    throw new Error('EVAL command not implemented in mock.');
  }
  /** Simulates the PING command. */
  async ping(message?: string): Promise<string> {
    return message || 'PONG';
  }
  /** Simulates the INFO command. */
  async info(section?: string): Promise<string> {
    return '# Mock Server\r\nversion:1.0.0';
  }

  // --- Orchestration Methods ---
  /** Initiates a new mock transaction. */
  multi(): IBeaconRedisTransaction {
    return new BeaconRedisMockTransaction(this, this.logger);
  }

  // --- Lifecycle and Management Methods ---
  /** Checks if the mock client is "healthy" (always true for the mock). */
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
  /** Returns the mock instance itself, as it acts as the native client for testing. */
  getNativeClient(): any {
    return this;
  }
  /**
   * Gets the configured name of this mock Redis instance.
   * @returns The instance name.
   */
  getInstanceName(): string {
    return this.instanceName;
  }

  /** A mock implementation of `updateConfig` for testing purposes. */
  public updateConfig(newConfig: Partial<any>): void {
    // This is a mock implementation.
    // It can be left empty or used to track config changes for testing.
    this.logger.debug('[BeaconRedisMock] updateConfig called', { newConfig });
  }
}
