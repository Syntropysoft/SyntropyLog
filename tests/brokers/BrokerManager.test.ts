import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrokerManager, BrokerManagerOptions } from '../../src/brokers/BrokerManager';
import { IBrokerAdapter } from '../../src/brokers/adapter.types';
import { InstrumentedBrokerClient } from '../../src/brokers/InstrumentedBrokerClient';

// Mock dependencies
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/brokers/InstrumentedBrokerClient', () => {
  return {
    InstrumentedBrokerClient: vi.fn().mockImplementation(() => ({
      disconnect: mockDisconnect,
    })),
  };
});

describe('BrokerManager', () => {
  let mockOptions: BrokerManagerOptions;
  let mockLogger: {
    info: vi.fn;
    debug: vi.fn;
    error: vi.fn;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the mock implementation to its default happy-path behavior before each test
    (InstrumentedBrokerClient as any).mockImplementation(() => ({
      disconnect: mockDisconnect,
    }));

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    };

    mockOptions = {
      config: {
        logger: { level: 'info' },
        brokers: {
          instances: [],
        },
      },
      loggerFactory: {
        getLogger: vi.fn().mockReturnValue(mockLogger),
      } as any,
      contextManager: {} as any,
    };
  });

  describe('Constructor', () => {
    it('should log a debug message if no broker instances are configured', () => {
      new BrokerManager(mockOptions);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'BrokerManager initialized, but no broker instances were defined.'
      );
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(InstrumentedBrokerClient).not.toHaveBeenCalled();
    });

    it('should create an instrumented client for each configured instance', () => {
      const mockAdapter1: IBrokerAdapter = { connect: vi.fn(), publish: vi.fn(), subscribe: vi.fn(), disconnect: vi.fn() };
      const mockAdapter2: IBrokerAdapter = { connect: vi.fn(), publish: vi.fn(), subscribe: vi.fn(), disconnect: vi.fn() };
      mockOptions.config.brokers!.instances = [
        { instanceName: 'kafka-main', adapter: mockAdapter1 },
        { instanceName: 'rabbitmq-events', adapter: mockAdapter2 },
      ];

      new BrokerManager(mockOptions);

      expect(InstrumentedBrokerClient).toHaveBeenCalledTimes(2);

      // Check first instance creation
      expect(InstrumentedBrokerClient).toHaveBeenCalledWith(
        mockAdapter1,
        expect.anything(),
        mockOptions.contextManager
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Broker client instance "kafka-main" created successfully via adapter.'
      );

      // Check second instance creation
      expect(InstrumentedBrokerClient).toHaveBeenCalledWith(
        mockAdapter2,
        expect.anything(),
        mockOptions.contextManager
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Broker client instance "rabbitmq-events" created successfully via adapter.'
      );
    });

    it('should log an error if a client instance fails to be created', () => {
      const creationError = new Error('Invalid adapter');
      (InstrumentedBrokerClient as any).mockImplementation(() => {
        throw creationError;
      });

      const mockAdapter: IBrokerAdapter = { connect: vi.fn(), publish: vi.fn(), subscribe: vi.fn(), disconnect: vi.fn() };
      mockOptions.config.brokers!.instances = [
        { instanceName: 'bad-client', adapter: mockAdapter },
      ];

      new BrokerManager(mockOptions);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create broker client instance "bad-client"',
        { error: creationError }
      );
    });
  });

  describe('getInstance', () => {
    it('should return the correct client instance', () => {
      const mockAdapter: IBrokerAdapter = { connect: vi.fn(), publish: vi.fn(), subscribe: vi.fn(), disconnect: vi.fn() };
      mockOptions.config.brokers!.instances = [
        { instanceName: 'my-broker', adapter: mockAdapter },
      ];
      const manager = new BrokerManager(mockOptions);
      const client = manager.getInstance('my-broker');

      expect(client).toBeDefined();
      expect(client.disconnect).toBe(mockDisconnect);
    });

    it('should throw an error if the instance name is not found', () => {
      const manager = new BrokerManager(mockOptions);
      expect(() => manager.getInstance('non-existent')).toThrow(
        'Broker client instance with name "non-existent" was not found.'
      );
    });
  });

  describe('shutdown', () => {
    it('should call disconnect on all client instances', async () => {
      const mockAdapter1: IBrokerAdapter = { connect: vi.fn(), publish: vi.fn(), subscribe: vi.fn(), disconnect: vi.fn() };
      const mockAdapter2: IBrokerAdapter = { connect: vi.fn(), publish: vi.fn(), subscribe: vi.fn(), disconnect: vi.fn() };
      mockOptions.config.brokers!.instances = [
        { instanceName: 'kafka-main', adapter: mockAdapter1 },
        { instanceName: 'rabbitmq-events', adapter: mockAdapter2 },
      ];
      const manager = new BrokerManager(mockOptions);

      await manager.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith('Disconnecting all broker clients...');
      expect(mockDisconnect).toHaveBeenCalledTimes(2);
    });

    it('should resolve even if there are no instances to shut down', async () => {
      const manager = new BrokerManager(mockOptions);
      await expect(manager.shutdown()).resolves.not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith('Disconnecting all broker clients...');
      expect(mockDisconnect).not.toHaveBeenCalled();
    });
  });
});