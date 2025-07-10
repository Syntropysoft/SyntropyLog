/**
 * FILE: src/http/HttpManager.ts
 * DESCRIPTION: Manages the lifecycle and creation of multiple instrumented HTTP client instances.
 */

import { ILogger } from '../logger/ILogger';
import { SyntropyLogConfig, HttpClientInstanceConfig } from '../config';
import { IContextManager } from '../context/IContextManager';
import { LoggerFactory } from '../logger/LoggerFactory';
// Importamos nuestras nuevas clases y tipos
import {
  InstrumentedHttpClient,
  InstrumentorOptions,
} from './InstrumentedHttpClient';

export interface HttpManagerOptions {
  config?: SyntropyLogConfig;
  loggerFactory: LoggerFactory;
  contextManager: IContextManager;
}

/**
 * Manages the creation and retrieval of multiple instrumented HTTP client instances.
 */
export class HttpManager {
  // El mapa ahora almacena nuestra clase de instrumentación genérica.
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

    // =================================================================
    //  LÓGICA DE CREACIÓN REFACTORIZADA
    //  El 'switch' desaparece. El bucle ahora es genérico y mucho más simple.
    // =================================================================
    for (const instanceConfig of httpInstances) {
      try {
        const childLogger = this.loggerFactory.getLogger(
          instanceConfig.instanceName
        );

        // Extraemos las opciones de instrumentación desde la configuración.
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

        // Creamos el cliente instrumentado, pasándole el adaptador del usuario.
        const instrumentedClient = new InstrumentedHttpClient(
          instanceConfig.adapter, // El adaptador inyectado por el usuario
          childLogger,
          this.contextManager,
          instrumentorOptions
        );

        this.instances.set(instanceConfig.instanceName, instrumentedClient);
        this.logger.info(
          `HTTP client instance "${instanceConfig.instanceName}" created successfully via adapter.`
        );
      } catch (error) {
        // La lógica de cliente fallido se puede adaptar aquí si es necesario.
        this.logger.error(
          `Failed to create HTTP client instance "${instanceConfig.instanceName}"`,
          { error }
        );
      }
    }
  }

  /**
   * El método getInstance ahora devuelve nuestra clase instrumentada,
   * que tiene una API unificada a través del método .request().
   */
  public getInstance(name: string): InstrumentedHttpClient {
    const instance = this.instances.get(name);
    if (!instance) {
      throw new Error(
        `HTTP client instance with name "${name}" was not found.`
      );
    }
    return instance;
  }

  public async shutdown(): Promise<void> {
    if (this.instances.size > 0) {
      this.logger.info('Shutting down HTTP clients.');
    }
    this.instances.clear();
    return Promise.resolve();
  }
}
