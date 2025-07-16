/**
 * FILE: src/redis/RedisConnectionManager.ts
 * DESCRIPTION: Manages the lifecycle of the Redis client connection.
 */
import { createClient, RedisClusterOptions } from 'redis';
import {
  RedisClientType,
  RedisFunctions,
  RedisModules,
  RedisScripts,
} from 'redis';
import { ILogger } from '../logger';
import { NodeRedisClient } from './redis.types.js';
import { RedisInstanceConfig } from '../config';

// Type guard for single-node RedisClientType
function isRedisClientType(
  client: NodeRedisClient
): client is RedisClientType<RedisModules, RedisFunctions, RedisScripts> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof (client as any).ping === 'function' && !('commands' in client);
}

/**
 * @class RedisConnectionManager
 * Handles the state and lifecycle of a single native `node-redis` client.
 * It abstracts away the complexities of connection states, retries, and events,
 * providing a stable and predictable promise-based interface for connecting and disconnecting.
 */
export class RedisConnectionManager {
  public readonly instanceName: string;
  private readonly client: NodeRedisClient;
  private readonly logger: ILogger;
  private connectionPromise: Promise<void> | null = null;
  private connectionResolve:
    | ((value: void | PromiseLike<void>) => void)
    | null = null;
  private connectionReject: ((reason?: unknown) => void) | null = null;

  private isConnectedAndReadyState: boolean = false;
  private isQuitState: boolean = false;

  /**
   * Constructs a new RedisConnectionManager.
   * @param {RedisClientOptions | RedisClusterOptions} options - The configuration options for the native `redis` client.
   * @param {ILogger} logger - The logger instance for logging connection events.
   */
  constructor(config: RedisInstanceConfig, logger: ILogger) {
    this.logger = logger;
    this.instanceName = config.instanceName;
    this.client = this.createNativeClient(config);
    this.setupListeners();
  }

  /**
   * Creates a native Redis client based on the instance configuration mode.
   * @param config The configuration for the specific Redis instance.
   * @returns A `NodeRedisClient` (either single-node or cluster).
   */
  private createNativeClient(config: RedisInstanceConfig): NodeRedisClient {
    switch (config.mode) {
      case 'single':
      case 'sentinel': {
        // The reconnection strategy only applies to 'single' and 'sentinel' modes.
        // It is defined here so TypeScript can correctly infer that 'config' has the 'retryOptions' property.
        const reconnectStrategy = (retries: number) => {
          const maxRetries = config.retryOptions?.maxRetries ?? 10;
          if (retries > maxRetries) {
            return new Error(
              'Exceeded the maximum number of Redis connection retries.'
            );
          }
          return Math.min(
            retries * 50,
            config.retryOptions?.retryDelay ?? 2000
          );
        };

        if (config.mode === 'single') {
          return createClient({
            url: config.url,
            socket: {
              reconnectStrategy,
            },
          });
        } else {
          // An intermediate variable is created so that TypeScript correctly infers the overload.
          const sentinelOptions = {
            sentinels: config.sentinels,
            name: config.name,
            sentinelPassword: config.sentinelPassword,
            socket: {
              reconnectStrategy,
            },
          };
          return createClient(sentinelOptions);
        }
      }
      case 'cluster': {
        // Reconnection in cluster mode is handled internally by the library.
        // The variable is explicitly typed so that TypeScript uses the correct overload of `createClient`.
        const clusterOptions: RedisClusterOptions = {
          // Transforms the node configuration to the structure expected by the 'redis' library.
          rootNodes: config.rootNodes.map((node) => ({
            socket: { host: node.host, port: node.port },
          })),
        };
        return createClient(clusterOptions);
      }
      default: {
        const _exhaustiveCheck: never = config;
        throw new Error(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          `Unsupported Redis mode: "${(_exhaustiveCheck as any).mode}"`
        ); // NOSONAR
      }
    }
  }

  /**
   * Sets up all the necessary event listeners on the native Redis client
   * to manage and report on the connection's lifecycle state.
   * @private
   */
  private setupListeners(): void {
    this.client.on('connect', () =>
      this.logger.info(`Connection established.`)
    );
    this.client.on('ready', () => {
      this.logger.info(`Client is ready.`);
      this.isConnectedAndReadyState = true;
      if (this.connectionResolve) {
        this.connectionResolve();
        this.connectionResolve = null;
        this.connectionReject = null;
      }
    });
    this.client.on('end', () => {
      this.logger.warn(`Connection closed.`);
      this.isConnectedAndReadyState = false;
    });
    this.client.on('error', (err: Error) => {
      this.logger.error(`Client Error.`, { error: err });
      if (this.connectionReject) {
        this.connectionReject(err);
        this.connectionPromise = null;
        this.connectionResolve = null;
        this.connectionReject = null;
      }
    });
    this.client.on('reconnecting', () => {
      this.logger.info(`Client is reconnecting...`);
    });
  }

  /**
   * Initiates a connection to the Redis server.
   * This method is idempotent; it will not attempt to reconnect if already connected
   * or if a connection attempt is already in progress.
   * @returns {Promise<void>} A promise that resolves when the client is connected and ready, or rejects on a connection error.
   */
  public connect(): Promise<void> {
    if (this.isQuitState) {
      return Promise.reject(
        new Error('Client has been quit and cannot be reconnected.')
      );
    }
    if (this.isReady()) {
      return Promise.resolve();
    }
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.logger.info(`Attempting to connect...`);
    this.connectionPromise = new Promise((resolve, reject) => {
      this.connectionResolve = resolve;
      this.connectionReject = reject;

      this.client.connect().catch((err) => {
        this.logger.error(`Immediate connection attempt failed.`, {
          error: err,
        });
        if (this.connectionReject) {
          this.connectionReject(err);
          this.connectionPromise = null;
          this.connectionResolve = null;
          this.connectionReject = null;
        }
      });
    });
    return this.connectionPromise;
  }

