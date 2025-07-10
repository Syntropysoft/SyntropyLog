/**
 * FILE: src/brokers/InstrumentedBrokerClient.ts (NUEVO)
 * DESCRIPTION:
 * The core instrumentation class. It wraps any IBrokerAdapter and adds
 * logging and automatic context propagation for distributed tracing.
 */
import { ILogger } from '../logger';
import { IContextManager } from '../context';
import {
  IBrokerAdapter,
  BrokerMessage,
  MessageHandler,
  MessageLifecycleControls,
} from './adapter.types';

export class InstrumentedBrokerClient {
  constructor(
    private readonly adapter: IBrokerAdapter,
    private readonly logger: ILogger,
    private readonly contextManager: IContextManager
  ) {}

  public async connect(): Promise<void> {
    this.logger.info('Connecting to broker...');
    await this.adapter.connect();
    this.logger.info('Successfully connected to broker.');
  }

  public async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from broker...');
    await this.adapter.disconnect();
    this.logger.info('Successfully disconnected from broker.');
  }

  /**
   * Publishes a message, automatically injecting the current correlation-id
   * into the message headers for distributed tracing.
   */
  public async publish(topic: string, message: BrokerMessage): Promise<void> {
    const correlationId = this.contextManager.getCorrelationId();
    if (correlationId) {
      // Ensure headers object exists
      if (!message.headers) {
        message.headers = {};
      }
      // Inject the correlation ID
      message.headers[this.contextManager.getCorrelationIdHeaderName()] =
        correlationId;
    }

    this.logger.info(
      { topic, messageId: message.headers?.['id'] },
      'Publishing message...'
    );
    await this.adapter.publish(topic, message);
    this.logger.info(
      { topic, messageId: message.headers?.['id'] },
      'Message published successfully.'
    );
  }

  /**
   * Subscribes to a topic. It wraps the user's message handler to create
   * a new async context for each incoming message, using the correlation-id
   * found in the message headers.
   */
  public async subscribe(
    topic: string,
    handler: MessageHandler
  ): Promise<void> {
    this.logger.info({ topic }, 'Subscribing to topic...');

    // Wrap the user's handler to implement context propagation.
    const instrumentedHandler: MessageHandler = async (message, controls) => {
      const headerName = this.contextManager.getCorrelationIdHeaderName();
      const correlationId = message.headers?.[headerName]?.toString();

      // This is the magic: run the handler within a new context.
      await this.contextManager.run(async () => {
        if (correlationId) {
          this.contextManager.set(headerName, correlationId);
        }

        this.logger.info({ topic, correlationId }, 'Received message.');

        // Wrap the lifecycle controls to add logging.
        const instrumentedControls: MessageLifecycleControls = {
          ack: async () => {
            await controls.ack();
            this.logger.debug(
              { topic, correlationId },
              'Message acknowledged (ack).'
            );
          },
          nack: async (requeue) => {
            await controls.nack(requeue);
            this.logger.warn(
              { topic, correlationId, requeue },
              'Message negatively acknowledged (nack).'
            );
          },
        };

        // Execute the original user-provided handler.
        await handler(message, instrumentedControls);
      });
    };

    await this.adapter.subscribe(topic, instrumentedHandler);
    this.logger.info({ topic }, 'Successfully subscribed to topic.');
  }
}
