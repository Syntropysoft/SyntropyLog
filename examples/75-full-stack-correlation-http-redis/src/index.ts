// =================================================================
//  ARCHIVO 3 (Corregido): src/index.ts
//  RESPONSABILIDAD: Orquestar la aplicación. Ya no sabe cómo se
//  crea el adaptador, simplemente lo importa y lo usa.
// =================================================================

import { randomUUID } from 'node:crypto';
import { syntropyLog, ClassicConsoleTransport } from 'syntropylog';

// --- ¡LA MAGIA! ---
// Importamos la instancia singleton del adaptador desde nuestro archivo centralizado.
import { myRedisBusAdapter } from './adapters/redis-client';

const CHANNEL_NAME = 'syntropylog-test-channel';

async function main() {
  console.log('--- Running Redis Broker Instrumentation Example ---');

  // La configuración ahora es mucho más limpia y clara.
  syntropyLog.init({
    logger: {
      level: 'info',
      serviceName: 'redis-broker-example',
      transports: [new ClassicConsoleTransport()],
      serializerTimeoutMs: 100,
    },
    context: {
      correlationIdHeader: 'X-Correlation-ID',
    },
    brokers: {
      instances: [
        {
          instanceName: 'my-redis-bus',
          adapter: myRedisBusAdapter, // Usamos la instancia importada
        },
      ],
    },
  });

  const broker = syntropyLog.getBroker('my-redis-bus');
  const contextManager = syntropyLog.getContextManager();

  try {
    await broker.connect();

    await broker.subscribe(CHANNEL_NAME, async (message, controls) => {
      const logger = syntropyLog.getLogger('consumer');
      logger.info(
        { payload: message.payload.toString() },
        'Message processed by consumer.'
      );
      await controls.ack(); // In Redis PUB/SUB, this does nothing but is kept for interface compliance
    });

    await contextManager.run(async () => {
      const correlationId = randomUUID();
      contextManager.set(
        contextManager.getCorrelationIdHeaderName(),
        correlationId
      );

      const logger = syntropyLog.getLogger('producer');
      logger.info('Producer context created. Publishing message...');

      await broker.publish(CHANNEL_NAME, {
        payload: Buffer.from('Hello, distributed world!'),
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));
    });
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    await broker.disconnect();
    await syntropyLog.shutdown();
    console.log('\n✅ Redis broker example finished.');
  }
}

main(); 