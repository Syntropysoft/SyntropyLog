/**
 * FILE: tests/http/adapters/AxiosAdapter.test.ts
 * DESCRIPTION: Unit tests for the AxiosAdapter class.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { AxiosAdapter } from '../../../src/http/adapters/AxiosAdapter';
import { AdapterHttpRequest, AdapterHttpError } from '../../../src/http/adapters/adapter.types';

// --- Mocks ---

vi.mock('axios', async (importOriginal) => {
  const actualAxios = await importOriginal<typeof import('axios')>();
  return {
    ...actualAxios,
    default: {
      ...actualAxios.default,
      // Mock the create method to be controlled in tests.
      // This avoids hoisting issues with top-level variables in the mock factory.
      create: vi.fn(),
    },
    // We need the real isAxiosError for type guarding in our adapter
    isAxiosError: actualAxios.isAxiosError,
  };
});

// --- Tests ---

describe('AxiosAdapter', () => {
  // This will hold the mock for the `request` function on a created axios instance.
  const mockRequest = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Before each test, we configure the mocked `axios.create` to return
    // a mock instance that uses our `mockRequest` function.
    (axios.create as vi.Mock).mockReturnValue({
      request: mockRequest,
    });
  });

  describe('Constructor', () => {
    it('should create a new axios instance when a config object is provided', () => {
      const config: AxiosRequestConfig = { baseURL: 'https://api.test.com' };
      new AxiosAdapter(config);
      expect(axios.create).toHaveBeenCalledWith(config);
    });

    it('should use an existing axios instance if one is provided', () => {
      // Create a mock instance to pass to the adapter.
      const existingInstance = { request: vi.fn() } as unknown as AxiosInstance;
      const adapter = new AxiosAdapter(existingInstance);

      // Verify that the constructor did NOT call `axios.create`.
      expect(axios.create).not.toHaveBeenCalled();
      // @ts-expect-error - Accessing private property for testing purposes.
      expect(adapter.axiosInstance).toBe(existingInstance);
    });
  });

  describe('request', () => {
    let adapter: AxiosAdapter;
    const baseRequest: AdapterHttpRequest = {
      method: 'GET',
      url: '/users',
      headers: { 'x-request-id': '123' },
      queryParams: { page: 1 },
      body: { data: 'payload' },
    };

    beforeEach(() => {
      // This will call our mocked `axios.create` from the top-level beforeEach,
      // setting up the adapter with an instance that uses `mockRequest`.
      adapter = new AxiosAdapter({});
    });

    it('should make a successful request and return a normalized response', async () => {
      const mockAxiosResponse = {
        status: 200,
        data: { id: 1, name: 'John Doe' },
        headers: { 'content-type': 'application/json', 'x-response-id': 'abc' },
        config: {} as any,
        statusText: 'OK',
      };
      mockRequest.mockResolvedValue(mockAxiosResponse);

      const response = await adapter.request(baseRequest);

      // Verify the request was correctly translated for axios
      expect(mockRequest).toHaveBeenCalledWith({
        url: baseRequest.url,
        method: baseRequest.method,
        headers: baseRequest.headers,
        params: baseRequest.queryParams,
        data: baseRequest.body,
      });

      // Verify the response was correctly normalized
      expect(response).toEqual({
        statusCode: 200,
        data: { id: 1, name: 'John Doe' },
        headers: { 'content-type': 'application/json', 'x-response-id': 'abc' },
      });
    });

    it('should handle an AxiosError and throw a normalized AdapterHttpError', async () => {
      const axiosError = {
        isAxiosError: true,
        name: 'AxiosError',
        message: 'Request failed with status code 404',
        config: { headers: {} } as any,
        request: {},
        response: {
          status: 404,
          data: { error: 'Not Found' },
          headers: { 'content-type': 'application/json' },
          config: {} as any,
          statusText: 'Not Found',
        },
      };
      mockRequest.mockRejectedValue(axiosError);

      await expect(adapter.request(baseRequest)).rejects.toThrow(axiosError.message);

      try {
        await adapter.request(baseRequest);
      } catch (e) {
        const error = e as AdapterHttpError;
        expect(error.isAdapterError).toBe(true);
        expect(error.name).toBe('AdapterHttpError');
        expect(error.request).toBe(baseRequest);
        expect(error.response).toBeDefined();
        expect(error.response?.statusCode).toBe(404);
        expect(error.response?.data).toEqual({ error: 'Not Found' });
        expect(error.response?.headers).toEqual({ 'content-type': 'application/json' });
      }
    });

    it('should handle an AxiosError without a response object', async () => {
      const axiosError = {
        isAxiosError: true,
        name: 'AxiosError',
        message: 'Network Error',
        config: { headers: {} } as any,
        request: {},
        response: undefined, // No response from server
      };
      mockRequest.mockRejectedValue(axiosError);

      try {
        await adapter.request(baseRequest);
      } catch (e) {
        const error = e as AdapterHttpError;
        expect(error.isAdapterError).toBe(true);
        expect(error.response).toBeUndefined();
      }
    });

    it('should re-throw non-Axios errors without modification', async () => {
      const genericError = new Error('Something unexpected happened');
      mockRequest.mockRejectedValue(genericError);

      await expect(adapter.request(baseRequest)).rejects.toThrow(genericError);

      try {
        await adapter.request(baseRequest);
      } catch (e: any) {
        // Ensure it's not wrapped as an AdapterHttpError
        expect(e.isAdapterError).toBeUndefined();
        expect(e).toBe(genericError);
      }
    });
  });
});