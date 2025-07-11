/**
 * FILE: tests/http/InstrumentedHttpClient.test.ts
 * DESCRIPTION: Unit tests for the InstrumentedHttpClient class.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InstrumentedHttpClient, InstrumentorOptions } from '../../src/http/InstrumentedHttpClient';
import { ILogger } from '../../src/logger';
import { IContextManager } from '../../src/context';
import {
  IHttpClientAdapter,
  AdapterHttpRequest,
  AdapterHttpResponse,
  AdapterHttpError,
} from '../../src/http/adapters/adapter.types';

// --- Mocks ---

// --- Tests ---

describe('InstrumentedHttpClient', () => {
  let mockAdapter: IHttpClientAdapter;
  let mockLogger: ILogger;
  let mockContextManager: IContextManager;

  const baseRequest: AdapterHttpRequest = {
    method: 'GET',
    url: 'https://api.example.com/data',
  };

  beforeEach(() => {
    // Re-create mocks for each test to ensure complete isolation
    mockAdapter = {
      request: vi.fn(),
    };

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    };

    mockContextManager = {
      run: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
      getAll: vi.fn(),
      // No default return value for getCorrelationId, it will be undefined by default.
      getCorrelationId: vi.fn(),
      getCorrelationIdHeaderName: vi.fn(() => 'x-correlation-id'),
      configure: vi.fn(),
      getTraceContextHeaders: vi.fn(),
    };
  });

  describe('Successful Requests', () => {
    it('should call the adapter, log start and success, and inject correlation ID', async () => {
      const mockResponse: AdapterHttpResponse<any> = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        data: { message: 'success' },
      };
      (mockContextManager.getCorrelationId as vi.Mock).mockReturnValue('test-correlation-id');
      (mockAdapter.request as vi.Mock).mockResolvedValue(mockResponse);

      const client = new InstrumentedHttpClient(mockAdapter, mockLogger, mockContextManager);
      const response = await client.request(baseRequest);

      // Verify correlation ID injection
      expect(mockAdapter.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { 'x-correlation-id': 'test-correlation-id' },
        })
      );

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(expect.any(Object), 'Starting HTTP request');
      expect(mockLogger.info).toHaveBeenCalledWith(expect.any(Object), 'HTTP response received');
      expect(mockLogger.error).not.toHaveBeenCalled();

      // Verify response is returned
      expect(response).toBe(mockResponse);
    });

    it('should handle requests with pre-existing headers', async () => {
      (mockContextManager.getCorrelationId as vi.Mock).mockReturnValue('test-correlation-id');
      (mockAdapter.request as vi.Mock).mockResolvedValue({ statusCode: 200, data: {}, headers: {} });

      const client = new InstrumentedHttpClient(mockAdapter, mockLogger, mockContextManager);
      await client.request({ ...baseRequest, headers: { 'x-custom-header': 'value' } });

      expect(mockAdapter.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'x-custom-header': 'value',
            'x-correlation-id': 'test-correlation-id',
          },
        })
      );
    });

    it('should not inject correlation ID if not present in context', async () => {
      // Explicitly set the mock to return undefined for this test case.
      // This prevents state from leaking from other tests and makes the test's intent clear.
      (mockContextManager.getCorrelationId as vi.Mock).mockReturnValue(undefined);
      (mockAdapter.request as vi.Mock).mockResolvedValue({
        statusCode: 200,
        data: {},
        headers: { 'x-correlation-id': 'test-correlation-id' },
        method: 'GET',
        url: 'https://api.example.com/data',
      });

      const client = new InstrumentedHttpClient(mockAdapter, mockLogger, mockContextManager);
      await client.request(baseRequest);

      expect(mockAdapter.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { 'x-correlation-id': 'test-correlation-id' },
          method: 'GET',
          url: 'https://api.example.com/data',
        })
      );
    });
  });

  describe('Logging Options', () => {
    it('should log request and response bodies and headers when enabled', async () => {
      const options: InstrumentorOptions = {
        logRequestBody: true,
        logRequestHeaders: true,
        logSuccessBody: true,
        logSuccessHeaders: true,
      };
      const requestWithBody = { ...baseRequest, body: { name: 'test' }, headers: { 'x-api-key': 'key' } };
      const mockResponse = { statusCode: 200, data: { id: 1 }, headers: { 'x-response-id': 'res-id' } };
      (mockAdapter.request as vi.Mock).mockResolvedValue(mockResponse);

      const client = new InstrumentedHttpClient(mockAdapter, mockLogger, mockContextManager, options);
      await client.request(requestWithBody);

      // Check start log
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          body: requestWithBody.body,
          headers: expect.any(Object),
        }),
        'Starting HTTP request'
      );

      // Check success log
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          body: mockResponse.data,
          headers: mockResponse.headers,
        }),
        'HTTP response received'
      );
    });

    it('should use custom log levels when provided', async () => {
      const options: InstrumentorOptions = {
        logLevel: { onRequest: 'debug', onSuccess: 'trace', onError: 'warn' },
      };
      const mockResponse = { statusCode: 200, data: {}, headers: {} };
      // Be explicit that this test runs without a correlation ID
      (mockContextManager.getCorrelationId as vi.Mock).mockReturnValue(undefined);
      (mockAdapter.request as vi.Mock).mockResolvedValue(mockResponse);

      const client = new InstrumentedHttpClient(mockAdapter, mockLogger, mockContextManager, options);
      await client.request(baseRequest);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.any(Object), 'Starting HTTP request');
      expect(mockLogger.trace).toHaveBeenCalledWith(expect.any(Object), 'HTTP response received');
    });
  });

  describe('Failed Requests', () => {
    it('should log and re-throw an AdapterHttpError', async () => {
      const errorResponse: AdapterHttpResponse<any> = {
        statusCode: 404,
        headers: { 'content-type': 'application/json' },
        data: { message: 'Not Found' },
      };
      const adapterError: AdapterHttpError = {
        isAdapterError: true,
        message: 'Request failed with status code 404',
        response: errorResponse,
        request: baseRequest,
      };
      (mockContextManager.getCorrelationId as vi.Mock).mockReturnValue('test-correlation-id');
      (mockAdapter.request as vi.Mock).mockRejectedValue(adapterError);

      const client = new InstrumentedHttpClient(mockAdapter, mockLogger, mockContextManager);

      await expect(client.request(baseRequest)).rejects.toThrow(adapterError.message);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.any(Object), 'Starting HTTP request');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: adapterError,
          response: {
            statusCode: 404,
            headers: errorResponse.headers,
            body: errorResponse.data,
          },
        }),
        'HTTP request failed'
      );
    });

    it('should log and re-throw an unexpected error', async () => {
      const unexpectedError = new Error('Network connection lost');
      (mockContextManager.getCorrelationId as vi.Mock).mockReturnValue('test-correlation-id');
      (mockAdapter.request as vi.Mock).mockRejectedValue(unexpectedError);

      const client = new InstrumentedHttpClient(mockAdapter, mockLogger, mockContextManager);

      await expect(client.request(baseRequest)).rejects.toThrow(unexpectedError.message);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.any(Object), 'Starting HTTP request');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: unexpectedError,
          url: baseRequest.url,
        }),
        'HTTP request failed with an unexpected error'
      );
    });
  });
});