import amqplib, { Connection, Channel, ConsumeMessage } from 'amqplib';
import { IBrokerAdapter, BrokerMessage, MessageHandler } from '../../../src/brokers';

export class RabbitMQAdapter implements IBrokerAdapter {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private connectionString: string;
  private exchangeName: string;
  private consumerTags: Map<string, string> = new Map();

  constructor(connectionString: string, exchangeName = 'topic_logs') {
    this.connectionString = connectionString;
    this.exchangeName = exchangeName;
  }

  async connect(): Promise<void> {
    this.connection = await amqplib.connect(this.connectionString);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(this.exchangeName, 'topic', { durable: false });
  }

  async disconnect(): Promise<void> {
    try {
        if (this.channel) {
            await this.channel.close();
        }
        if (this.connection) {
            await this.connection.close();
        }
    } catch (error) {
        console.error('Error during RabbitMQ disconnection:', error);
    } finally {
        this.channel = null;
        this.connection = null;
    }
  }

  async publish(topic: string, message: BrokerMessage): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not available. Please connect first.');
    }
    const routingKey = topic;
    const content = Buffer.isBuffer(message.payload) ? message.payload : Buffer.from(JSON.stringify(message.payload));
    const options = {
      headers: message.headers || {},
      persistent: true,
    };
    this.channel.publish(this.exchangeName, routingKey, content, options);
  }

  async subscribe(topic: string, handler: MessageHandler): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not available. Please connect first.');
    }
    const q = await this.channel.assertQueue('', { exclusive: true });
    await this.channel.bindQueue(q.queue, this.exchangeName, topic);

    const { consumerTag } = await this.channel.consume(q.queue,
      async (msg: ConsumeMessage | null) => {
        if (msg && this.channel) {
          const brokerMessage: BrokerMessage = {
            payload: msg.content,
            headers: msg.properties.headers,
          };
          const ack = async () => this.channel!.ack(msg);
          const nack = async (requeue = false) => this.channel!.nack(msg, false, requeue);
          await handler(brokerMessage, { ack, nack });
        }
      },
      { noAck: false }
    );
    this.consumerTags.set(topic, consumerTag);
  }

  async unsubscribe(topic: string): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not available.');
    }
    const consumerTag = this.consumerTags.get(topic);
    if (consumerTag) {
      await this.channel.cancel(consumerTag);
      this.consumerTags.delete(topic);
    } else {
      console.warn(`No active subscription found for topic: ${topic}`);
    }
  }
} 