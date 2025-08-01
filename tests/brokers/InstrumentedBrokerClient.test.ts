import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { InstrumentedBrokerClient } from '../../src/brokers/InstrumentedBrokerClient';
import { IBrokerAdapter, BrokerMessage, MessageHandler, MessageLifecycleControls } from '../../src/brokers/adapter.types';
import { ILogger } from '../../src/logger';
import { IContextManager } from '../../src/context';
import { BrokerInstanceConfig } from '../../src/config';

describe('InstrumentedBrokerClient', () => {
  let mockAdapter: IBrokerAdapter;
  let mockLogger: ILogger;
  let mockContextManager: IContextManager;
  let mockConfig: BrokerInstanceConfig;
  let client: InstrumentedBrokerClient;

  const CORRELATION_ID_HEADER = 'x-correlation-id';
  const TRANSACTION_ID_HEADER = 'x-trace-id';
  const MOCK_CORRELATION_ID = 'test-correlation-id';
  const MOCK_TRANSACTION_ID = 'test-transaction-id';

  beforeEach(() => {
    mockAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
    };

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    mockContextManager = {
      getAll: vi.fn().mockReturnValue({}),
      getCorrelationId: vi.fn(),
      getTransactionId: vi.fn(),
      getCorrelationIdHeaderName: vi.fn().mockReturnValue(CORRELATION_ID_HEADER),
      getTransactionIdHeaderName: vi.fn().mockReturnValue(TRANSACTION_ID_HEADER),
      set: vi.fn(),
      run: vi.fn().mockImplementation(async (callback) => {
        // Simulate running the callback in a new context
        return await callback();
      }),
      // Métodos faltantes:
      configure: vi.fn(),
      get: vi.fn(),
      setTransactionId: vi.fn(),
      getTraceContextHeaders: vi.fn(),
      getFilteredContext: vi.fn(),
    };

    mockConfig = {
      instanceName: 'test-broker',
      adapter: mockAdapter,
      propagateFullContext: false, // Default behavior
    };

    client = new InstrumentedBrokerClient(mockAdapter, mockLogger, mockContextManager, mockConfig);
  });

  describe('connect', () => {
    it('should log connection start and success messages', async () => {
      await client.connect();
      expect(mockLogger.info).toHaveBeenCalledWith('Connecting to broker...');
      expect(mockAdapter.connect).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Successfully connected to broker.');
    });

    it('should propagate errors from adapter.connect', async () => {
      const connectError = new Error('Connection failed');
      (mockAdapter.connect as Mock).mockRejectedValue(connectError);
      await expect(client.connect()).rejects.toThrow(connectError);
    });
  });

  describe('disconnect', () => {
    it('should log disconnection start and success messages', async () => {
      await client.disconnect();
      expect(mockLogger.info).toHaveBeenCalledWith('Disconnecting from broker...');
      expect(mockAdapter.disconnect).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Successfully disconnected from broker.');
    });

    it('should propagate errors from adapter.disconnect', async () => {
      const disconnectError = new Error('Disconnection failed');
      (mockAdapter.disconnect as Mock).mockRejectedValue(disconnectError);
      await expect(client.disconnect()).rejects.toThrow(disconnectError);
    });
  });

  describe('publish', () => {
    const topic = 'test-topic';

    it('should inject correlation and transaction IDs when propagateFullContext is false', async () => {
      const message: BrokerMessage = { payload: Buffer.from('test') };
      (mockContextManager.get as Mock).mockImplementation((key: string) => {
        if (key === CORRELATION_ID_HEADER) return MOCK_CORRELATION_ID;
        if (key === TRANSACTION_ID_HEADER) return MOCK_TRANSACTION_ID;
        return undefined;
      });
      (mockContextManager.getTransactionId as Mock).mockReturnValue(MOCK_TRANSACTION_ID);
      
      await client.publish(topic, message);

      expect(message.headers).toBeDefined();
      expect(message.headers?.[CORRELATION_ID_HEADER]).toBe(MOCK_CORRELATION_ID);
      expect(message.headers?.[TRANSACTION_ID_HEADER]).toBe(MOCK_TRANSACTION_ID);
    });

    it('should inject the full context when propagateFullContext is true', async () => {
      mockConfig.propagateFullContext = true;
      const message: BrokerMessage = { payload: Buffer.from('test') };
      const fullContext = {
        [CORRELATION_ID_HEADER]: MOCK_CORRELATION_ID,
        [TRANSACTION_ID_HEADER]: MOCK_TRANSACTION_ID,
        'x-custom-header': 'custom-value',
      };
      (mockContextManager.getAll as Mock).mockReturnValue(fullContext);

      await client.publish(topic, message);

      expect(mockAdapter.publish).toHaveBeenCalledWith(topic, {
        payload: message.payload,
        headers: fullContext,
      });
    });

    it('should create headers object if it does not exist', async () => {
      (mockContextManager.get as Mock).mockImplementation((key: string) => {
        if (key === CORRELATION_ID_HEADER) return MOCK_CORRELATION_ID;
        return undefined;
      });
      const messageWithoutHeaders: BrokerMessage = { payload: Buffer.from('test') };
      
      await client.publish(topic, messageWithoutHeaders);

      expect(messageWithoutHeaders.headers).toBeDefined();
      expect(messageWithoutHeaders.headers?.[CORRELATION_ID_HEADER]).toBe(MOCK_CORRELATION_ID);
    });

    it('should not inject IDs if they do not exist in context', async () => {
      const message: BrokerMessage = { payload: Buffer.from('test') };
      (mockContextManager.getCorrelationId as Mock).mockReturnValue(undefined);
      (mockContextManager.getTransactionId as Mock).mockReturnValue(undefined);
      
      await client.publish(topic, message);

      expect(mockAdapter.publish).toHaveBeenCalledWith(topic, message);
      expect(message.headers?.[CORRELATION_ID_HEADER]).toBeUndefined();
    });

    it('should log publish start and success messages', async () => {
      const message: BrokerMessage = { payload: Buffer.from('test') };
      await client.publish(topic, message);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.any(Object), 'Publishing message...');
      expect(mockLogger.info).toHaveBeenCalledWith(expect.any(Object), 'Message published successfully.');
    });
  });

  describe('subscribe', () => {
    const topic = 'test-topic';
    let userHandler: MessageHandler;
    let instrumentedHandler: MessageHandler;

    beforeEach(async () => {
      userHandler = vi.fn();
      await client.subscribe(topic, userHandler);

      // Capture the wrapped handler passed to the adapter
      const subscribeCall = (mockAdapter.subscribe as Mock).mock.calls[0];
      instrumentedHandler = subscribeCall[1];
    });

    it('should log subscription start and success messages', () => {
      expect(mockLogger.info).toHaveBeenCalledWith({ topic }, 'Subscribing to topic...');
      expect(mockAdapter.subscribe).toHaveBeenCalledWith(topic, expect.any(Function));
      expect(mockLogger.info).toHaveBeenCalledWith({ topic }, 'Successfully subscribed to topic.');
    });

    it('should wrap the user handler and run it in a new context', async () => {
      const message: BrokerMessage = { 
        payload: Buffer.from('test'),
        headers: { [CORRELATION_ID_HEADER]: MOCK_CORRELATION_ID }
      };
      const controls: MessageLifecycleControls = { ack: vi.fn(), nack: vi.fn() };

      await instrumentedHandler(message, controls);

      expect(mockContextManager.run).toHaveBeenCalled();
      expect(userHandler).toHaveBeenCalledWith(message, expect.any(Object));
    });

    it('should set all message headers in the new context', async () => {
      const message: BrokerMessage = {
        payload: Buffer.from('test'),
        headers: {
          [CORRELATION_ID_HEADER]: MOCK_CORRELATION_ID,
          'x-custom-header': 'custom-value',
        },
      };
      const controls: MessageLifecycleControls = { ack: vi.fn(), nack: vi.fn() };

      // We also need to get the correlationId for the log message
      (mockContextManager.getCorrelationId as Mock).mockReturnValue(MOCK_CORRELATION_ID);

      await instrumentedHandler(message, controls);

      expect(mockContextManager.set).toHaveBeenCalledWith(CORRELATION_ID_HEADER, MOCK_CORRELATION_ID);
      expect(mockContextManager.set).toHaveBeenCalledWith('x-custom-header', 'custom-value');
      
      expect(mockLogger.info).toHaveBeenCalledWith({ topic, correlationId: MOCK_CORRELATION_ID }, 'Received message.');
    });

    it('should log with undefined correlation ID if not present', async () => {
      const message: BrokerMessage = { payload: Buffer.from('test') };
      const controls: MessageLifecycleControls = { ack: vi.fn(), nack: vi.fn() };

      // We need to simulate getting undefined for the log message
      (mockContextManager.getCorrelationId as Mock).mockReturnValue(undefined);

      await instrumentedHandler(message, controls);

      expect(mockLogger.info).toHaveBeenCalledWith({ topic, correlationId: undefined }, 'Received message.');
    });

    describe('Instrumented Lifecycle Controls', () => {
      let message: BrokerMessage;
      let originalControls: MessageLifecycleControls;
      let instrumentedControls: MessageLifecycleControls;

      beforeEach(async () => {
        message = {
          payload: Buffer.from('test'),
          headers: { [CORRELATION_ID_HEADER]: MOCK_CORRELATION_ID },
        };
        originalControls = {
          ack: vi.fn().mockResolvedValue(undefined),
          nack: vi.fn().mockResolvedValue(undefined),
        };

        // Capture the instrumented controls passed to the user handler
        (userHandler as Mock).mockImplementation((msg: any, ctrls: any) => {
          instrumentedControls = ctrls;
        });

        // Also mock the getCorrelationId for the log inside the handler
        (mockContextManager.getCorrelationId as Mock).mockReturnValue(MOCK_CORRELATION_ID);

        await instrumentedHandler(message, originalControls);
      });

      it('should call original ack and then log', async () => {
        await instrumentedControls.ack();

        // Ensure original is called first
        const ackCallOrder = (originalControls.ack as Mock).mock.invocationCallOrder[0];
        const logCallOrder = (mockLogger.debug as Mock).mock.invocationCallOrder[0];
        expect(ackCallOrder).toBeLessThan(logCallOrder);

        expect(originalControls.ack).toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith(
          { topic, correlationId: MOCK_CORRELATION_ID },
          'Message acknowledged (ack).'
        );
      });

      it('should call original nack and then log', async () => {
        await instrumentedControls.nack(true);

        // Ensure original is called first
        const nackCallOrder = (originalControls.nack as Mock).mock.invocationCallOrder[0];
        const logCallOrder = (mockLogger.warn as Mock).mock.invocationCallOrder[0];
        expect(nackCallOrder).toBeLessThan(logCallOrder);

        expect(originalControls.nack).toHaveBeenCalledWith(true);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          { topic, correlationId: MOCK_CORRELATION_ID, requeue: true },
          'Message negatively acknowledged (nack).'
        );
      });
    });
  });
});