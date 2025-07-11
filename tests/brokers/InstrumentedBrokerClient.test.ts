import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstrumentedBrokerClient } from '../../src/brokers/InstrumentedBrokerClient';
import { IBrokerAdapter, BrokerMessage, MessageHandler, MessageLifecycleControls } from '../../src/brokers/adapter.types';
import { ILogger } from '../../src/logger';
import { IContextManager } from '../../src/context';

describe('InstrumentedBrokerClient', () => {
  let mockAdapter: IBrokerAdapter;
  let mockLogger: ILogger;
  let mockContextManager: IContextManager;
  let client: InstrumentedBrokerClient;

  const CORRELATION_ID_HEADER = 'X-Correlation-ID';
  const MOCK_CORRELATION_ID = 'test-correlation-id';

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
      getCorrelationId: vi.fn(),
      getCorrelationIdHeaderName: vi.fn().mockReturnValue(CORRELATION_ID_HEADER),
      set: vi.fn(),
      run: vi.fn().mockImplementation(async (callback) => callback()),
    };

    client = new InstrumentedBrokerClient(mockAdapter, mockLogger, mockContextManager);
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
      (mockAdapter.connect as vi.Mock).mockRejectedValue(connectError);
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
      (mockAdapter.disconnect as vi.Mock).mockRejectedValue(disconnectError);
      await expect(client.disconnect()).rejects.toThrow(disconnectError);
    });
  });

  describe('publish', () => {
    const topic = 'test-topic';

    it('should inject correlation ID if it exists in context', async () => {
      // Define message locally to ensure test isolation
      const message: BrokerMessage = { payload: { data: 'test' } };
      (mockContextManager.getCorrelationId as vi.Mock).mockReturnValue(MOCK_CORRELATION_ID);
      
      await client.publish(topic, message);

      const expectedMessage = {
        ...message,
        headers: { [CORRELATION_ID_HEADER]: MOCK_CORRELATION_ID },
      };
      expect(mockAdapter.publish).toHaveBeenCalledWith(topic, expectedMessage);
    });

    it('should create headers object if it does not exist', async () => {
      (mockContextManager.getCorrelationId as vi.Mock).mockReturnValue(MOCK_CORRELATION_ID);
      const messageWithoutHeaders: BrokerMessage = { payload: 'test' };
      
      await client.publish(topic, messageWithoutHeaders);

      expect(messageWithoutHeaders.headers).toBeDefined();
      expect(messageWithoutHeaders.headers?.[CORRELATION_ID_HEADER]).toBe(MOCK_CORRELATION_ID);
    });

    it('should not inject correlation ID if it does not exist', async () => {
      // Define message locally to ensure test isolation
      const message: BrokerMessage = { payload: { data: 'test' } };
      (mockContextManager.getCorrelationId as vi.Mock).mockReturnValue(undefined);
      
      await client.publish(topic, message);

      expect(mockAdapter.publish).toHaveBeenCalledWith(topic, message);
      expect(message.headers?.[CORRELATION_ID_HEADER]).toBeUndefined();
    });

    it('should log publish start and success messages', async () => {
      // Define message locally to ensure test isolation
      const message: BrokerMessage = { payload: { data: 'test' } };
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
      const subscribeCall = (mockAdapter.subscribe as vi.Mock).mock.calls[0];
      instrumentedHandler = subscribeCall[1];
    });

    it('should log subscription start and success messages', () => {
      expect(mockLogger.info).toHaveBeenCalledWith({ topic }, 'Subscribing to topic...');
      expect(mockAdapter.subscribe).toHaveBeenCalledWith(topic, expect.any(Function));
      expect(mockLogger.info).toHaveBeenCalledWith({ topic }, 'Successfully subscribed to topic.');
    });

    it('should wrap the user handler and run it in a new context', async () => {
      const message: BrokerMessage = { payload: 'test' };
      const controls: MessageLifecycleControls = { ack: vi.fn(), nack: vi.fn() };

      await instrumentedHandler(message, controls);

      expect(mockContextManager.run).toHaveBeenCalled();
      expect(userHandler).toHaveBeenCalledWith(message, expect.any(Object));
    });

    it('should set correlation ID in the new context if present in message headers', async () => {
      const message: BrokerMessage = {
        payload: 'test',
        headers: { [CORRELATION_ID_HEADER]: MOCK_CORRELATION_ID },
      };
      const controls: MessageLifecycleControls = { ack: vi.fn(), nack: vi.fn() };

      await instrumentedHandler(message, controls);

      expect(mockContextManager.set).toHaveBeenCalledWith(CORRELATION_ID_HEADER, MOCK_CORRELATION_ID);
      expect(mockLogger.info).toHaveBeenCalledWith({ topic, correlationId: MOCK_CORRELATION_ID }, 'Received message.');
    });

    it('should not set correlation ID if not present', async () => {
      const message: BrokerMessage = { payload: 'test' };
      const controls: MessageLifecycleControls = { ack: vi.fn(), nack: vi.fn() };

      await instrumentedHandler(message, controls);

      expect(mockContextManager.set).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith({ topic, correlationId: undefined }, 'Received message.');
    });

    describe('Instrumented Lifecycle Controls', () => {
      let message: BrokerMessage;
      let originalControls: MessageLifecycleControls;
      let instrumentedControls: MessageLifecycleControls;

      beforeEach(async () => {
        message = {
          payload: 'test',
          headers: { [CORRELATION_ID_HEADER]: MOCK_CORRELATION_ID },
        };
        originalControls = {
          ack: vi.fn().mockResolvedValue(undefined),
          nack: vi.fn().mockResolvedValue(undefined),
        };

        // Capture the instrumented controls passed to the user handler
        (userHandler as vi.Mock).mockImplementation((msg, ctrls) => {
          instrumentedControls = ctrls;
        });

        await instrumentedHandler(message, originalControls);
      });

      it('should call original ack and then log', async () => {
        await instrumentedControls.ack();

        // Ensure original is called first
        const ackCallOrder = (originalControls.ack as vi.Mock).mock.invocationCallOrder[0];
        const logCallOrder = (mockLogger.debug as vi.Mock).mock.invocationCallOrder[0];
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
        const nackCallOrder = (originalControls.nack as vi.Mock).mock.invocationCallOrder[0];
        const logCallOrder = (mockLogger.warn as vi.Mock).mock.invocationCallOrder[0];
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