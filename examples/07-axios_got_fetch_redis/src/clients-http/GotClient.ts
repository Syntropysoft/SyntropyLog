import { Got, OptionsInit } from 'got';
import { IHttpClient } from './IHttpClient';

export class GotClient implements IHttpClient {
  private readonly gotInstance: Got;

  constructor(client: Got) {
    this.gotInstance = client;
  }

  public async request<T>(config: OptionsInit): Promise<T> {
    // Añadimos las dos propiedades que TypeScript nos exige para saber
    // que esta llamada devolverá directamente el cuerpo JSON.
    const finalConfig: OptionsInit = {
      ...config,
      isStream: false,
      resolveBodyOnly: true,
      responseType: 'json', // Mantenemos esto por claridad
    };

    // La llamada ahora coincide perfectamente con una de las sobrecargas de 'got'.
    // No necesita <T> aquí porque 'resolveBodyOnly' ya le da el tipo correcto.
    const body = await this.gotInstance(finalConfig);

    return body as T;
  }

  // Los métodos específicos no cambian.
  public async get<T>(url: string, config?: OptionsInit): Promise<T> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  public async post<T>(
    url: string,
    data: any,
    config?: OptionsInit
  ): Promise<T> {
    return this.request<T>({ ...config, method: 'POST', url, json: data });
  }

  public async put<T>(
    url: string,
    data: any,
    config?: OptionsInit
  ): Promise<T> {
    return this.request<T>({ ...config, method: 'PUT', url, json: data });
  }

  public async patch<T>(
    url: string,
    data: any,
    config?: OptionsInit
  ): Promise<T> {
    return this.request<T>({ ...config, method: 'PATCH', url, json: data });
  }

  public async delete<T>(url: string, config?: OptionsInit): Promise<T> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }
}
