/**
 * @file src/brokers/InstrumentedBrokerClient.ts
 * @description The core instrumentation class. It wraps any `IBrokerAdapter`
 * implementation and adds logging and automatic context propagation for
 * distributed tracing.
 */
import { ILogger } from '../logger';
import { IContextManager } from '../context';
import {
  IBrokerAdapter,
  BrokerMessage,
  MessageHandler,
  MessageLifecycleControls,
} from './adapter.types';
import { BrokerInstanceConfig } from '../config';

/**
 * @class InstrumentedBrokerClient
 * @description Wraps a user-provided broker adapter to automatically handle
 * logging, context propagation, and distributed tracing.
 */
export class InstrumentedBrokerClient {
  public readonly instanceName: string;

  /**
   * @constructor
   * @param {IBrokerAdapter} adapter - The concrete broker adapter implementation (e.g., for RabbitMQ, Kafka).
   * @param {ILogger} logger - The logger instance for this client.
   * @param {IContextManager} contextManager - The manager for handling asynchronous contexts.
   * @param {BrokerInstanceConfig} config - The configuration for this specific instance.
   */
  constructor(
    private readonly adapter: IBrokerAdapter,
    private readonly logger: ILogger,
    private readonly contextManager: IContextManager,
    private readonly config: BrokerInstanceConfig
  ) {
    this.instanceName = config.instanceName;
  }

  /**
   * Establishes a connection to the broker, wrapping the adapter's connect
   * method with logging.
   * @returns {Promise<void>}
   */
  public async connect(): Promise<void> {
    this.logger.info('Connecting to broker...');
    await this.adapter.connect();
    this.logger.info('Successfully connected to broker.');
  }

