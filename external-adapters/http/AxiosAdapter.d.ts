/**
 * @file src/http/adapters/AxiosAdapter.ts
 * @description An implementation of the IHttpClientAdapter for the Axios library.
 * This class acts as a "translator," converting requests and responses
 * between the framework's generic format and the Axios-specific format.
 */
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { AdapterHttpRequest, AdapterHttpResponse, IHttpClientAdapter } from '../../src/http/adapters/adapter.types';
/**
 * @class AxiosAdapter
 * @description An adapter that allows SyntropyLog to instrument HTTP requests
 * made with the Axios library. It implements the `IHttpClientAdapter` interface.
 * @implements {IHttpClientAdapter}
 */
export declare class AxiosAdapter implements IHttpClientAdapter {
    private readonly axiosInstance;
    /**
     * @constructor
     * @param {AxiosRequestConfig | AxiosInstance} config - Either a pre-configured
     * Axios instance or a configuration object to create a new instance.
     */
    constructor(config: AxiosRequestConfig | AxiosInstance);
    /**
     * Executes an HTTP request using the configured Axios instance.
     * It translates the generic `AdapterHttpRequest` into an `AxiosRequestConfig`,
     * sends the request, and then normalizes the Axios response or error back
     * into the framework's generic format (`AdapterHttpResponse` or `AdapterHttpError`).
     * @template T The expected type of the response data.
     * @param {AdapterHttpRequest} request The generic request object.
     * @returns {Promise<AdapterHttpResponse<T>>} A promise that resolves with the normalized response.
     * @throws {AdapterHttpError} Throws a normalized error if the request fails.
     */
    request<T>(request: AdapterHttpRequest): Promise<AdapterHttpResponse<T>>;
}