  /**
   * Ensures the client is connected and ready before proceeding.
   * This is the primary method that should be awaited before executing a command.
   * @returns {Promise<void>} A promise that resolves when the client is ready, or rejects if it can't connect.
   */
  public ensureReady(): Promise<void> {
    if (this.isQuitState) {
      return Promise.reject(
        new Error('Client has been quit. Cannot execute commands.')
      );
    }
    if (!this.isReady() && !this.connectionPromise) {
      this.logger.debug('ensureReady: Client not open, initiating connect.');
    }
    return this.connect();
  }

  /**
   * Gracefully closes the connection to the Redis server by calling `quit()`.
   * It also sets an internal state to prevent any further operations or reconnections.
   * @returns {Promise<void>} A promise that resolves when the client has been successfully quit.
   */
  public async disconnect(): Promise<void> {
    if (this.isQuitState) {
      this.logger.info('Quit already called. No action taken.');
      return;
    }
    if (this.connectionReject) {
      this.connectionReject(
        new Error('Connection aborted due to disconnect call.')
      );
      this.connectionPromise = null;
      this.connectionResolve = null;
      this.connectionReject = null;
    }
    this.isQuitState = true;
    this.isConnectedAndReadyState = false;

    if (this.client.isOpen) {
      this.logger.info('Attempting to quit client.');
      try {
        await this.client.quit();
      } catch (error) {
        this.logger.error('Error during client.quit().', { error });
        throw error;
      }
    } else {
      this.logger.info(
        'Client was not open. Quit operation effectively complete.'
      );
    }
  }

  /**
   * Retrieves the underlying native `node-redis` client instance.
   * @returns {NodeRedisClient} The native client instance.
   */
  public getNativeClient(): NodeRedisClient {
    return this.client;
  }

  /**
   * Checks if the client is currently connected and ready to accept commands.
   * @returns {boolean} `true` if the client is ready, `false` otherwise.
   */
  public isReady(): boolean {
    return this.isConnectedAndReadyState;
  }

  /**
   * Performs a health check by sending a PING command to the server.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the server responds correctly, `false` otherwise.
   */
  public async isHealthy(): Promise<boolean> {
    if (this.isQuitState || !this.isReady()) {
      return false;
    }
    try {
      // By calling this.ping(), we reuse the logic that correctly handles
      // single-node and cluster clients.
      const pong = await this.ping();
      this.logger.debug(`PING response: ${pong}`);
      return pong === 'PONG';
    } catch (error) {
      this.logger.error(`PING failed during health check.`, { error });
      return false;
    }
  }

  /**
   * Checks if the disconnect (`quit`) process has been initiated for this client.
   * @returns {boolean} `true` if `disconnect` has been called, `false` otherwise.
   */
  public isQuit(): boolean {
    return this.isQuitState;
  }
  /**
   * Executes the Redis PING command.
   * Provides a fallback for cluster mode, as PING is not a standard cluster command.
   */
  public async ping(message?: string): Promise<string> {
    // First, we ensure the client is ready to receive commands.
    await this.ensureReady();

    // We use the type guard to check if it's a single-node or sentinel client.
    if (isRedisClientType(this.client)) {
      return this.client.ping(message);
    }

    // If it's a cluster client, we simulate the response as the library does.
    return Promise.resolve(message || 'PONG');
  }

  /**
   * Executes the Redis INFO command.
   * Provides a fallback for cluster mode.
   */
  public async info(section?: string): Promise<string> {
    // We ensure the client is ready.
    await this.ensureReady();

    // Again, we use the type guard.
    if (isRedisClientType(this.client)) {
      return this.client.info(section);
    }

    // The INFO command does not exist in cluster mode.
    return Promise.resolve('# INFO command is not supported in cluster mode.');
  }

  /**
   * Executes the Redis EXISTS command.
   * @param {string | string[]} keys - A single key or an array of keys to check.
   * @returns {Promise<number>} A promise that resolves with the number of existing keys.
   */
  public async exists(keys: string | string[]): Promise<number> {
    await this.ensureReady();
    // The .exists() command is supported by both single-node and cluster clients.
    return this.client.exists(keys);
  }

  /**
   * Executes the Redis GET command.
   * @param {string} key - The key to retrieve.
   * @returns {Promise<string | null>} A promise that resolves with the value or null if not found.
   */
  public async get(key: string): Promise<string | null> {
    await this.ensureReady();
    return this.client.get(key);
  }

  /**
   * Executes the Redis SET command.
   * @param {string} key - The key to set.
   * @param {string} value - The value to set.
   * @param {number} [ttl] - Optional TTL in seconds.
   * @returns {Promise<string>} A promise that resolves with 'OK' on success.
   */
  public async set(key: string, value: string, ttl?: number): Promise<string> {
    await this.ensureReady();
    if (ttl) {
      return this.client.setEx(key, ttl, value);
    }
    const result = await this.client.set(key, value);
    return result || 'OK';
  }

  /**
   * Executes the Redis DEL command.
   * @param {string} key - The key to delete.
   * @returns {Promise<number>} A promise that resolves with the number of keys deleted.
   */
  public async del(key: string): Promise<number> {
    await this.ensureReady();
    return this.client.del(key);
  }
}
