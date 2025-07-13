import { createClient, RedisClientType } from 'redis';
import {
  IBrokerAdapter,
  BrokerMessage,
  MessageHandler,
  MessageControls,
} from 'syntropylog/brokers';

export class RedisAdapter implements IBrokerAdapter {
  private publisher: RedisClientType;
  private subscriber: RedisClientType;
  private readonly subscriptions: Map<string, MessageHandler> = new Map();

  constructor(redisUrl: string) {
    this.publisher = createClient({ url: redisUrl });
    this.subscriber = createClient({ url: redisUrl });

    this.subscriber.on('error', (err) => console.error('Redis Subscriber Error', err));
    this.publisher.on('error', (err) => console.error('Redis Publisher Error', err));
  }

  async connect(): Promise<void> {
    await this.publisher.connect();
    await this.subscriber.connect();
  }

  async disconnect(): Promise<void> {
    // Unsubscribe from all channels before quitting
    if (this.subscriber.isOpen && this.subscriptions.size > 0) {
      const subscribedChannels = Array.from(this.subscriptions.keys());
      await this.subscriber.unsubscribe(subscribedChannels);
    }

    if (this.publisher.isOpen) {
      await this.publisher.quit();
    }
    if (this.subscriber.isOpen) {
      await this.subscriber.quit();
    }
  }

  async publish(channel: string, message: BrokerMessage): Promise<void> {
    const messageStr = JSON.stringify({
      payload: message.payload.toString('base64'), // Serialize buffer as base64
      headers: message.headers,
    });
    await this.publisher.publish(channel, messageStr);
  }

  async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, handler);
      
      await this.subscriber.subscribe(channel, (message, ch) => {
        const parsedMessage = JSON.parse(message);
        const brokerMessage: BrokerMessage = {
          payload: Buffer.from(parsedMessage.payload, 'base64'), // Deserialize buffer from base64
          headers: parsedMessage.headers,
        };

        const controls: MessageControls = {
          ack: async () => { /* PUB/SUB doesn't require ACK */ },
          nack: async () => { /* PUB/SUB doesn't require NACK */ },
        };
        
        const registeredHandler = this.subscriptions.get(ch);
        if (registeredHandler) {
          registeredHandler(brokerMessage, controls);
        }
      });
    }
  }
} 