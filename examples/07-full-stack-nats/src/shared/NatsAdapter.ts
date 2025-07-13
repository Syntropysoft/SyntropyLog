// examples/07-full-stack-nats/src/shared/NatsAdapter.ts
import {
  connect,
  NatsConnection,
  StringCodec,
  headers,
  Subscription,
  Msg,
  JetStreamClient,
} from 'nats';
import {
  IBrokerAdapter,
  BrokerMessage,
  MessageHandler,
} from 'syntropylog/brokers';

export interface NatsAdapterOptions {
  servers: string | string[];
}

/**
 * An adapter to make the 'nats.js' library compatible with SyntropyLog's broker instrumentation.
 * This implementation assumes usage of NATS JetStream for message acknowledgment.
 */
export class NatsAdapter implements IBrokerAdapter {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private subscriptions: Map<string, Subscription> = new Map();
  private readonly options: NatsAdapterOptions;
  private readonly stringCodec = StringCodec();

  constructor(options: NatsAdapterOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.nc) {
      return;
    }
    this.nc = await connect({ servers: this.options.servers });
    this.js = this.nc.jetstream();
  }

  async disconnect(): Promise<void> {
    if (!this.nc) {
      return;
    }
    // Drain ensures all pending messages are processed before closing.
    await this.nc.drain();
    this.nc = null;
    this.js = null;
  }

  async publish(topic: string, message: BrokerMessage): Promise<void> {
    if (!this.js) {
      throw new Error('NATS connection not established. Call connect() first.');
    }

    const h = headers();
    if (message.headers) {
      for (const [key, value] of Object.entries(message.headers)) {
        const headerValue =
          typeof value === 'string' ? value : this.stringCodec.decode(value);
        h.append(key, headerValue);
      }
    }

    await this.js.publish(topic, message.payload, { headers: h });
  }

  async subscribe(topic: string, handler: MessageHandler): Promise<void> {
    if (!this.nc || !this.js) {
      throw new Error('NATS connection not established. Call connect() first.');
    }
    if (this.subscriptions.has(topic)) {
      throw new Error(`A subscription for topic "${topic}" already exists.`);
    }

    const sub = this.nc.subscribe(topic, {
        manualAck: true, // Important for JetStream
    });
    
    this.subscriptions.set(topic, sub);

    // Asynchronously process messages from the subscription
    (async () => {
      for await (const m of sub) {
        const brokerMessage: BrokerMessage = {
          payload: m.data,
          headers: this.natsHeadersToRecord(m.headers),
        };

        // The controls are how the user's handler will acknowledge the message.
        const controls = {
          ack: async () => {
            m.ack();
          },
          nack: async () => {
            m.nak();
          },
        };

        // Execute the user-provided handler with the translated message and controls.
        await handler(brokerMessage, controls);
      }
    })();
  }

  private natsHeadersToRecord(natsHeaders: any): Record<string, string> {
    const record: Record<string, string> = {};
    if (!natsHeaders) return record;
    for (const [key, values] of natsHeaders) {
      // NATS headers can have multiple values, we take the first one.
      if (values.length > 0) {
        record[key] = values[0];
      }
    }
    return record;
  }
} 