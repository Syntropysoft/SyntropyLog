/**
 * @file src/redis/RedisManager.ts
 * @description Manages the lifecycle of multiple instrumented Redis client instances.
 */

import { IContextManager } from '../context';
import { ILogger } from '../logger';
import { SyntropyRedisConfig } from '../config';
import { RedisConnectionManager } from './RedisConnectionManager';

/**
 * Manages the creation, retrieval, and lifecycle of multiple `IBeaconRedis` instances
 * based on the provided configuration. It acts as a central point of access for all
 * Redis clients within an application.
 */
export class RedisManager {
  private readonly instances = new Map<string, RedisConnectionManager>();
  private defaultInstance?: RedisConnectionManager;
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
    if (
      !this.config ||
      !this.config.instances ||
      this.config.instances.length === 0
    ) {
      this.logger.trace('No Redis instances to initialize.');
      return;
    }

    for (const instanceConfig of this.config.instances) {
      const connectionManager = new RedisConnectionManager(
        instanceConfig,
        this.logger
      );
      this.instances.set(instanceConfig.instanceName, connectionManager);

      if (instanceConfig.instanceName === this.config.default) {
        this.logger.trace(
          `Setting default Redis instance: ${instanceConfig.instanceName}`
        );
        this.defaultInstance = connectionManager;
      }
    }

    if (!this.defaultInstance && this.instances.size > 0) {
      const firstInstance = this.instances.values().next().value;
      const firstName = this.instances.keys().next().value;
      this.logger.trace(
        `No default Redis instance configured. Using first available instance: ${firstName}`
      );
      this.defaultInstance = firstInstance;
    }
  }

  public getInstance(name?: string): RedisConnectionManager {
    const instanceName = name ?? this.defaultInstance?.instanceName;
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
      (instance) => instance.disconnect()
    );
    await Promise.allSettled(shutdownPromises);
    this.logger.info('All Redis connections have been closed.');
  }
}
