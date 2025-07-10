/**
 * FILE: src/brokers/BrokerManager.ts (NUEVO)
 * DESCRIPTION:
 * Manages the lifecycle and creation of multiple instrumented broker client instances,
 * following the same pattern as HttpManager and RedisManager.
 */

import { ILogger } from '../logger/ILogger';
import { SyntropyLogConfig } from '../config';
import { IContextManager } from '../context/IContextManager';
import { LoggerFactory } from '../logger/LoggerFactory';
import { InstrumentedBrokerClient } from './InstrumentedBrokerClient';

export interface BrokerManagerOptions {
  config: SyntropyLogConfig;
  loggerFactory: LoggerFactory;
  contextManager: IContextManager;
}

export class BrokerManager {
  private readonly instances = new Map<string, InstrumentedBrokerClient>();
  private readonly logger: ILogger;

  constructor(private readonly options: BrokerManagerOptions) {
    this.logger = this.options.loggerFactory.getLogger('broker-manager');
    const brokerInstances = this.options.config.brokers?.instances || [];

    if (brokerInstances.length === 0) {
      this.logger.debug(
        'BrokerManager initialized, but no broker instances were defined.'
      );
      return;
    }

    for (const instanceConfig of brokerInstances) {
      try {
        const childLogger = this.options.loggerFactory.getLogger(
          instanceConfig.instanceName
        );

        // Create the instrumented client, passing the user-provided adapter.
        const instrumentedClient = new InstrumentedBrokerClient(
          instanceConfig.adapter, // The adapter injected by the user
          childLogger,
          this.options.contextManager
        );

        this.instances.set(instanceConfig.instanceName, instrumentedClient);
        this.logger.info(
          `Broker client instance "${instanceConfig.instanceName}" created successfully via adapter.`
        );
      } catch (error) {
        this.logger.error(
          `Failed to create broker client instance "${instanceConfig.instanceName}"`,
          { error }
        );
        // Here we could implement a "failing client" for brokers as well.
      }
    }
  }

  /**
   * Retrieves a managed and instrumented broker client instance by its name.
   */
  public getInstance(name: string): InstrumentedBrokerClient {
    const instance = this.instances.get(name);
    if (!instance) {
      throw new Error(
        `Broker client instance with name "${name}" was not found.`
      );
    }
    return instance;
  }

  /**
   * Gracefully disconnects all managed broker connections.
   */
  public async shutdown(): Promise<void[]> {
    this.logger.info('Disconnecting all broker clients...');
    const shutdownPromises = Array.from(this.instances.values()).map(
      (instance) => instance.disconnect()
    );
    return Promise.all(shutdownPromises);
  }
}
