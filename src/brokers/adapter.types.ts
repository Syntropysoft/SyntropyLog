/**
 * FILE: src/brokers/adapter.types.ts (NUEVO)
 * DESCRIPTION:
 * Defines the "Universal Broker Contract" for any messaging client
 * that wants to be instrumented by SyntropyLog.
 */

/**
 * Represents a standard message format that the framework understands.
 * The adapter is responsible for converting the broker-specific message
 * format to this structure, and vice-versa.
 */
export interface BrokerMessage {
  /**
   * The actual content of the message. Using Buffer is the most flexible
   * approach as it supports any type of serialization (JSON, Avro, etc.).
   */
  payload: Buffer;

  /**
   * Key-value metadata attached to the message.
   * This is where SyntropyLog will inject tracing headers like correlation-id.
   */
  headers?: Record<string, string | Buffer>;
}

/**
 * Defines the controls for handling a received message's lifecycle.
 * An instance of this is passed to the user's message handler.
 */
export interface MessageLifecycleControls {
  /**
   * Acknowledges that the message has been successfully processed.
   * This typically removes the message from the queue.
   */
  ack: () => Promise<void>;

  /**
   * Negatively acknowledges the message, indicating a processing failure.
   * @param requeue - If true, asks the broker to re-queue the message
   * for another attempt. If false, the broker might move it to a dead-letter queue.
   */
  nack: (requeue?: boolean) => Promise<void>;
}

/**
 * The signature for the user-provided function that will process incoming messages.
 * @param message The received message in the framework's standard format.
 * @param controls The functions to manage the message's lifecycle (ack/nack).
 */
export type MessageHandler = (
  message: BrokerMessage,
  controls: MessageLifecycleControls
) => Promise<void>;

/**
 * The interface that every Broker Client Adapter must implement.
 * This is the "plug" where users will connect their messaging clients.
 */
export interface IBrokerAdapter {
  /**
   * Establishes a connection to the broker.
   */
  connect(): Promise<void>;

  /**
   * Gracefully disconnects from the broker.
   */
  disconnect(): Promise<void>;

  /**
   * Publishes a message to a specific topic or routing key.
   * @param topic The destination for the message.
   * @param message The message to be sent, in the framework's standard format.
   */
  publish(topic: string, message: BrokerMessage): Promise<void>;

  /**
   * Subscribes to a topic or queue to receive messages.
   * @param topic The source of messages to listen to.
   * @param handler The user's function that will be called for each message.
   */
  subscribe(topic: string, handler: MessageHandler): Promise<void>;
}
