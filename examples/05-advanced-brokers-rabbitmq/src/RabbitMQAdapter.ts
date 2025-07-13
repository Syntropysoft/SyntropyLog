// examples/05-advanced-brokers-rabbitmq/src/RabbitMQAdapter.ts
import * as amqplib from 'amqplib';
import {
  IBrokerAdapter,
  BrokerMessage,
  MessageHandler,
} from 'syntropylog/brokers';

export class RabbitMQAdapter implements IBrokerAdapter {
  private connection: amqplib.Connection | null = null;
  private channel: amqplib.Channel | null = null;
  private readonly connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  async connect(): Promise<void> {
    this.connection = await amqplib.connect(this.connectionString);
    this.channel = await this.connection.createChannel();
    console.log('RabbitMQ Adapter: Connected and channel created.');
  }

  async disconnect(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
    console.log('RabbitMQ Adapter: Disconnected.');
  }

  async publish(topic: string, message: BrokerMessage): Promise<void> {
    if (!this.channel) {
      throw new Error('Not connected. Call connect() before publishing.');
    }

    const queue = topic;
    await this.channel.assertQueue(queue, { durable: true });

    this.channel.sendToQueue(queue, message.payload, {
      headers: message.headers as Record<string, any>,
      persistent: true,
    });
  }

  async subscribe(topic: string, handler: MessageHandler): Promise<void> {
    if (!this.channel) {
      throw new Error('Not connected. Call connect() before subscribing.');
    }

    const queue = topic;
    await this.channel.assertQueue(queue, { durable: true });

    this.channel.consume(
      queue,
      async (msg: amqplib.ConsumeMessage | null) => {
        if (msg) {
          const brokerMessage: BrokerMessage = {
            payload: msg.content,
            headers: msg.properties.headers as Record<string, string | Buffer>,
          };

          const controls = {
            ack: async () => {
              if (this.channel) this.channel.ack(msg);
            },
            nack: async (requeue = false) => {
              if (this.channel) this.channel.nack(msg, false, requeue);
            },
          };

          try {
            await handler(brokerMessage, controls);
          } catch (error) {
            console.error('Error processing message, automatically nacking...', { error });
            await controls.nack(false);
          }
        }
      },
      { noAck: false }
    );
  }
} 