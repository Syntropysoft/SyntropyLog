/**
 * FILE: src/http/HttpManager.ts
 * @description Manages the lifecycle and creation of multiple instrumented HTTP client instances.
 */

import { IContextManager } from '../context';
import { ILogger } from '../logger';
import { InstrumentedHttpClient } from './InstrumentedHttpClient';
import { SyntropyHttpConfig } from '../config';
import { errorToJsonValue } from '../types';

/**
 * @class HttpManager
 * @description Manages the creation and retrieval of multiple instrumented HTTP client instances.
 * It reads the configuration, creates an `InstrumentedHttpClient` for each defined
 * instance by wrapping the user-provided adapter, and provides a way to retrieve them.
 */
export class HttpManager {
  /** @private A map storing the created instrumented client instances by name. */
  private readonly instances = new Map<string, InstrumentedHttpClient>();
  /** @private The logger instance for the manager itself. */
  private readonly logger: ILogger;
  /** @private A reference to the context manager for dependency injection. */
  private readonly contextManager: IContextManager;
  /** @private The global application configuration. */
  private readonly config: SyntropyHttpConfig;
  /** @private The name of the default HTTP client instance. */
  private defaultInstance?: InstrumentedHttpClient;

  constructor(
    config: SyntropyHttpConfig,
    logger: ILogger,
    contextManager: IContextManager
  ) {
    this.config = config;
    this.logger = logger.child({ module: 'HttpManager' });
    this.contextManager = contextManager;
  }

  public init() {
    this.logger.trace('Initializing HttpManager...');
    if (!this.config.instances || this.config.instances.length === 0) {
      this.logger.debug(
        'HttpManager initialized, but no HTTP client instances were defined.'
      );
      return;
    }

    for (const instanceConfig of this.config.instances) {
      try {
        const client = new InstrumentedHttpClient(
          instanceConfig.adapter,
          this.logger,
          this.contextManager,
          instanceConfig
        );
        this.instances.set(instanceConfig.instanceName, client);
        this.logger.info(
          `HTTP client instance "${instanceConfig.instanceName}" created successfully via adapter.`
        );

        if (instanceConfig.isDefault) {
          if (this.defaultInstance) {
            this.logger.warn(
              `Multiple default HTTP instances defined. Overwriting previous default "${this.defaultInstance.instanceName}" with "${instanceConfig.instanceName}".`
            );
          }
          this.logger.trace(
            `Setting default HTTP instance: ${instanceConfig.instanceName}`
          );
          this.defaultInstance = client;
        }
      } catch (error) {
        this.logger.error(
          { error: errorToJsonValue(error) },
          `Failed to create HTTP client instance "${instanceConfig.instanceName}"`
        );
      }
    }

    if (!this.defaultInstance && this.instances.size > 0) {
      const firstInstance = this.instances.values().next().value;
      const firstName = this.instances.keys().next().value;
      this.logger.trace(
        `No default HTTP instance configured. Using first available instance: ${firstName}`
      );
      this.defaultInstance = firstInstance;
    }
  }

  /**
   * Retrieves a managed and instrumented HTTP client instance by its name.
   * The returned client has a unified API via its `.request()` method.
   * @param {string} name - The name of the HTTP client instance to retrieve.
   * @returns {InstrumentedHttpClient} The requested client instance.
   * @throws {Error} If no instance with the given name is found.
   */
  public getInstance(name?: string): InstrumentedHttpClient {
    const instanceName = name ?? this.defaultInstance?.instanceName;
    if (!instanceName) {
      throw new Error(
        'A specific instance name was not provided and no default HTTP instance is configured.'
      );
    }
    const instance = this.instances.get(instanceName);
    if (!instance) {
      throw new Error(
        `HTTP client instance with name "${instanceName}" was not found. Check your configuration.`
      );
    }
    return instance;
  }

  /**
   * Clears all managed HTTP client instances. This is a simple cleanup operation.
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down HTTP clients.');
    this.instances.clear();
    // HTTP clients do not require explicit shutdown, so we just clear the map.
    return Promise.resolve();
  }
}