  /**
   * Disconnects from the broker, wrapping the adapter's disconnect method
   * with logging.
   * @returns {Promise<void>}
   */
  public async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from broker...');
    await this.adapter.disconnect();
    this.logger.info('Successfully disconnected from broker.');
  }

  /**
   * Publishes a message, automatically injecting the current `correlation-id`
   * from the active context into the message headers.
   * @param {string} topic - The destination topic or routing key for the message.
   * @param {BrokerMessage} message - The message to be published. The `correlation-id`
   * will be added to its headers if not present.
   * @returns {Promise<void>}
   */
  public async publish(topic: string, message: BrokerMessage): Promise<void> {
    if (!message.headers) {
      message.headers = {};
    }

    // Get current correlation ID from the active context (only if it exists, don't generate new)
    const currentCorrelationId = (this.contextManager.get(
      this.contextManager.getCorrelationIdHeaderName()
    ) || this.contextManager.get('correlationId')) as string | undefined;
    // 1. Inject context into headers based on the configuration.
    if (this.config.propagate?.includes('*')) {
      // Wildcard behavior: Propagate the entire context map.
      const contextObject = this.contextManager.getAll();
      for (const key in contextObject) {
        if (Object.prototype.hasOwnProperty.call(contextObject, key)) {
          const value = contextObject[key];
          if (typeof value === 'string' || Buffer.isBuffer(value)) {
            message.headers[key] = value;
          }
        }
      }
    } else if (this.config.propagate && Array.isArray(this.config.propagate)) {
      // New behavior: Propagate only specified context keys.
      for (const key of this.config.propagate) {
        const value = this.contextManager.get(key);
        if (typeof value === 'string' || Buffer.isBuffer(value)) {
          message.headers[key] = value;
        }
      }
    } else if (this.config.propagateFullContext) {
      // DEPRECATED: Propagate the entire context map.
      const contextObject = this.contextManager.getAll();
      for (const key in contextObject) {
        if (Object.prototype.hasOwnProperty.call(contextObject, key)) {
          const value = contextObject[key];
          if (typeof value === 'string' || Buffer.isBuffer(value)) {
            // Note: Broker headers typically support string | Buffer.
            message.headers[key] = value;
          }
        }
      }
    }

    // Only propagate correlation ID if it exists in the context (don't generate new)
    if (currentCorrelationId) {
      message.headers[this.contextManager.getCorrelationIdHeaderName()] =
        currentCorrelationId;
    }

    const transactionId = this.contextManager.getTransactionId();
    if (transactionId) {
      message.headers[this.contextManager.getTransactionIdHeaderName()] =
        transactionId;
    }

    this.logger.info(
      {
        topic,
        messageId:
          message.headers?.['id'] instanceof Buffer
            ? message.headers?.['id'].toString()
            : message.headers?.['id'],
        correlationId: currentCorrelationId, // Log the correlation ID being used
      } as any,
      'Publishing message...'
    );
    await this.adapter.publish(topic, message);
    this.logger.info(
      {
        topic,
        messageId:
          message.headers?.['id'] instanceof Buffer
            ? message.headers?.['id'].toString()
            : message.headers?.['id'],
        correlationId: currentCorrelationId, // Log the correlation ID being used
      } as any,
      'Message published successfully.'
    );
  }

  /**
   * Subscribes to a topic. It wraps the user's message handler to automatically
   * create a new asynchronous context for each incoming message. If a `correlation-id`
   * is found in the message headers, it is used to initialize the new context.
   * @param {string} topic - The topic or queue to subscribe to.
   * @param {MessageHandler} handler - The user-provided function to process incoming messages.
   * @returns {Promise<void>}
   */
  public async subscribe(
    topic: string,
    handler: MessageHandler
  ): Promise<void> {
    this.logger.info({ topic }, 'Subscribing to topic...');

    // Wrap the user's handler to implement automatic context propagation.
    const instrumentedHandler: MessageHandler = async (message, controls) => {
      // Get correlation ID from message headers first
      const messageCorrelationId =
        message.headers?.[this.contextManager.getCorrelationIdHeaderName()];

      // Get current correlation ID from context (but don't generate new one if not exists)
      const currentCorrelationId = this.contextManager.get(
        this.contextManager.getCorrelationIdHeaderName()
      ) as string;

      // If message has different correlation ID, restore context from message
      if (
        messageCorrelationId &&
        messageCorrelationId !== currentCorrelationId
      ) {
        await this.contextManager.run(async () => {
          if (message.headers) {
            for (const key in message.headers) {
              this.contextManager.set(key, message.headers[key]);
            }
          }

          // Use the message correlation ID for logging instead of generating a new one
          const correlationId = messageCorrelationId;
          this.logger.info(
            { topic, correlationId } as any,
            'Received message.'
          );

          // Also wrap the lifecycle controls to add logging for ack/nack actions.
          const instrumentedControls: MessageLifecycleControls = {
            ack: async () => {
              await controls.ack();
              this.logger.debug(
                { topic, correlationId } as any,
                'Message acknowledged (ack).'
              );
            },
            nack: async (requeue) => {
              await controls.nack(requeue);
              this.logger.warn(
                { topic, correlationId, requeue } as any,
                'Message negatively acknowledged (nack).'
              );
            },
          };

          // Execute the original user-provided handler.
          await handler(message, instrumentedControls);
        });
      } else {
        // Use current context, just set message headers if needed
        if (message.headers) {
          for (const key in message.headers) {
            this.contextManager.set(key, message.headers[key]);
          }
        }

        // Use the message correlation ID if available, otherwise use current context (but don't generate new one)
        const correlationId =
          messageCorrelationId ||
          (this.contextManager.get(
            this.contextManager.getCorrelationIdHeaderName()
          ) as string);
        this.logger.info({ topic, correlationId } as any, 'Received message.');

        // Also wrap the lifecycle controls to add logging for ack/nack actions.
        const instrumentedControls: MessageLifecycleControls = {
          ack: async () => {
            await controls.ack();
            this.logger.debug(
              { topic, correlationId } as any,
              'Message acknowledged (ack).'
            );
          },
          nack: async (requeue) => {
            await controls.nack(requeue);
            this.logger.warn(
              { topic, correlationId, requeue } as any,
              'Message negatively acknowledged (nack).'
            );
          },
        };

        // Execute the original user-provided handler.
        await handler(message, instrumentedControls);
      }
    };

    await this.adapter.subscribe(topic, instrumentedHandler);
    this.logger.info({ topic }, 'Successfully subscribed to topic.');
  }
}
