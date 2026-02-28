import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrokerManager } from '../../src/brokers/BrokerManager';
import { IBrokerAdapter } from '../../src/brokers/adapter.types';
import { BrokerInstanceConfig } from '../../src/config';
import { ILogger } from '../../src/logger';
import { IContextManager } from '../../src/context';
import { MockContextManager } from '../../src/context/MockContextManager';
import { InstrumentedBrokerClient } from '../../src/brokers/InstrumentedBrokerClient';

// Mock de logger que acepta ambas firmas
const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  withSource: vi.fn().mockReturnThis(),
  level: 'info',
  setLevel: vi.fn(),
  withRetention: vi.fn().mockReturnThis(),
  withTransactionId: vi.fn().mockReturnThis(),
} as any;

// Mock de InstrumentedBrokerClient con todas las propiedades requeridas
vi.mocked(InstrumentedBrokerClient).mockImplementation(function (_adapter, _logger, _context, config) {
  return {
    instanceName: config?.instanceName,
    disconnect: mockDisconnect,
    connect: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
  } as any;
});

// Mock de IContextManager con todos los métodos requeridos
const mockContextManager = {
  getAll: vi.fn(),
  getCorrelationId: vi.fn(),
  getTransactionId: vi.fn(),
  getCorrelationIdHeaderName: vi.fn(),
  getTransactionIdHeaderName: vi.fn(),
  set: vi.fn(),
  run: vi.fn(),
  configure: vi.fn(),
  get: vi.fn(),
  setTransactionId: vi.fn(),
  getTraceContextHeaders: vi.fn(),
  getFilteredContext: vi.fn(),
};

