/**
 * @file src/redis/RedisManager.ts
 * @description Manages the lifecycle of multiple instrumented Redis client instances.
 */

import { IContextManager } from '../context';
import { ILogger } from '../logger';
import { SyntropyRedisConfig } from '../config';
import { RedisConnectionManager } from './RedisConnectionManager';
import { BeaconRedis } from './BeaconRedis';
import { RedisCommandExecutor } from './RedisCommandExecutor';
import { IBeaconRedis } from './IBeaconRedis';

/**
 * Manages the creation, retrieval, and lifecycle of multiple `IBeaconRedis` instances
 * based on the provided configuration. It acts as a central point of access for all
 * Redis clients within an application.
 */
export class RedisManager {
  private readonly instances = new Map<string, IBeaconRedis>();
  private defaultInstance?: IBeaconRedis;
  private readonly logger: ILogger;
  private readonly config: SyntropyRedisConfig;
  private readonly contextManager: IContextManager;

  constructor(
    config: SyntropyRedisConfig,
    logger: ILogger,
    contextManager: IContextManager
  ) {
    this.config = config;
    this.logger = logger.child({ module: 'RedisManager' });
    this.contextManager = contextManager;
  }

  public init() {
    this.logger.trace('Initializing RedisManager...');
    
    // If no instances are configured, just log and return
    if (!this.config || !this.config.instances || this.config.instances.length === 0) {
      this.logger.trace('No Redis instances to initialize.');
      return;
    }
    
    // Functional validation: Check if configuration is valid
    const validateConfig = (): void => {
      if (!this.config || !this.config.instances || this.config.instances.length === 0) {
        throw new Error('Redis configuration is invalid: no instances configured. Please provide at least one Redis instance.');
      }
    };

    // Functional validation: Check if default instance exists (if specified)
    const validateDefaultInstance = (): void => {
      if (this.config.default) {
        const defaultExists = this.config.instances.some(instance => instance.instanceName === this.config.default);
        if (!defaultExists) {
          throw new Error(`Redis configuration error: default instance "${this.config.default}" not found in configured instances. Available instances: ${this.config.instances.map(i => i.instanceName).join(', ')}`);
    }
      }
    };

    // Functional instance creation with BeaconRedis
    const createInstances = (): void => {
    for (const instanceConfig of this.config.instances) {
        // Create connection manager
      const connectionManager = new RedisConnectionManager(
        instanceConfig,
        this.logger
      );
        
        // Create command executor
        const commandExecutor = new RedisCommandExecutor(connectionManager.getNativeClient());
        
        // Create instrumented BeaconRedis instance
        const beaconRedis = new BeaconRedis(
          instanceConfig,
          connectionManager,
          commandExecutor,
          this.logger
        );
        
        this.instances.set(instanceConfig.instanceName, beaconRedis);

        if (instanceConfig.instanceName === this.config.default) {
          this.defaultInstance = beaconRedis;
        }
      }
    };

    // Functional fallback for default instance
    const setDefaultFallback = (): void => {
    if (!this.defaultInstance && this.instances.size > 0) {
      const firstInstance = this.instances.values().next().value;
      this.defaultInstance = firstInstance;
    }
    };

    // Execute the functional pipeline
    try {
      validateConfig();
      validateDefaultInstance();
      createInstances();
      setDefaultFallback();
    } catch (error) {
      this.logger.error('RedisManager initialization failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  public getInstance(name?: string): IBeaconRedis {
    const instanceName = name ?? this.defaultInstance?.getInstanceName();
    if (!instanceName) {
      throw new Error(
        'A specific instance name was not provided and no default Redis instance is configured.'
      );
    }
    const instance = this.instances.get(instanceName);
    if (!instance) {
      throw new Error(
        `Redis instance with name "${instanceName}" was not found. Please check that the name is spelled correctly in your configuration and code.`
      );
    }
    return instance;
  }

  /**
   * Gracefully shuts down all managed Redis connections.
   * It attempts to close all connections and waits for them to complete.
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Closing all Redis connections...');
    const shutdownPromises = Array.from(this.instances.values()).map(
      (instance) => instance.quit()
    );
    await Promise.allSettled(shutdownPromises);
    this.logger.info('All Redis connections have been closed.');
  }
}
