// =================================================================
//  ARCHIVO 1 (Corregido): src/KafkaAdapter.ts
//  RESPONSABILIDAD: Únicamente definir la clase adaptadora.
//  No sabe nada de singletons ni de cómo se crea la instancia de Kafka.
// =================================================================

import {
  Kafka,
  logLevel as kafkaLogLevel,
  IHeaders,
  Producer,
  Consumer,
} from 'kafkajs';
import {
  IBrokerAdapter,
  BrokerMessage,
  MessageHandler,
} from 'syntropylog/brokers';


/**
 * Helper function to normalize Kafka's complex IHeaders object into
 * the simple Record<string, string | Buffer> that our framework expects.
 * @param headers The headers object from a Kafka message.
 * @returns A normalized headers object.
 */
function normalizeKafkaHeaders(headers: IHeaders | undefined): BrokerMessage['headers'] {
  if (!headers) {
    return undefined;
  }

  const normalized: Record<string, string | Buffer> = {};
  for (const key in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, key)) {
      const value = headers[key];
      // We only accept string or Buffer, and we discard undefined or arrays for simplicity.
      if (typeof value === 'string' || Buffer.isBuffer(value)) {
        normalized[key] = value;
      }
    }
  }
  return normalized;
}

export class KafkaAdapter implements IBrokerAdapter {
  private readonly producer: Producer;
  private readonly consumer: Consumer;

  // El constructor ahora recibe la instancia de Kafka ya creada.
  // Esto lo hace más flexible y fácil de probar.
  constructor(kafkaInstance: Kafka, groupId: string) {
    this.producer = kafkaInstance.producer();
    this.consumer = kafkaInstance.consumer({ groupId });
  }

  async connect(): Promise<void> {
    await this.producer.connect();
    await this.consumer.connect();
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
    await this.consumer.disconnect();
  }

  async publish(topic: string, message: BrokerMessage): Promise<void> {
    await this.producer.send({
      topic,
      messages: [{ value: message.payload, headers: message.headers }],
    });
  }

  async subscribe(topic: string, handler: MessageHandler): Promise<void> {
    await this.consumer.subscribe({ topic, fromBeginning: true });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const brokerMessage: BrokerMessage = {
          payload: message.value!,
          headers: normalizeKafkaHeaders(message.headers),
        };

        const controls = {
          ack: async () => {
            await this.consumer.commitOffsets([
              {
                topic,
                partition,
                offset: (Number(message.offset) + 1).toString(),
              },
            ]);
          },
          nack: async () => {
            console.log(`NACK received for message on topic ${topic}.`);
          },
        };

        await handler(brokerMessage, controls);
      },
    });
  }
} 