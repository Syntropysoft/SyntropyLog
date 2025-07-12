/**
 * @file src/SyntropyLog.ts
 * @description The main singleton class for the SyntropyLog framework.
 * It orchestrates the initialization and shutdown of all managers.
 */
import { ZodError } from 'zod';
import { SyntropyLogConfig } from './config';
import { syntropyLogConfigSchema } from './config.schema';
import { IContextManager } from './context';
import { ILogger } from './logger';
import { LoggerFactory } from './logger/LoggerFactory';
import { RedisManager } from './redis/RedisManager';
import type { IBeaconRedis } from './redis/IBeaconRedis';
import { sanitizeConfig } from './utils/sanitizeConfig';
import { HttpManager } from './http/HttpManager';
import { InstrumentedHttpClient } from './http/InstrumentedHttpClient';
import { BrokerManager } from './brokers/BrokerManager';
import { InstrumentedBrokerClient } from './brokers/InstrumentedBrokerClient';

/**
 * @class SyntropyLog
 * @description The main entry point and orchestrator for the framework.
 * It follows the Singleton pattern to ensure a single, consistent instance
 * throughout the application's lifecycle.
 */
export class SyntropyLog {
  /** @private The singleton instance. */
  private static instance: SyntropyLog;
  /** @private A flag to ensure the framework is initialized only once. */
  private _isInitialized = false;

  /** @private The parsed and sanitized configuration for the framework. */
  private config!: SyntropyLogConfig;
  /** @private The factory for creating and managing logger instances. */
  private loggerFactory!: LoggerFactory;
  /** @private The manager for Redis client instances. */
  private redisManager!: RedisManager;
  /** @private The manager for HTTP client instances. */
  private httpManager!: HttpManager;
  /** @private The manager for message broker client instances. */
  private brokerManager!: BrokerManager;

  /** @private The constructor is private to enforce the singleton pattern. */
  private constructor() {}

  /**
   * Gets the singleton instance of the SyntropyLog class.
   * @returns {SyntropyLog} The singleton instance.
   */
  public static getInstance(): SyntropyLog {
    if (!SyntropyLog.instance) {
      SyntropyLog.instance = new SyntropyLog();
    }
    return SyntropyLog.instance;
  }

  /**
   * Initializes the framework with the provided configuration.
   * This method sets up all managers and must be called before any other method.
   * @param {SyntropyLogConfig} config - The configuration object for the framework.
   * @returns {Promise<void>}
   */
  public async init(config: SyntropyLogConfig): Promise<void> {
    if (this._isInitialized) {
      console.warn(
        '[SyntropyLog] Warning: Framework has already been initialized. Ignoring subsequent init() call.'
      );
      return;
    }

    try {
      const parsedConfig = syntropyLogConfigSchema.parse(config);
      const sanitizedConfig = sanitizeConfig(parsedConfig);
      this.config = sanitizedConfig; // Store the config for later use (e.g., in shutdown)

      this.loggerFactory = new LoggerFactory(sanitizedConfig);
      const mainLogger = this.loggerFactory.getLogger('syntropylog-main');

      this.redisManager = new RedisManager({
        config: sanitizedConfig.redis,
        logger: this.loggerFactory.getLogger('redis-manager'),
      });

      this.httpManager = new HttpManager({
        config: sanitizedConfig,
        loggerFactory: this.loggerFactory,
        contextManager: this.loggerFactory.getContextManager(),
      });

      this.brokerManager = new BrokerManager({
        config: sanitizedConfig,
        loggerFactory: this.loggerFactory,
        contextManager: this.loggerFactory.getContextManager(),
      });

      this._isInitialized = true;
      mainLogger.info('SyntropyLog framework initialized successfully.');
    } catch (error) {
      if (error instanceof ZodError) {
        console.error(
          '[SyntropyLog] Configuration validation failed:',
          error.errors
        );
      } else {
        console.error('[SyntropyLog] Failed to initialize framework:', error);
      }
      throw error;
    }
  }

  /**
   * Retrieves a logger instance by name.
   * @param {string} [name='default'] - The name of the logger.
   * @returns {ILogger} The logger instance.
   */
  public getLogger(name = 'default'): ILogger {
    this.ensureInitialized();
    return this.loggerFactory.getLogger(name);
  }

  /**
   * Retrieves a managed Redis client instance by name.
   * @param {string} name - The name of the Redis instance.
   * @returns {IBeaconRedis} The Redis client instance.
   */
  public getRedis(name: string): IBeaconRedis {
    this.ensureInitialized();
    return this.redisManager.getInstance(name);
  }

  /**
   * Retrieves a managed and instrumented HTTP client instance by name.
   * @param {string} name - The name of the HTTP client instance.
   * @returns {InstrumentedHttpClient} The HTTP client instance.
   */
  public getHttp(name: string): InstrumentedHttpClient {
    this.ensureInitialized();
    return this.httpManager.getInstance(name);
  }

  /**
   * Retrieves the context manager instance.
   * @returns {IContextManager} The context manager.
   */
  public getContextManager(): IContextManager {
    this.ensureInitialized();
    return this.loggerFactory.getContextManager();
  }

  /**
   * Retrieves a managed and instrumented message broker client instance by name.
   * @param {string} name - The name of the broker client instance.
   * @returns {InstrumentedBrokerClient} The broker client instance.
   */
  public getBroker(name: string): InstrumentedBrokerClient {
    this.ensureInitialized();
    return this.brokerManager.getInstance(name);
  }

  /**
   * Gracefully shuts down all managed clients and flushes log transports.
   * @returns {Promise<void>}
   */
  public async shutdown(): Promise<void> {
    if (!this._isInitialized) return;

    const mainLogger = this.loggerFactory.getLogger('syntropylog-main');
    mainLogger.info('Shutting down SyntropyLog framework...');

    const timeout = this.config.shutdownTimeout ?? 5000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Shutdown timed out after ${timeout}ms`)),
        timeout
      )
    );

    try {
      const shutdownWork = Promise.allSettled([
        this.redisManager.shutdown(),
        this.httpManager.shutdown(),
        this.brokerManager.shutdown(),
        this.loggerFactory.flushAllTransports(),
      ]);

      await Promise.race([shutdownWork, timeoutPromise]);
      mainLogger.info('SyntropyLog shut down successfully.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      mainLogger.warn('Shutdown process timed out.', {
        detail: 'Some resources may not have been released correctly.',
        error: error.message,
      });
    } finally {
      this._isInitialized = false;
    }
  }

  /**
   * @private
   * Throws an error if the framework has not been initialized.
   */
  private ensureInitialized(): void {
    if (!this._isInitialized) {
      throw new Error(
        'SyntropyLog has not been initialized. Call init() before accessing clients or loggers.'
      );
    }
  }
}

/** The singleton instance of the SyntropyLog framework. */
export const syntropyLog = SyntropyLog.getInstance();
