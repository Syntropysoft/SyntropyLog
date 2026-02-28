/**
 * FILE: tests/http/HttpManager.test.ts
 * DESCRIPTION: Unit tests for the HttpManager class.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpManager } from '../../src/http/HttpManager';
import { ILogger } from '../../src/logger/ILogger';
import {
  IHttpClientAdapter,
  AdapterHttpRequest,
  AdapterHttpResponse,
} from '../../src/http/adapters/adapter.types';
import { InstrumentedHttpClient } from '../../src/http/InstrumentedHttpClient';
import { IContextManager } from '../../src/context';
import { MockContextManager } from '../../src/context/MockContextManager';
import { SyntropyHttpConfig } from '../../src/config';

// --- Mocks ---
vi.mock('../../src/http/InstrumentedHttpClient', () => {
  return {
    InstrumentedHttpClient: vi.fn().mockImplementation(function (_adapter, _logger, _context, config) {
      return {
        instanceName: config?.instanceName,
      };
    }),
  };
});

class MockHttpClientAdapter implements IHttpClientAdapter {
  request = vi.fn(
    async (req: AdapterHttpRequest): Promise<AdapterHttpResponse<any>> => {
      return {
        statusCode: 200,
        headers: { 'x-mock-header': 'true' },
        data: { success: true, url: req.url },
      };
    },
  );
}

const createMockLogger = (): ILogger => ({
  info: vi.fn() as any,
  debug: vi.fn() as any,
  warn: vi.fn() as any,
  error: vi.fn() as any,
  trace: vi.fn((...args: any[]) => undefined) as any,
  fatal: vi.fn((...args: any[]) => undefined) as any,
  audit: vi.fn() as any,
  child: vi.fn().mockReturnThis(),
  withSource: vi.fn().mockReturnThis(),
  level: 'info',
  setLevel: vi.fn(),
  withRetention: vi.fn().mockReturnThis(),
  withTransactionId: vi.fn().mockReturnThis(),
});

// --- Tests ---

describe('HttpManager', () => {
  let mockLogger: ILogger;
  let mockContextManager: IContextManager;
  let httpConfig: SyntropyHttpConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createMockLogger();
    mockContextManager = new MockContextManager();
    httpConfig = { instances: [] };

    vi.mocked(InstrumentedHttpClient).mockImplementation(function (_adapter, _logger, _context, config) {
      return {
        instanceName: config?.instanceName,
      } as any;
    });
  });

  describe('Constructor and Init', () => {
    it('should initialize with no instances and log a debug message', () => {
      const manager = new HttpManager({ instances: [] }, mockLogger, mockContextManager);
      manager.init();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'HttpManager initialized, but no HTTP client instances were defined.',
      );
    });

    it('should create and store an instrumented client instance from config', () => {
      const mockAdapter = new MockHttpClientAdapter();
      httpConfig.instances = [{ instanceName: 'my-api', adapter: mockAdapter }];

      const manager = new HttpManager(httpConfig, mockLogger, mockContextManager);
      manager.init();
      const instance = manager.getInstance('my-api');

      expect(instance).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'HTTP client instance "my-api" created successfully via adapter.',
      );
      expect(InstrumentedHttpClient).toHaveBeenCalledWith(
        mockAdapter,
        expect.any(Object), // logger
        mockContextManager,
        httpConfig.instances[0],
      );
    });

    it('should log an error if creating an instance fails', () => {
      const error = new Error('Adapter configuration is broken');
      httpConfig.instances = [
        {
          instanceName: 'faulty-api',
          get adapter() {
            throw error;
          },
        } as any,
      ];

      const manager = new HttpManager(httpConfig, mockLogger, mockContextManager);
      manager.init();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Adapter configuration is broken',
            name: 'Error'
          })
        }),
        'Failed to create HTTP client instance "faulty-api"'
      );
    });
  });

  describe('getInstance', () => {
    it('should return the correct instrumented client instance', () => {
      const mockAdapter = new MockHttpClientAdapter();
      httpConfig.instances = [{ instanceName: 'api', adapter: mockAdapter }];
      const manager = new HttpManager(httpConfig, mockLogger, mockContextManager);
      manager.init();

      const instance = manager.getInstance('api');
      expect(instance).toBeDefined();
    });

    it('should return the default instance if no name is provided', () => {
      const mockAdapter1 = new MockHttpClientAdapter();
      const mockAdapter2 = new MockHttpClientAdapter();
      httpConfig.instances = [
        { instanceName: 'api1', adapter: mockAdapter1 },
        { instanceName: 'api2', adapter: mockAdapter2, isDefault: true },
      ];
      const manager = new HttpManager(httpConfig, mockLogger, mockContextManager);
      manager.init();
      const instance = manager.getInstance();
      expect(instance).toBeDefined();
      // The second instance was default, so we check the second mock call result.
      expect(instance.instanceName).toBe('api2');
    });

    it('should throw an error if the instance is not found', () => {
      const manager = new HttpManager({ instances: [] }, mockLogger, mockContextManager);
      manager.init();
      expect(() => manager.getInstance('non-existent-api')).toThrow(
        'HTTP client instance with name "non-existent-api" was not found.',
      );
    });

    it('should throw an error if no name is provided and no default is set', () => {
      const manager = new HttpManager({ instances: [] }, mockLogger, mockContextManager);
      manager.init();
      expect(() => manager.getInstance()).toThrow(
        'A specific instance name was not provided and no default HTTP instance is configured.',
      );
    });
  });

  describe('shutdown', () => {
    it('should clear all instances and log a shutdown message', async () => {
      const mockAdapter = new MockHttpClientAdapter();
      httpConfig.instances = [{ instanceName: 'api', adapter: mockAdapter }];
      const manager = new HttpManager(httpConfig, mockLogger, mockContextManager);
      manager.init();

      await manager.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith('Shutting down HTTP clients.');
      expect(() => manager.getInstance('api')).toThrow();
    });
  });
});