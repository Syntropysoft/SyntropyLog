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

  private loggerFactory!: LoggerFactory;
  private redisManager!: RedisManager;
  // private httpManager!: HttpManager;

  private constructor() {}

  public static getInstance(): SyntropyLog {
    if (!SyntropyLog.instance) {
      SyntropyLog.instance = new SyntropyLog();
    }
    return SyntropyLog.instance;
  }

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
      checkPeerDependencies(sanitizedConfig);

      this.loggerFactory = new LoggerFactory(sanitizedConfig);
      const mainLogger = this.loggerFactory.getLogger('syntropylog-main');

      this.redisManager = new RedisManager({
        config: sanitizedConfig.redis,
        logger: this.loggerFactory.getLogger('redis-manager'),
      });

      // this.httpManager = new HttpManager({ ... });

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

  public getLogger(name = 'default'): ILogger {
    this.ensureInitialized();
    return this.loggerFactory.getLogger(name);
  }

  public getRedis(name: string): IBeaconRedis {
    this.ensureInitialized();
    return this.redisManager.getInstance(name);
  }

  /**
   * Retrieves the shared ContextManager instance.
   * Useful for manually creating and managing asynchronous contexts.
   * @returns An IContextManager instance.
   */
  public getContextManager(): IContextManager {
    this.ensureInitialized();
    // The contextManager is created and managed by the LoggerFactory
    return this.loggerFactory.getContextManager();
  }

  public async shutdown(): Promise<void> {
    if (!this._isInitialized) return;

    const mainLogger = this.loggerFactory.getLogger('syntropylog-main');
    mainLogger.info('Shutting down SyntropyLog framework...');

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

  private ensureInitialized(): void {
    if (!this._isInitialized) {
      throw new Error(
        'SyntropyLog has not been initialized. Call init() before accessing clients or loggers.'
      );
    }
  }
}

export const syntropyLog = SyntropyLog.getInstance();
