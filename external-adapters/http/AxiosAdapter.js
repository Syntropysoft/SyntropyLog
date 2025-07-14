"use strict";
/**
 * @file src/http/adapters/AxiosAdapter.ts
 * @description An implementation of the IHttpClientAdapter for the Axios library.
 * This class acts as a "translator," converting requests and responses
 * between the framework's generic format and the Axios-specific format.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AxiosAdapter = void 0;
const axios_1 = __importStar(require("axios"));
/**
 * A helper function to normalize the Axios headers object.
 * The Axios header type is complex (`AxiosResponseHeaders` | `RawAxiosResponseHeaders`),
 * while our adapter interface expects a simple `Record<string, ...>`.
 * This function performs the conversion safely.
 * @param {RawAxiosResponseHeaders | AxiosResponseHeaders} headers - The Axios headers object.
 * @returns {Record<string, string | number | string[]>} A simple, normalized headers object.
 */
function normalizeHeaders(headers) {
    const normalized = {};
    for (const key in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, key)) {
            // Axios headers can be undefined, so we ensure they are not included.
            const value = headers[key];
            if (value !== undefined && value !== null) {
                normalized[key] = value;
            }
        }
    }
    return normalized;
}
/**
 * @class AxiosAdapter
 * @description An adapter that allows SyntropyLog to instrument HTTP requests
 * made with the Axios library. It implements the `IHttpClientAdapter` interface.
 * @implements {IHttpClientAdapter}
 */
class AxiosAdapter {
    axiosInstance;
    /**
     * @constructor
     * @param {AxiosRequestConfig | AxiosInstance} config - Either a pre-configured
     * Axios instance or a configuration object to create a new instance.
     */
    constructor(config) {
        if ('request' in config && typeof config.request === 'function') {
            this.axiosInstance = config;
        }
        else {
            this.axiosInstance = axios_1.default.create(config);
        }
    }
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
    async request(request) {
        try {
            const axiosConfig = {
                url: request.url,
                method: request.method,
                headers: request.headers,
                params: request.queryParams,
                data: request.body,
            };
            const response = await this.axiosInstance.request(axiosConfig);
            return {
                statusCode: response.status,
                data: response.data,
                headers: normalizeHeaders(response.headers),
            };
        }
        catch (error) {
            if ((0, axios_1.isAxiosError)(error)) {
                const normalizedError = {
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
exports.AxiosAdapter = AxiosAdapter;
//# sourceMappingURL=AxiosAdapter.js.map