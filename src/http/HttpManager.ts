/**
 * FILE: src/http/HttpManager.ts
 * DESCRIPTION: Manages the lifecycle and creation of multiple instrumented HTTP client instances.
 */

import { ILogger } from '../logger/ILogger';
import { SyntropyLogConfig, HttpClientInstanceConfig } from '../config';
import { IContextManager } from '../context/IContextManager';
import { createInstrumentedAxios } from '../instrumentations/axios/createInstrumentedAxios';
import { createInstrumentedFetch } from '../instrumentations/fetch/createInstrumentedFetch';
import { createInstrumentedGot } from '../instrumentations/got/createInstrumentedGot';
import { createFailingHttpClient } from '../utils/createFailingClient';
import { InstrumentedHttpClient } from './types';
import { LoggerFactory } from '../logger/LoggerFactory';

export interface HttpManagerOptions {
  config?: SyntropyLogConfig;
  loggerFactory: LoggerFactory;
  contextManager: IContextManager;
}

/**
 * Manages the creation and retrieval of multiple instrumented HTTP client instances.
 */
export class HttpManager {
  private readonly instances = new Map<string, InstrumentedHttpClient>();
  private readonly logger: ILogger;
  private readonly contextManager: IContextManager;
  private readonly loggerFactory: LoggerFactory;
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

    for (const instanceConfig of httpInstances) {
      try {
        const client = this.createClient(instanceConfig);
        this.instances.set(instanceConfig.instanceName, client);
        this.logger.info(
          `HTTP client instance "${instanceConfig.instanceName}" (type: ${instanceConfig.type}) created successfully.`
        );
      } catch (error) {
        this.logger.error(
          `Failed to create HTTP client instance "${instanceConfig.instanceName}"`,
          { error }
        );
        const failingClient = createFailingHttpClient(
          instanceConfig.instanceName,
          instanceConfig.type,
          this.logger
        );
        this.instances.set(instanceConfig.instanceName, failingClient);
      }
    }
  }

  public getInstance<T extends InstrumentedHttpClient>(name: string): T {
    const instance = this.instances.get(name);
    if (!instance) {
      throw new Error(
        `HTTP client instance with name "${name}" was not found.`
      );
    }
    return instance as T;
  }

  public async shutdown(): Promise<void> {
    if (this.instances.size > 0) {
      this.logger.info('Shutting down HTTP clients.');
    }
    this.instances.clear();
    return Promise.resolve();
  }

  private createClient(
    instanceConfig: HttpClientInstanceConfig
  ): InstrumentedHttpClient {
    const childLogger = this.loggerFactory.getLogger(
      instanceConfig.instanceName
    );

    switch (instanceConfig.type) {
      case 'axios':
        return createInstrumentedAxios(
          childLogger,
          this.contextManager,
          this.globalConfig,
          instanceConfig
        );
      case 'fetch':
        return createInstrumentedFetch(
          childLogger,
          this.contextManager,
          this.globalConfig,
          instanceConfig
        );
      case 'got':
        return createInstrumentedGot(
          childLogger,
          this.contextManager,
          this.globalConfig,
          instanceConfig
        );
      default: {
        const _exhaustiveCheck: never = instanceConfig;
        throw new Error(
          `Unsupported HTTP client type: "${(_exhaustiveCheck as any).type}"`
        );
      }
    }
  }
}
