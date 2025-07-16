/**
 * FILE: tests/http/InstrumentedHttpClient.test.ts
 * DESCRIPTION: Unit tests for the InstrumentedHttpClient class.
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { InstrumentedHttpClient } from '../../src/http/InstrumentedHttpClient';
import { ILogger } from '../../src/logger';
import { IContextManager } from '../../src/context';
import {
  IHttpClientAdapter,
  AdapterHttpRequest,
  AdapterHttpResponse,
  AdapterHttpError,
} from '../../src/http/adapters/adapter.types';
import { HttpClientInstanceConfig } from '../../src/config';

// --- Mocks ---

// --- Tests ---

describe('InstrumentedHttpClient', () => {
  let mockAdapter: IHttpClientAdapter;
  let mockLogger: ILogger;
  let mockContextManager: IContextManager;
  let mockConfig: HttpClientInstanceConfig;

  const baseRequest: AdapterHttpRequest = {
    method: 'GET',
    url: 'https://api.example.com/data',
    headers: {},
  };

  beforeEach(() => {
    // Re-create mocks for each test to ensure complete isolation
    mockAdapter = {
      request: vi.fn(),
    };

    mockLogger = {
      info: vi.fn() as any,
      debug: vi.fn() as any,
      warn: vi.fn() as any,
      error: vi.fn() as any,
      trace: vi.fn() as any,
      fatal: vi.fn() as any,
    } as Partial<ILogger> as ILogger;

    mockContextManager = {
      run: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
      getAll: vi.fn().mockReturnValue({}),
      getCorrelationId: vi.fn(), // No return value by default
      getTransactionId: vi.fn(), // No return value by default
      setTransactionId: vi.fn(),
      getFilteredContext: vi.fn().mockReturnValue({}),
      getCorrelationIdHeaderName: vi.fn(() => 'x-correlation-id'),
      getTransactionIdHeaderName: vi.fn(() => 'x-trace-id'),
      configure: vi.fn(),
      getTraceContextHeaders: vi.fn(),
    };

    mockConfig = {
      instanceName: 'test-http-client',
      adapter: mockAdapter,
      propagateFullContext: false, // Default behavior
      logging: {}, // Default to empty logging config
    };
  });

  describe('Successful Requests', () => {
    it('should call the adapter, log start and success, and inject correlation ID', async () => {
      const mockResponse: AdapterHttpResponse<any> = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        data: { message: 'success' },
      };
      (mockContextManager.getCorrelationId as Mock).mockReturnValue('test-correlation-id');
      (mockAdapter.request as Mock).mockResolvedValue(mockResponse);

      const client = new InstrumentedHttpClient(mockAdapter, mockLogger, mockContextManager, mockConfig);
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
      (mockContextManager.getCorrelationId as Mock).mockReturnValue('test-correlation-id');
      (mockAdapter.request as Mock).mockResolvedValue({ statusCode: 200, data: {}, headers: {} });

      const client = new InstrumentedHttpClient(mockAdapter, mockLogger, mockContextManager, mockConfig);
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
      (mockContextManager.getCorrelationId as Mock).mockReturnValue(undefined);
      (mockAdapter.request as Mock).mockResolvedValue({
        statusCode: 200,
        data: {},
        headers: {},
      });

      const client = new InstrumentedHttpClient(mockAdapter, mockLogger, mockContextManager, mockConfig);
      // Use a fresh request object to prevent test pollution
      const freshRequest: AdapterHttpRequest = {
        method: 'GET',
        url: 'https://api.example.com/data',
        headers: {},
      };
      await client.request(freshRequest);

      // Verify that headers are passed, but correlation ID is not added.
      expect(mockAdapter.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {}, // Empty because no correlation ID and baseRequest.headers is empty.
        })
      );
    });
  });

  describe('Context Propagation', () => {
    it('should propagate only correlation and transaction IDs when propagateFullContext is false', async () => {
      mockConfig.propagateFullContext = false;
      (mockContextManager.getCorrelationId as Mock).mockReturnValue('corr-id');
      (mockContextManager.getTransactionId as Mock).mockReturnValue('trans-id');
      (mockAdapter.request as Mock).mockResolvedValue({ statusCode: 200, data: {}, headers: {} });

      const client = new InstrumentedHttpClient(mockAdapter, mockLogger, mockContextManager, mockConfig);
      await client.request(baseRequest);

      expect(mockAdapter.request).toHaveBeenCalledWith(expect.objectContaining({
        headers: {
          'x-correlation-id': 'corr-id',
          'x-trace-id': 'trans-id'
        }
      }));
    });

    it('should propagate the entire context when propagateFullContext is true', async () => {
      mockConfig.propagateFullContext = true;
      const fullContext = {
        'x-correlation-id': 'corr-id',
        'x-trace-id': 'trans-id',
        'x-custom-header': 'custom-value'
      };
      (mockContextManager.getAll as Mock).mockReturnValue(fullContext);
      (mockAdapter.request as Mock).mockResolvedValue({ statusCode: 200, data: {}, headers: {} });

      const client = new InstrumentedHttpClient(mockAdapter, mockLogger, mockContextManager, mockConfig);
      await client.request(baseRequest);

      expect(mockAdapter.request).toHaveBeenCalledWith(expect.objectContaining({
        headers: fullContext
      }));
    });
  });

  describe('Logging Options', () => {
    it('should log request and response bodies and headers when enabled', async () => {
      // Override the default mockConfig for this specific test
      mockConfig.logging = {
        logRequestBody: true,
        logRequestHeaders: true,
        logSuccessBody: true,
        logSuccessHeaders: true,
      };
      const requestWithBody = { ...baseRequest, body: { name: 'test' }, headers: { 'x-api-key': 'key' } };
      const mockResponse = { statusCode: 200, data: { id: 1 }, headers: { 'x-response-id': 'res-id' } };
      (mockAdapter.request as Mock).mockResolvedValue(mockResponse);

      const client = new InstrumentedHttpClient(mockAdapter, mockLogger, mockContextManager, mockConfig);
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
      mockConfig.logging = {
        onRequest: 'debug',
        onSuccess: 'trace',
        onError: 'warn',
      };
      const mockResponse = { statusCode: 200, data: {}, headers: {} };
      // Be explicit that this test runs without a correlation ID
      (mockContextManager.getCorrelationId as Mock).mockReturnValue(undefined);
      (mockAdapter.request as Mock).mockResolvedValue(mockResponse);

      const client = new InstrumentedHttpClient(mockAdapter, mockLogger, mockContextManager, mockConfig);
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
        name: 'AdapterHttpError',
        message: 'Request failed with status code 404',
        response: errorResponse,
        request: baseRequest,
      };
      (mockContextManager.getCorrelationId as Mock).mockReturnValue('test-correlation-id');
      (mockAdapter.request as Mock).mockRejectedValue(adapterError);

      const client = new InstrumentedHttpClient(mockAdapter, mockLogger, mockContextManager, mockConfig);

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
      const unexpectedError = new Error('Network timeout');
      (mockContextManager.getCorrelationId as Mock).mockReturnValue('test-correlation-id');
      (mockAdapter.request as Mock).mockRejectedValue(unexpectedError);

      const client = new InstrumentedHttpClient(mockAdapter, mockLogger, mockContextManager, mockConfig);

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