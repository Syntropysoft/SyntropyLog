import {
  connect,
  NatsConnection,
  JSONCodec,
  Subscription as NatsSubscription,
  headers,
} from 'nats';
import {
  IBrokerAdapter,
  BrokerMessage,
  MessageHandler,
} from 'syntropylog';

export class NatsAdapter implements IBrokerAdapter {
  private natsConnection!: NatsConnection;
  private codec = JSONCodec();
  private subscriptions: NatsSubscription[] = [];

  constructor() {
    // Constructor is now empty, configuration is passed to connect.
  }

  async connect(): Promise<void> {
    if (this.natsConnection) return;
    // For this example, we'll connect to a default server
    this.natsConnection = await connect({ servers: 'nats://localhost:4222' });
  }

  async disconnect(): Promise<void> {
    if (this.natsConnection) {
      await Promise.all(this.subscriptions.map((sub) => sub.drain()));
      await this.natsConnection.drain();
    }
  }

  async publish(
    topic: string,
    message: BrokerMessage,
    // options are ignored for this basic adapter
  ): Promise<void> {
    if (!this.natsConnection) {
      throw new Error('NATS client not connected.');
    }
    const natsHeaders = headers();
    if (message.headers) {
      for (const [key, value] of Object.entries(message.headers)) {
        if (value !== undefined) {
          natsHeaders.append(key, value.toString());
        }
      }
    }
    this.natsConnection.publish(topic, this.codec.encode(message.payload), {
      headers: natsHeaders,
    });
  }

  async subscribe(topic: string, handler: MessageHandler): Promise<void> {
    if (!this.natsConnection) {
      throw new Error('NATS client not connected.');
    }

    const sub = this.natsConnection.subscribe(topic);
    this.subscriptions.push(sub);

    (async () => {
      for await (const m of sub) {
        try {
                  const msg: BrokerMessage = {
          payload: Buffer.from(this.codec.decode(m.data) as any),
          headers: this.natsHeadersToRecord(m.headers),
        };
          // Call handler with the correct 2-argument signature
          await handler(msg, {
            ack: async () => {
              /* NOP for core NATS */
            },
            nack: async () => {
              /* NOP for core NATS */
            },
          });
        } catch (err) {
          // If there's an error (e.g., JSON parsing), we can't process the message,
          // but we don't want to crash the whole service. We'll log it.
          // A more robust implementation might publish to a dead-letter queue.
          console.error(`Failed to process message from topic ${topic}`, err);
        }
      }
    })();
  }

  private natsHeadersToRecord(
    natsHeaders?: ReturnType<typeof headers>,
  ): Record<string, string | Buffer> {
    const record: Record<string, string | Buffer> = {};
    if (natsHeaders) {
      for (const key of natsHeaders.keys()) {
        const values = natsHeaders.get(key);
        if (values && values.length > 0) {
          // Convert arrays to strings for simplicity
          record[key] = Array.isArray(values) ? values.join(',') : values;
        }
      }
    }
    return record;
  }
} 