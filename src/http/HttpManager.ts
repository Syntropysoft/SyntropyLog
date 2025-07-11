/**
 * FILE: src/http/HttpManager.ts
 * @description Manages the lifecycle and creation of multiple instrumented HTTP client instances.
 */

import { ILogger } from '../logger/ILogger';
import { SyntropyLogConfig } from '../config';
import { IContextManager } from '../context/IContextManager';
import { LoggerFactory } from '../logger/LoggerFactory';
import {
  InstrumentedHttpClient,
  InstrumentorOptions,
} from './InstrumentedHttpClient';
import { createFailingHttpClient } from '../utils/createFailingClient';

/**
 * @interface HttpManagerOptions
 * @description Defines the options required to initialize the HttpManager.
 */
export interface HttpManagerOptions {
  /** The main application configuration. */
  config?: SyntropyLogConfig;
  /** The factory for creating logger instances. */
  loggerFactory: LoggerFactory;
  /** The manager for handling asynchronous contexts. */
  contextManager: IContextManager;
}

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
  /** @private A reference to the logger factory for creating child loggers. */
  private readonly loggerFactory: LoggerFactory;
  /** @private The global application configuration. */
  private readonly globalConfig: SyntropyLogConfig;

  constructor(options: HttpManagerOptions) {
    this.loggerFactory = options.loggerFactory;
    this.contextManager = options.contextManager;
    this.globalConfig = options.config || {};
    this.logger = this.loggerFactory.getLogger('http-manager');

    const httpInstances = this.globalConfig.http?.instances || [];
    if (httpInstances.length === 0) {
      this.logger.debug(
        'HttpManager initialized, but no HTTP client instances were defined.'
      );
      return;
    }

    // The creation logic is now generic. It iterates through the instance
    // configurations and uses the provided adapter, regardless of its underlying
    // implementation (e.g., Axios, Got, Fetch).
    for (const instanceConfig of httpInstances) {
      try {
        const childLogger = this.loggerFactory.getLogger(
          instanceConfig.instanceName
        );

        // Extract instrumentation options from the configuration for this instance.
        const instrumentorOptions: InstrumentorOptions = {
          logRequestHeaders: instanceConfig.logging?.logRequestHeaders,
          logRequestBody: instanceConfig.logging?.logRequestBody,
          logSuccessHeaders: instanceConfig.logging?.logSuccessHeaders,
          logSuccessBody: instanceConfig.logging?.logSuccessBody,
          logLevel: {
            onRequest: instanceConfig.logging?.onRequest,
            onSuccess: instanceConfig.logging?.onSuccess,
            onError: instanceConfig.logging?.onError,
          },
        };

        // Create the instrumented client, passing the user-provided adapter.
        const instrumentedClient = new InstrumentedHttpClient(
          instanceConfig.adapter,
          childLogger,
          this.contextManager,
          instrumentorOptions
        );

        this.instances.set(instanceConfig.instanceName, instrumentedClient);
        this.logger.info(
          `HTTP client instance "${instanceConfig.instanceName}" created successfully via adapter.`
        );
      } catch (error) {
        // If initialization fails, create a "failing client" for resilience.
        // This prevents the application from crashing and provides clear error logs
        // when an attempt is made to use the failing client.
        this.logger.error(
          `Failed to create HTTP client instance "${instanceConfig.instanceName}"`,
          { error }
        );
        const failingClient = createFailingHttpClient(
          instanceConfig.instanceName,
          // We cannot safely access the adapter here if it's the source of the error.
          'UnknownAdapter',
          this.logger
        );
        this.instances.set(instanceConfig.instanceName, failingClient);
      }
    }
  }

  /**
   * Retrieves a managed and instrumented HTTP client instance by its name.
   * The returned client has a unified API via its `.request()` method.
   * @param {string} name - The name of the HTTP client instance to retrieve.
   * @returns {InstrumentedHttpClient} The requested client instance.
   * @throws {Error} If no instance with the given name is found.
   */
  public getInstance(name: string): InstrumentedHttpClient {
    const instance = this.instances.get(name);
    if (!instance) {
      throw new Error(
        `HTTP client instance with name "${name}" was not found. Check your configuration.`
      );
    }
    return instance;
  }

  /**
   * Clears all managed HTTP client instances. This is a simple cleanup operation.
   */
  public async shutdown(): Promise<void> {
    if (this.instances.size > 0) {
      this.logger.info('Shutting down HTTP clients.');
    }
    this.instances.clear();
    return Promise.resolve();
  }
}
