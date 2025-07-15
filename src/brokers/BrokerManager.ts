/**
 * FILE: src/brokers/BrokerManager.ts
 * DESCRIPTION:
 * Manages the lifecycle and creation of multiple instrumented broker client instances,
 * following the same pattern as HttpManager and RedisManager.
 */

import { IContextManager } from '../context';
import { SyntropyBrokerConfig } from '../config';
import { ILogger } from '../logger';
import { InstrumentedBrokerClient } from './InstrumentedBrokerClient';

/**
 * @interface BrokerManagerOptions
 * @description Defines the options required to initialize the BrokerManager.
 */
export interface BrokerManagerOptions {
  /** The main application configuration. */
  config: SyntropyBrokerConfig;
  /** The factory for creating logger instances. */
  loggerFactory: ILogger;
  /** The manager for handling asynchronous contexts. */
  contextManager: IContextManager;
}

/**
 * @class BrokerManager
 * @description Manages the lifecycle and creation of multiple instrumented broker client instances.
 * It reads the configuration, creates an `InstrumentedBrokerClient` for each defined
 * instance, and provides a way to retrieve them and shut them down gracefully.
 */
export class BrokerManager {
  private readonly instances = new Map<string, InstrumentedBrokerClient>();
  private defaultInstance?: InstrumentedBrokerClient;
  private readonly logger: ILogger;
  private readonly config: SyntropyBrokerConfig;
  private readonly contextManager: IContextManager;

  constructor(
    config: SyntropyBrokerConfig,
    logger: ILogger,
    contextManager: IContextManager
  ) {
    this.config = config;
    this.logger = logger.child({ module: 'BrokerManager' });
    this.contextManager = contextManager;
  }

  public async init(): Promise<void> {
    this.logger.trace('Initializing BrokerManager...');
    if (!this.config.instances || this.config.instances.length === 0) {
      this.logger.debug(
        'BrokerManager initialized, but no broker instances were defined.'
      );
      return;
    }

    const creationPromises = this.config.instances.map(
      async (instanceConfig) => {
        try {
          const client = new InstrumentedBrokerClient(
            instanceConfig.adapter,
            this.logger,
            this.contextManager,
            instanceConfig
          );
          await client.connect(); // Connect is likely async
          this.instances.set(instanceConfig.instanceName, client);
          this.logger.info(
            `Broker client instance "${instanceConfig.instanceName}" created and connected successfully.`
          );

          if (instanceConfig.instanceName === this.config.default) {
            this.logger.trace(
              `Setting default broker instance: ${instanceConfig.instanceName}`
            );
            this.defaultInstance = client;
          }
        } catch (error) {
          this.logger.error(
            `Failed to create broker instance "${instanceConfig.instanceName}":`,
            error
          );
        }
      }
    );

    await Promise.all(creationPromises);

    if (!this.defaultInstance && this.instances.size > 0) {
      const firstInstance = this.instances.values().next().value;
      const firstName = this.instances.keys().next().value;
      this.logger.trace(
        `No default broker instance configured. Using first available instance: ${firstName}`
      );
      this.defaultInstance = firstInstance;
    }
  }

  public getInstance(name?: string): InstrumentedBrokerClient {
    const instanceName = name ?? this.defaultInstance?.instanceName;
    if (!instanceName) {
      throw new Error(
        'A specific instance name was not provided and no default Broker instance is configured.'
      );
    }
    const instance = this.instances.get(instanceName);
    if (!instance) {
      throw new Error(
        `Broker client instance with name "${instanceName}" was not found. Check your configuration.`
      );
    }
    return instance;
  }

  public async shutdown(): Promise<void> {
    this.logger.info('Disconnecting all broker clients...');
    const shutdownPromises = Array.from(this.instances.values()).map(
      (instance) => instance.disconnect()
    );
    await Promise.allSettled(shutdownPromises);
  }
}
