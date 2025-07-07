import { AxiosInstance, AxiosRequestConfig } from 'axios';;
import { IHttpClient } from './IHttpClient'; // <-- IMPORTAR LA INTERFAZ

export class AxiosClient implements IHttpClient {
  // <-- IMPLEMENTAR LA INTERFAZ
  private readonly axiosInstance: AxiosInstance;

  constructor(client: AxiosInstance) {
    this.axiosInstance =client;
  }

  // Las firmas de los métodos ya son compatibles.
  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.get<T>(url, config);
    return response.data;
  }
  public async post<T>(
    url: string,
    data: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.axiosInstance.post<T>(url, data, config);
    return response.data;
  }
  public async put<T>(
    url: string,
    data: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.axiosInstance.put<T>(url, data, config);
    return response.data;
  }
  public async patch<T>(
    url: string,
    data: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.axiosInstance.patch<T>(url, data, config);
    return response.data;
  }
  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.delete<T>(url, config);
    return response.data;
  }
}
