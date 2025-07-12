/**
 * @file src/redis/RedisManager.ts
 * @description Manages the lifecycle of multiple instrumented Redis client instances.
 */

import { ILogger } from '../logger/ILogger';
import {
  SyntropyRedisConfig,
  RedisInstanceReconfigurableConfig,
} from '../config'; // Import from the central configuration
import { createFailingRedisClient } from '../utils/createFailingClient';
import { BeaconRedis } from './BeaconRedis';
import type { IBeaconRedis } from './IBeaconRedis';
import { RedisConnectionManager } from './RedisConnectionManager';
import { RedisCommandExecutor } from './RedisCommandExecutor';

/**
 * Defines the options for constructing a `RedisManager`.
 */
export interface RedisManagerOptions {
  /** The main Redis configuration object containing all instance definitions. */
  config?: SyntropyRedisConfig;
  /** A list of field names whose values should be masked in logs across all instances. */
  sensitiveCommandValueFields?: string[];
  /** A list of patterns to match field names for masking across all instances. */
  sensitiveCommandValuePatterns?: (string | RegExp)[];
  /**
   * The central logger instance. This is the only mandatory property.
   * The manager will create child loggers for each Redis instance.
   * @type {ILogger}
   */
  logger: ILogger;
}

/**
 * Manages the creation, retrieval, and lifecycle of multiple `IBeaconRedis` instances
 * based on the provided configuration. It acts as a central point of access for all
 * Redis clients within an application.
 */
export class RedisManager {
  private readonly instances = new Map<string, IBeaconRedis>();
  private readonly logger: ILogger;
  private readonly sensitiveCommandValueFields: string[];
  private readonly sensitiveCommandValuePatterns: (string | RegExp)[];

  /**
   * Constructs a RedisManager.
   * It iterates through the provided instance configurations, creates the corresponding
   * native Redis clients, wraps them in `BeaconRedis` for instrumentation, and stores them for retrieval.
   * @param {RedisManagerOptions} options - The configuration and logger for the manager.
   */
  constructor(options: RedisManagerOptions) {
    const {
      config,
      sensitiveCommandValueFields = [],
      sensitiveCommandValuePatterns = [],
      logger,
    } = options;

    this.logger = logger;
    this.sensitiveCommandValueFields = sensitiveCommandValueFields;
    this.sensitiveCommandValuePatterns = sensitiveCommandValuePatterns;

    if (!config || !config.instances || config.instances.length === 0) {
      this.logger.debug(
        'No Redis configuration was provided or no instances were defined. RedisManager initialized empty.'
      );
      return;
    }

    for (const instanceConfig of config.instances) {
      try {
        const childLogger = this.logger.child({
          instance: instanceConfig.instanceName,
        });

        // 1. Create the ConnectionManager, passing it the instance configuration.
        const connectionManager = new RedisConnectionManager(
          instanceConfig,
          childLogger
        );

        // 2. Ask the ConnectionManager for the native client it just created.
        const nativeClient = connectionManager.getNativeClient();

        // 3. Create the CommandExecutor with that native client.
        const commandExecutor = new RedisCommandExecutor(nativeClient);

        // 4. Assemble the final instrumented BeaconRedis client with all the pieces.
        const beaconRedis = new BeaconRedis(
          instanceConfig,
          connectionManager,
          commandExecutor,
          childLogger
        );

        this.instances.set(instanceConfig.instanceName, beaconRedis);
        this.logger.debug(
          `Redis instance "${instanceConfig.instanceName}" created successfully.`
        );
      } catch (error) {
        this.logger.error(
          `Failed to create Redis instance "${instanceConfig.instanceName}"`,
          { error }
        );
        // Instead of omitting the instance, create a "failing" client.
        // This ensures that getInstance() does not fail, but any operation
        // with the client will, with a clear message.
        const failingClient = createFailingRedisClient(
          instanceConfig.instanceName,
          error as Error,
          this.logger
        );
        this.instances.set(instanceConfig.instanceName, failingClient);
      }
    }
  }

  /**
   * Retrieves a managed Redis instance by its name.
   * @param {string} name - The name of the instance to retrieve, as defined in the configuration.
   * @returns The `IBeaconRedis` instance.
   * @throws {Error} if no instance with the given name is found.
   */
  public getInstance(name: string): IBeaconRedis {
    const instance = this.instances.get(name);
    if (!instance) {
      throw new Error(
        `Redis instance with name "${name}" was not found. Please check that the name is spelled correctly in your configuration and code.`
      );
    }
    return instance;
  }

  /**
   * Dynamically updates the configuration of a specific Redis instance.
   * @param {string} instanceName - The name of the instance to reconfigure.
   * @param {Partial<RedisInstanceReconfigurableConfig>} newConfig - A partial configuration object with the new reconfigurable options.
   */
  public updateInstanceConfig(
    instanceName: string,
    newConfig: Partial<RedisInstanceReconfigurableConfig>
  ): void {
    const instance = this.instances.get(instanceName);
    if (instance) {
      instance.updateConfig(newConfig);
    } else {
      this.logger.warn(
        `Attempted to reconfigure Redis instance "${instanceName}", but it was not found.`
      );
    }
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
