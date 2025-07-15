// examples/80-full-stack-nats/src/shared/NatsAdapter.ts
import {
  IBrokerAdapter,
  BrokerMessage,
  MessageHandler,
  MessageLifecycleControls,
} from 'syntropylog/brokers/adapter.types';
import { connect, NatsConnection, StringCodec, headers, Subscription, Msg } from 'nats';

const CORRELATION_ID_KEY = 'x-correlation-id';

export class NatsAdapter implements IBrokerAdapter {
  private nc: NatsConnection | null = null;
  private readonly sc = StringCodec();
  private readonly natsServers: string[];
  private subscriptions: Subscription[] = [];

  constructor(servers: string | string[] = 'nats://nats:4222') {
    this.natsServers = Array.isArray(servers) ? servers : [servers];
  }

  async connect(): Promise<void> {
    if (this.nc) return;
    try {
      this.nc = await connect({ servers: this.natsServers });
    } catch (err) {
      // Allow the manager to handle logging of this error.
      throw new Error(`Failed to connect to NATS servers: ${err}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.nc) {
      this.subscriptions.forEach((sub) => sub.drain());
      await this.nc.drain();
      this.nc = null;
    }
  }

  async publish(topic: string, message: BrokerMessage): Promise<void> {
    if (!this.nc) {
      throw new Error('NATS client not connected. Cannot publish.');
    }
    const natsHeaders = headers();
    if (message.headers) {
      for (const key in message.headers) {
        const value = message.headers[key];
        // The value from InstrumentedBrokerClient will be a string.
        // NATS header values must be strings.
        if (typeof value === 'string') {
          natsHeaders.append(key, value);
        } else {
          // It's a buffer, so we decode it. This might not be hit
          // if the instrumenter always provides strings.
          natsHeaders.append(key, this.sc.decode(value));
        }
      }
    }
    this.nc.publish(topic, message.payload, { headers: natsHeaders });
  }

  async subscribe(topic: string, handler: MessageHandler): Promise<void> {
    if (!this.nc) {
      throw new Error('NATS client not connected. Cannot subscribe.');
    }

    const sub = this.nc.subscribe(topic);
    this.subscriptions.push(sub);

    (async () => {
      for await (const m of sub) {
        const brokerMessage: BrokerMessage = {
          payload: Buffer.from(m.data),
          headers: this.natsHeadersToRecord(m.headers),
        };

        const controls: MessageLifecycleControls = {
          ack: async () => { /* NATS Core doesn't have explicit ack/nack per message */ },
          nack: async () => { /* NATS Core doesn't have explicit ack/nack per message */ },
        };
        // The BrokerManager will wrap this handler call in a context.
        await handler(brokerMessage, controls);
      }
    })().catch((err) => {
      // Let the BrokerManager's logger handle this.
      console.error(`Error in NATS subscription for topic "${topic}":`, err);
    });
  }

  private natsHeadersToRecord(natsHeaders?: any): Record<string, string> {
    const record: Record<string, string> = {};
    if (!natsHeaders) return record;
    for (const [key, values] of natsHeaders) {
      if (values.length > 0) {
        record[key] = values[0];
      }
    }
    return record;
  }
} 