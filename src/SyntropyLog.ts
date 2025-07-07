/**
 * FILE: src/SyntropyLog.ts
 * DESCRIPTION: The main facade for the SyntropyLog framework.
 * It provides a singleton instance to initialize and access all framework components.
 */

import { ZodError } from 'zod';
import { SyntropyLogConfig } from './config'; // Assuming we rename BeaconLogConfig to SyntropyLogConfig
import { syntropyLogConfigSchema } from './config.schema';
import { IContextManager } from './context';
import { ILogger } from './logger';
import { LoggerFactory } from './logger/LoggerFactory';
import { RedisManager } from './redis/RedisManager';
import type { IBeaconRedis } from './redis/IBeaconRedis';
import { sanitizeConfig } from './utils/sanitizeConfig';
import { checkPeerDependencies } from './utils/dependencyCheck';
// We will need an HttpManager similar to RedisManager
// import { HttpManager } from './http/HttpManager';
// import { InstrumentedHttpClient } from './http/types';

/**
 * The main class for the SyntropyLog framework.
 * It follows a singleton pattern and acts as the central point for configuration and client access.
 */
export class SyntropyLog {
  private static instance: SyntropyLog;
  private _isInitialized = false;

  // Managers for different framework parts
  private loggerFactory!: LoggerFactory;
  private redisManager!: RedisManager;
  // private httpManager!: HttpManager;

  // Private constructor to enforce singleton pattern
  private constructor() {}

  /**
   * Gets the singleton instance of the SyntropyLog class.
   */
  public static getInstance(): SyntropyLog {
    if (!SyntropyLog.instance) {
      SyntropyLog.instance = new SyntropyLog();
    }
    return SyntropyLog.instance;
  }

  /**
   * Initializes the entire SyntropyLog framework with a given configuration.
   * This method should be called once when the application starts.
   * @param config - The configuration object for the framework.
   */
  public async init(config: SyntropyLogConfig): Promise<void> {
    if (this._isInitialized) {
      console.warn(
        '[SyntropyLog] Warning: Framework has already been initialized. Ignoring subsequent init() call.'
      );
      return;
    }

    try {
      // 1. Validate the configuration object against the schema
      const parsedConfig = syntropyLogConfigSchema.parse(config);

      // 2. Sanitize the configuration to prevent leaking credentials in framework logs
      const sanitizedConfig = sanitizeConfig(parsedConfig);

      // 3. Check for optional peer dependencies based on the config
      checkPeerDependencies(sanitizedConfig);

      // 4. Instantiate the central orchestrator (LoggerFactory)
      this.loggerFactory = new LoggerFactory(sanitizedConfig);
      const mainLogger = this.loggerFactory.getLogger('syntropylog-main');

      // 5. Instantiate other managers, injecting the required loggers
      this.redisManager = new RedisManager({
        config: sanitizedConfig.redis,
        logger: this.loggerFactory.getLogger('redis-manager'),
      });

      // this.httpManager = new HttpManager({ ... });

      this._isInitialized = true;
      mainLogger.info('SyntropyLog framework initialized successfully.');
    } catch (error) {
      // Handle Zod validation errors specifically for clearer messages
      if (error instanceof ZodError) {
        console.error(
          '[SyntropyLog] Configuration validation failed:',
          error.errors
        );
      } else {
        console.error('[SyntropyLog] Failed to initialize framework:', error);
      }
      // Re-throw the error to allow the application to decide how to handle a failed init
      throw error;
    }
  }

  /**
   * Retrieves a named logger instance.
   * @param name - The name for the logger (e.g., 'AuthService'). Defaults to 'default'.
   * @returns An ILogger instance.
   */
  public getLogger(name = 'default'): ILogger {
    this.ensureInitialized();
    return this.loggerFactory.getLogger(name);
  }

  /**
   * Retrieves a named Redis client instance.
   * @param name - The name of the Redis instance as defined in the configuration.
   * @returns An IBeaconRedis instance.
   */
  public getRedis(name: string): IBeaconRedis {
    this.ensureInitialized();
    return this.redisManager.getInstance(name);
  }

  /**
   * Gracefully shuts down all framework components.
   * This includes flushing transport buffers and closing connections.
   */
  public async shutdown(): Promise<void> {
    if (!this._isInitialized) return;

    const mainLogger = this.loggerFactory.getLogger('syntropylog-main');
    mainLogger.info('Shutting down SyntropyLog framework...');

    // Create a timeout to prevent shutdown from hanging indefinitely
    const timeout = syntropyLogConfigSchema.parse({}).shutdownTimeout ?? 5000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Shutdown timed out after ${timeout}ms`)),
        timeout
      )
    );

    try {
      const shutdownWork = Promise.allSettled([
        this.redisManager.shutdown(),
        // this.httpManager.shutdown(),
        this.loggerFactory.flushAllTransports(),
      ]);

      await Promise.race([shutdownWork, timeoutPromise]);
      mainLogger.info('SyntropyLog shut down successfully.');
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
   * A private guard method that throws an error if a component is accessed before initialization.
   */
  private ensureInitialized(): void {
    if (!this._isInitialized) {
      throw new Error(
        'SyntropyLog has not been initialized. Call init() before accessing clients or loggers.'
      );
    }
  }
}

/**
 * The exported singleton instance of the SyntropyLog class.
 * This is the main entry point for interacting with the library.
 */
export const syntropyLog = SyntropyLog.getInstance();
