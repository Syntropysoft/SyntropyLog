/**
 * @file src/brokers/adapter.types.ts
 * @description Defines the "Universal Broker Contract" for any messaging client
 * that wants to be instrumented by SyntropyLog. These generic interfaces
 * are key to decoupling the framework from specific implementations like
 * RabbitMQ or Kafka.
 */

/**
 * @interface BrokerMessage
 * @description Represents a standard message format that the framework understands.
 * The adapter is responsible for converting the broker-specific message
 * format to this structure, and vice-versa.
 */
export interface BrokerMessage {
  /**
   * The actual content of the message. Using `Buffer` is the most flexible
   * approach as it supports any type of serialization (JSON, Avro, Protobuf, etc.).
   */
  payload: Buffer;

  /**
   * Key-value metadata attached to the message.
   * This is where SyntropyLog will inject tracing headers like `correlation-id`.
   */
  headers?: Record<string, string | Buffer>;
}

/**
 * @interface MessageLifecycleControls
 * @description Defines the controls for handling a received message's lifecycle.
 * An instance of this is passed to the user's message handler, allowing them
 * to confirm or reject the message.
 */
export interface MessageLifecycleControls {
  /**
   * Acknowledges that the message has been successfully processed.
   * This typically removes the message from the queue.
   * @returns {Promise<void>}
   */
  ack: () => Promise<void>;

  /**
   * Negatively acknowledges the message, indicating a processing failure.
   * @param {boolean} [requeue=false] - If true, asks the broker to re-queue the message
   * for another attempt. If false (or omitted), the broker might move it to a dead-letter queue
   * or discard it, depending on its configuration.
   * @returns {Promise<void>}
   */
  nack: (requeue?: boolean) => Promise<void>;
}

/**
 * @type MessageHandler
 * @description The signature for the user-provided function that will process incoming messages.
 * @param {BrokerMessage} message - The received message in the framework's standard format.
 * @param {MessageLifecycleControls} controls - The functions to manage the message's lifecycle (ack/nack).
 * @returns {Promise<void>}
 */
export type MessageHandler = (
  message: BrokerMessage,
  controls: MessageLifecycleControls
) => Promise<void>;

/**
 * @interface IBrokerAdapter
 * @description The interface that every Broker Client Adapter must implement.
 * This is the "plug" where users will connect their specific messaging clients
 * (e.g., `amqplib`, `kafkajs`).
 */
export interface IBrokerAdapter {
  /**
   * Establishes a connection to the message broker.
   * @returns {Promise<void>}
   */
  connect(): Promise<void>;

  /**
   * Gracefully disconnects from the broker.
   */
  /**
   * Gracefully disconnects from the message broker.
   * @returns {Promise<void>}
   */
  disconnect(): Promise<void>;

  /**
   * Publishes a message to a specific topic or routing key.
   * @param {string} topic - The destination for the message (e.g., a topic name, queue name, or routing key).
   * @param {BrokerMessage} message - The message to be sent, in the framework's standard format.
   * @returns {Promise<void>}
   */
  publish(topic: string, message: BrokerMessage): Promise<void>;

  /**
   * Subscribes to a topic or queue to receive messages.
   * @param {string} topic - The source of messages to listen to (e.g., a topic name or queue name).
   * @param {MessageHandler} handler - The user's function that will be called for each incoming message.
   * @returns {Promise<void>}
   */
  subscribe(topic: string, handler: MessageHandler): Promise<void>;
}