// Mock the InstrumentedBrokerClient to isolate the BrokerManager's logic
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/brokers/InstrumentedBrokerClient', () => {
  return {
    InstrumentedBrokerClient: vi.fn().mockImplementation(function (_adapter, _logger, _context, config) {
      return {
        instanceName: config?.instanceName, // <-- Store the name from config
        disconnect: mockDisconnect,
        connect: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

// Helper to create a mock logger for testing
const createMockLogger = (): ILogger => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  audit: vi.fn(),
  child: vi.fn().mockReturnThis(),
  withSource: vi.fn().mockReturnThis(),
  level: 'info',
  setLevel: vi.fn(),
  withRetention: vi.fn().mockReturnThis(),
  withTransactionId: vi.fn().mockReturnThis(),
});

describe('BrokerManager', () => {
  let mockLogger: ILogger;
  let mockContextManager: IContextManager;
  let brokerConfig: { instances: BrokerInstanceConfig[] };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createMockLogger();
    mockContextManager = new MockContextManager();
    brokerConfig = { instances: [] };

    // Reset the mock implementation to its default happy-path behavior
    vi.mocked(InstrumentedBrokerClient).mockImplementation(function (_adapter, _logger, _context, config) {
      return {
        instanceName: config?.instanceName,
        disconnect: mockDisconnect,
        connect: vi.fn().mockResolvedValue(undefined),
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn().mockResolvedValue(undefined),
      } as any;
    });
  });

  describe('Constructor', () => {
    it('should log a debug message if no broker instances are configured', async () => {
      const manager = new BrokerManager({ instances: [] }, mockLogger, mockContextManager);
      await manager.init();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'BrokerManager initialized, but no broker instances were defined.'
      );
      expect(InstrumentedBrokerClient).not.toHaveBeenCalled();
    });

    it('should create and connect an instrumented client for each configured instance', async () => {
      const mockAdapter1: IBrokerAdapter = { connect: vi.fn(), publish: vi.fn(), subscribe: vi.fn(), disconnect: vi.fn() };
      const mockAdapter2: IBrokerAdapter = { connect: vi.fn(), publish: vi.fn(), subscribe: vi.fn(), disconnect: vi.fn() };
      const config = {
        instances: [
          { instanceName: 'kafka-main', adapter: mockAdapter1 },
          { instanceName: 'rabbitmq-events', adapter: mockAdapter2 },
        ],
        default: 'rabbitmq-events',
      };

      const manager = new BrokerManager(config, mockLogger, mockContextManager);
      await manager.init();

      expect(InstrumentedBrokerClient).toHaveBeenCalledTimes(2);

      // Verify first instance was created correctly
      expect(InstrumentedBrokerClient).toHaveBeenCalledWith(
        mockAdapter1,
        expect.any(Object), // logger
        mockContextManager,
        config.instances[0]
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Broker client instance "kafka-main" created and connected successfully.'
      );

      // Verify second instance was created correctly
      expect(InstrumentedBrokerClient).toHaveBeenCalledWith(
        mockAdapter2,
        expect.any(Object), // logger
        mockContextManager,
        config.instances[1]
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Broker client instance "rabbitmq-events" created and connected successfully.'
      );
    });

    it('should log an error if a client instance fails to be created', async () => {
      const creationError = new Error('Invalid adapter');
      vi.mocked(InstrumentedBrokerClient).mockImplementation(function () {
        throw creationError;
      });

      const mockAdapter: IBrokerAdapter = { connect: vi.fn(), publish: vi.fn(), subscribe: vi.fn(), disconnect: vi.fn() };
      brokerConfig.instances = [{ instanceName: 'bad-client', adapter: mockAdapter }];

      const manager = new BrokerManager(brokerConfig, mockLogger, mockContextManager);
      await manager.init();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create broker instance "bad-client":',
        expect.objectContaining({
          message: 'Invalid adapter',
          name: 'Error'
        })
      );
    });
  });

  describe('getInstance', () => {
    it('should return the correct client instance', async () => {
      const mockAdapter: IBrokerAdapter = { connect: vi.fn(), publish: vi.fn(), subscribe: vi.fn(), disconnect: vi.fn() };
      brokerConfig.instances = [{ instanceName: 'my-broker', adapter: mockAdapter }];
      const manager = new BrokerManager(brokerConfig, mockLogger, mockContextManager);
      await manager.init();
      const client = manager.getInstance('my-broker');

      expect(client).toBeDefined();
      expect(client.disconnect).toBe(mockDisconnect);
    });

    it('should return the default client instance if no name is provided', async () => {
      const mockAdapter1: IBrokerAdapter = { connect: vi.fn(), publish: vi.fn(), subscribe: vi.fn(), disconnect: vi.fn() };
      const mockAdapter2: IBrokerAdapter = { connect: vi.fn(), publish: vi.fn(), subscribe: vi.fn(), disconnect: vi.fn() };
      const config = {
        instances: [
          { instanceName: 'kafka-main', adapter: mockAdapter1 },
          { instanceName: 'rabbitmq-events', adapter: mockAdapter2 },
        ],
        default: 'rabbitmq-events',
      };
      const manager = new BrokerManager(config, mockLogger, mockContextManager);
      await manager.init();
      const defaultClient = manager.getInstance();

      expect(defaultClient).toBeDefined();
      expect(defaultClient.instanceName).toBe('rabbitmq-events');
    });

    it('should throw an error if the instance name is not found', async () => {
      const manager = new BrokerManager(brokerConfig, mockLogger, mockContextManager);
      await manager.init();
      expect(() => manager.getInstance('non-existent')).toThrow(
        'Broker client instance with name "non-existent" was not found.'
      );
    });
  });

  describe('shutdown', () => {
    it('should call disconnect on all client instances', async () => {
      const mockAdapter1: IBrokerAdapter = { connect: vi.fn(), publish: vi.fn(), subscribe: vi.fn(), disconnect: vi.fn() };
      const mockAdapter2: IBrokerAdapter = { connect: vi.fn(), publish: vi.fn(), subscribe: vi.fn(), disconnect: vi.fn() };
      brokerConfig.instances = [
        { instanceName: 'kafka-main', adapter: mockAdapter1 },
        { instanceName: 'rabbitmq-events', adapter: mockAdapter2 },
      ];
      const manager = new BrokerManager(brokerConfig, mockLogger, mockContextManager);
      await manager.init();

      await manager.shutdown();
      expect(mockLogger.info).toHaveBeenCalledWith('Disconnecting all broker clients...');
      expect(mockDisconnect).toHaveBeenCalledTimes(2);
    });

    it('should resolve even if there are no instances to shut down', async () => {
      const manager = new BrokerManager(brokerConfig, mockLogger, mockContextManager);
      await manager.init();
      await expect(manager.shutdown()).resolves.not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith('Disconnecting all broker clients...');
      expect(mockDisconnect).not.toHaveBeenCalled();
    });
  });
});