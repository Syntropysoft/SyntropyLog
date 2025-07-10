/**
 * FILE: src/http/adapters/AxiosAdapter.ts
 * DESCRIPTION:
 * Implementación del "traductor" para la librería Axios.
 * Esta clase cumple con el contrato IHttpClientAdapter y se encarga de
 * convertir las peticiones y respuestas entre el formato genérico del framework
 * y el formato específico de Axios.
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  isAxiosError,
  AxiosResponseHeaders,
  RawAxiosResponseHeaders,
} from 'axios';
import {
  AdapterHttpRequest,
  AdapterHttpResponse,
  IHttpClientAdapter,
  AdapterHttpError,
} from './adapter.types';

/**
 * Función de ayuda para normalizar el objeto de cabeceras de Axios.
 * El tipo de cabeceras de Axios es complejo (AxiosResponseHeaders), mientras que
 * nuestra interfaz espera un simple Record<string, ...>. Esta función
 * hace la conversión de forma segura.
 * @param headers - El objeto de cabeceras de Axios.
 * @returns Un objeto de cabeceras simple y normalizado.
 */
function normalizeHeaders(
  headers: RawAxiosResponseHeaders | AxiosResponseHeaders
): Record<string, string | number | string[]> {
  const normalized: Record<string, string | number | string[]> = {};
  for (const key in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, key)) {
      // Los headers de Axios pueden ser undefined, nos aseguramos de no incluirlos.
      const value = headers[key];
      if (value !== undefined && value !== null) {
        normalized[key] = value;
      }
    }
  }
  return normalized;
}

export class AxiosAdapter implements IHttpClientAdapter {
  private readonly axiosInstance: AxiosInstance;

  constructor(config: AxiosRequestConfig | AxiosInstance) {
    if ('request' in config && typeof config.request === 'function') {
      this.axiosInstance = config as AxiosInstance;
    } else {
      this.axiosInstance = axios.create(config as AxiosRequestConfig);
    }
  }

  async request<T>(
    request: AdapterHttpRequest
  ): Promise<AdapterHttpResponse<T>> {
    try {
      const axiosConfig: AxiosRequestConfig = {
        url: request.url,
        method: request.method,
        headers: request.headers,
        params: request.queryParams,
        data: request.body,
      };

      const response = await this.axiosInstance.request<T>(axiosConfig);

      // =================================================================
      //  CORRECCIÓN 1: Usamos la función de ayuda para normalizar las cabeceras.
      // =================================================================
      return {
        statusCode: response.status,
        data: response.data,
        headers: normalizeHeaders(response.headers),
      };
    } catch (error) {
      if (isAxiosError(error)) {
        // =================================================================
        //  CORRECCIÓN 2: También normalizamos las cabeceras en el objeto de error.
        // =================================================================
        const normalizedError: AdapterHttpError = {
          name: 'AdapterHttpError',
          message: error.message,
          stack: error.stack,
          isAdapterError: true,
          request: request,
          response: error.response
            ? {
                statusCode: error.response.status,
                data: error.response.data,
                headers: normalizeHeaders(error.response.headers),
              }
            : undefined,
        };
        throw normalizedError;
      }

      throw error;
    }
  }
}
