/*
  =============================================================================
  ARCHIVO NUEVO: src/clients-http/fetch/FetchClient.ts
  OBJETIVO: Crear un wrapper para la función `fetch` instrumentada, con una
            interfaz similar a la de tu `HttpClient` para Axios.
  =============================================================================
*/

import { InstrumentedFetch } from '../../../../src/http/types';
import { IHttpClient } from './IHttpClient';

/**
 * @class HttpError
 * Un error personalizado para manejar respuestas HTTP no exitosas de Fetch.
 */
export class HttpError extends Error {
  public readonly response: Response;
  public readonly status: number;

  constructor(response: Response) {
    super(`HTTP Error: ${response.status} ${response.statusText}`);
    this.name = 'HttpError';
    this.response = response;
    this.status = response.status;
  }
}

/**
 * @class FetchClient
 * Un wrapper que proporciona métodos HTTP convenientes (get, post, etc.)
 * utilizando una única función `fetch` instrumentada y de larga duración.
 * Esta clase está diseñada para ser instanciada una vez e inyectada como
 * una dependencia en tus servicios.
 */
export class FetchClient implements IHttpClient {
  private readonly instrumentedFetch: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;

  constructor(client: InstrumentedFetch) {
    this.instrumentedFetch = client;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new HttpError(response);
    }
    if (
      response.status === 204 ||
      response.headers.get('content-length') === '0'
    ) {
      return null as T;
    }
    return response.json() as Promise<T>;
  }

  // Las firmas de los métodos ya son compatibles.
  public async get<T>(url: string, config?: RequestInit): Promise<T> {
    const response = await this.instrumentedFetch(url, {
      method: 'GET',
      ...config,
    });
    return this.handleResponse<T>(response);
  }
  public async post<T>(
    url: string,
    data: any,
    config?: RequestInit
  ): Promise<T> {
    const response = await this.instrumentedFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...config?.headers },
      body: JSON.stringify(data),
      ...config,
    });
    return this.handleResponse<T>(response);
  }
  public async put<T>(
    url: string,
    data: any,
    config?: RequestInit
  ): Promise<T> {
    const response = await this.instrumentedFetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...config?.headers },
      body: JSON.stringify(data),
      ...config,
    });
    return this.handleResponse<T>(response);
  }
  public async patch<T>(
    url: string,
    data: any,
    config?: RequestInit
  ): Promise<T> {
    const response = await this.instrumentedFetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...config?.headers },
      body: JSON.stringify(data),
      ...config,
    });
    return this.handleResponse<T>(response);
  }
  public async delete<T>(url: string, config?: RequestInit): Promise<T> {
    const response = await this.instrumentedFetch(url, {
      method: 'DELETE',
      ...config,
    });
    return this.handleResponse<T>(response);
  }
}