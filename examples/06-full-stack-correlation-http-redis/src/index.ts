// =================================================================
//  ARCHIVO 3 (Corregido): src/index.ts
//  RESPONSABILIDAD: Orquestar la aplicación. Ya no sabe cómo se
//  crea el adaptador, simplemente lo importa y lo usa.
// =================================================================

import { randomUUID } from 'node:crypto';
import { syntropyLog, ClassicConsoleTransport } from 'syntropylog';

// --- ¡LA MAGIA! ---
// Importamos la instancia singleton del adaptador desde nuestro archivo centralizado.
import { myKafkaBusAdapter } from './adapters/kafka-client';

const TOPIC_NAME = 'syntropylog-test-topic';

async function main() {
  console.log('--- Running Broker Instrumentation Example ---');

  // La configuración ahora es mucho más limpia y clara.
  syntropyLog.init({
    logger: {
      level: 'info',
      serviceName: 'broker-example',
      transports: [new ClassicConsoleTransport()],
      serializerTimeoutMs: 100,
    },
    context: {
      correlationIdHeader: 'X-Correlation-ID',
    },
    brokers: {
      instances: [
        {
          instanceName: 'my-kafka-bus',
          adapter: myKafkaBusAdapter, // Usamos la instancia importada
        },
      ],
    },
  });

  const broker = syntropyLog.getBroker('my-kafka-bus');
  const contextManager = syntropyLog.getContextManager();

  try {
    await broker.connect();

    await broker.subscribe(TOPIC_NAME, async (message, controls) => {
      const logger = syntropyLog.getLogger('consumer');
      logger.info(
        { payload: message.payload.toString() },
        'Message processed by consumer.'
      );
      await controls.ack();
    });

    await contextManager.run(async () => {
      const correlationId = randomUUID();
      contextManager.set(
        contextManager.getCorrelationIdHeaderName(),
        correlationId
      );

      const logger = syntropyLog.getLogger('producer');
      logger.info('Producer context created. Publishing message...');

      await broker.publish(TOPIC_NAME, {
        payload: Buffer.from('Hello, distributed world!'),
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));
    });
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    await broker.disconnect();
    await syntropyLog.shutdown();
    console.log('\n✅ Broker example finished.');
  }
}

main();
