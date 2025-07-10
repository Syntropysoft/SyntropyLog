/**
 * FILE: src/http/InstrumentedHttpClient.ts (NUEVO)
 * DESCRIPTION:
 * Esta clase es el corazón de la nueva arquitectura. Envuelve cualquier
 * adaptador que cumpla con IHttpClientAdapter y le añade la capa de
 * instrumentación (logging, contexto, timers) de forma centralizada.
 */

import { ILogger } from '../logger';
import { IContextManager } from '../context';
import {
  AdapterHttpRequest,
  AdapterHttpResponse,
  IHttpClientAdapter,
  AdapterHttpError,
} from './adapters/adapter.types';

// Opciones de configuración para el instrumentador, que se tomarían
// de la configuración global de SyntropyLog para una instancia específica.
export interface InstrumentorOptions {
  logRequestHeaders?: boolean;
  logRequestBody?: boolean;
  logSuccessHeaders?: boolean;
  logSuccessBody?: boolean;
  logLevel?: {
    onRequest?: 'info' | 'debug' | 'trace';
    onSuccess?: 'info' | 'debug' | 'trace';
    onError?: 'error' | 'warn' | 'fatal';
  };
}

export class InstrumentedHttpClient {
  constructor(
    private readonly adapter: IHttpClientAdapter,
    private readonly logger: ILogger,
    private readonly contextManager: IContextManager,
    private readonly options: InstrumentorOptions = {}
  ) {}

  /**
   * El único método público. Ejecuta una petición HTTP a través del adaptador
   * envuelto, aplicando toda la lógica de instrumentación.
   */
  public async request<T>(
    request: AdapterHttpRequest
  ): Promise<AdapterHttpResponse<T>> {
    const startTime = Date.now();

    if (!request.headers) {
      request.headers = {};
    }
    
    // 1. Inyectar el Correlation ID de forma genérica
    const correlationId = this.contextManager.getCorrelationId();
    if (correlationId) {
      request.headers[this.contextManager.getCorrelationIdHeaderName()] =
        correlationId;
    }

    // 2. Registrar el inicio de la petición
    this.logRequestStart(request);

    try {
      // 3. Delegar la ejecución al adaptador
      const response = await this.adapter.request<T>(request);
      const durationMs = Date.now() - startTime;

      // 4. Registrar el éxito de la petición
      this.logRequestSuccess(request, response, durationMs);

      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // 5. Registrar el fallo de la petición
      this.logRequestFailure(request, error, durationMs);

      // 6. Relanzar el error para que el código del usuario lo pueda manejar
      throw error;
    }
  }

  private logRequestStart(request: AdapterHttpRequest): void {
    const logLevel = this.options.logLevel?.onRequest ?? 'info';
    const logPayload: Record<string, any> = {
      method: request.method,
      url: request.url,
    };

    if (this.options.logRequestHeaders) {
      logPayload.headers = request.headers;
    }
    if (this.options.logRequestBody) {
      logPayload.body = request.body;
    }

    (this.logger as any)[logLevel](logPayload, 'Starting HTTP request');
  }

  private logRequestSuccess<T>(
    request: AdapterHttpRequest,
    response: AdapterHttpResponse<T>,
    durationMs: number
  ): void {
    const logLevel = this.options.logLevel?.onSuccess ?? 'info';
    const logPayload: Record<string, any> = {
      statusCode: response.statusCode,
      url: request.url,
      method: request.method,
      durationMs,
    };

    if (this.options.logSuccessHeaders) {
      logPayload.headers = response.headers;
    }
    if (this.options.logSuccessBody) {
      logPayload.body = response.data;
    }

    (this.logger as any)[logLevel](logPayload, 'HTTP response received');
  }

  private logRequestFailure(
    request: AdapterHttpRequest,
    error: unknown,
    durationMs: number
  ): void {
    const logLevel = this.options.logLevel?.onError ?? 'error';

    // Usamos el error normalizado del adaptador si está disponible
    if (error && (error as AdapterHttpError).isAdapterError) {
      const adapterError = error as AdapterHttpError;
      const logPayload: Record<string, any> = {
        err: adapterError, // El serializador se encargará de esto
        url: request.url,
        method: request.method,
        durationMs,
        response: adapterError.response
          ? {
              statusCode: adapterError.response.statusCode,
              headers: adapterError.response.headers,
              body: adapterError.response.data,
            }
          : 'No response',
      };
      (this.logger as any)[logLevel](logPayload, 'HTTP request failed');
    } else {
      // Si es un error inesperado, lo registramos también
      (this.logger as any)[logLevel](
        { err: error, url: request.url, method: request.method, durationMs },
        'HTTP request failed with an unexpected error'
      );
    }
  }
}
