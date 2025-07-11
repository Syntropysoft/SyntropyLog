/**
 * FILE: tests/http/HttpManager.test.ts
 * DESCRIPTION: Unit tests for the HttpManager class.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpManager, HttpManagerOptions } from '../../src/http/HttpManager';
import { SyntropyLogConfig } from '../../src/config';
import { MockContextManager } from '../../src/context/MockContextManager';
import { ILogger } from '../../src/logger/ILogger';
import { LoggerFactory } from '../../src/logger/LoggerFactory';
import {
  IHttpClientAdapter,
  AdapterHttpRequest,
  AdapterHttpResponse,
} from '../../src/http/adapters/adapter.types';
import { InstrumentedHttpClient } from '../../src/http/InstrumentedHttpClient';

// --- Mocks ---

class MockHttpClientAdapter implements IHttpClientAdapter {
  request = vi.fn(
    async (req: AdapterHttpRequest): Promise<AdapterHttpResponse<any>> => {
      return {
        statusCode: 200,
        headers: { 'x-mock-header': 'true' },
        data: { success: true, url: req.url },
      };
    }
  );
}

const mockLogger: ILogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
};

const mockLoggerFactory = {
  getLogger: vi.fn().mockReturnValue(mockLogger),
} as unknown as LoggerFactory;

// --- Tests ---

describe('HttpManager', () => {
  let mockContextManager: MockContextManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContextManager = new MockContextManager();
  });

  describe('Constructor', () => {
    it('should initialize with no instances and log a debug message', () => {
      const config: SyntropyLogConfig = {};
      const options: HttpManagerOptions = {
        config,
        loggerFactory: mockLoggerFactory,
        contextManager: mockContextManager,
      };

      new HttpManager(options);

      expect(mockLoggerFactory.getLogger).toHaveBeenCalledWith('http-manager');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'HttpManager initialized, but no HTTP client instances were defined.'
      );
    });

    it('should create and store an instrumented client instance from config', () => {
      const mockAdapter = new MockHttpClientAdapter();
      const config: SyntropyLogConfig = {
        http: {
          instances: [
            {
              instanceName: 'my-api',
              adapter: mockAdapter,
            },
          ],
        },
      };
      const options: HttpManagerOptions = {
        config,
        loggerFactory: mockLoggerFactory,
        contextManager: mockContextManager,
      };

      const manager = new HttpManager(options);
      const instance = manager.getInstance('my-api');

      expect(instance).toBeInstanceOf(InstrumentedHttpClient);
      expect(mockLoggerFactory.getLogger).toHaveBeenCalledWith('my-api');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'HTTP client instance "my-api" created successfully via adapter.'
      );
    });

    it('should log an error if creating an instance fails', () => {
      const faultyConfig: SyntropyLogConfig = {
        http: {
          instances: [
            {
              instanceName: 'faulty-api',
              // This will throw when the manager tries to access it
              get adapter() {
                throw new Error('Adapter configuration is broken');
              },
            },
          ],
        },
      };
      const options: HttpManagerOptions = {
        config: faultyConfig,
        loggerFactory: mockLoggerFactory,
        contextManager: mockContextManager,
      };

      new HttpManager(options);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create HTTP client instance "faulty-api"',
        { error: expect.any(Error) }
      );
    });
  });

  describe('getInstance', () => {
    it('should return the correct instrumented client instance', () => {
      const mockAdapter = new MockHttpClientAdapter();
      const config: SyntropyLogConfig = {
        http: { instances: [{ instanceName: 'api', adapter: mockAdapter }] },
      };
      const manager = new HttpManager({ config, loggerFactory: mockLoggerFactory, contextManager: mockContextManager });

      const instance = manager.getInstance('api');
      expect(instance).toBeInstanceOf(InstrumentedHttpClient);
    });

    it('should throw an error if the instance is not found', () => {
      const manager = new HttpManager({ loggerFactory: mockLoggerFactory, contextManager: mockContextManager });
      expect(() => manager.getInstance('non-existent-api')).toThrow(
        'HTTP client instance with name "non-existent-api" was not found.'
      );
    });
  });

  describe('shutdown', () => {
    it('should clear all instances and log a shutdown message', async () => {
      const mockAdapter = new MockHttpClientAdapter();
      const config: SyntropyLogConfig = {
        http: { instances: [{ instanceName: 'api', adapter: mockAdapter }] },
      };
      const manager = new HttpManager({ config, loggerFactory: mockLoggerFactory, contextManager: mockContextManager });

      await manager.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith('Shutting down HTTP clients.');
      expect(() => manager.getInstance('api')).toThrow();
    });
  });
});