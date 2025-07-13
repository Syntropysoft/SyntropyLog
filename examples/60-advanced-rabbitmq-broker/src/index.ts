// examples/05-advanced-brokers-rabbitmq/src/index.ts
import { syntropyLog, SyntropyLogConfig } from 'syntropylog';
import { MessageHandler } from 'syntropylog/brokers';
import { createRabbitMQAdapter } from './rabbitmq-client';
import { RabbitMQAdapter } from './RabbitMQAdapter'; // Necesitamos el tipo

// --- 1. Definir la Configuración del Framework ---
const config: SyntropyLogConfig = {
  logger: {
    serviceName: 'RabbitMQ-Advanced-Example',
    level: 'trace',
    serializerTimeoutMs: 50, // Añadido para cumplir con el tipo
  },
  brokers: {
    instances: [
      {
        instanceName: 'rabbit-main', // Corregido de 'name' a 'instanceName'
        adapter: createRabbitMQAdapter(), // Usamos nuestra función para crear el adaptador
      },
    ],
  },
};

// --- 2. Simular dos Workers con sus propios Handlers ---

/**
 * Worker 1: Servicio de Auditoría
 * Este handler simplemente registra que un evento ha ocurrido.
 */
const auditServiceHandler: MessageHandler = async (message, controls) => {
  const logger = syntropyLog.getLogger('audit-service');
  const messageContent = message.payload.toString();

  logger.info(
    { data: messageContent },
    'Evento recibido para auditoría.'
  );

  // Confirmamos que el mensaje fue procesado.
  await controls.ack();
};

/**
 * Worker 2: Servicio de Notificaciones
 * Este handler simula el envío de una notificación.
 */
const notificationServiceHandler: MessageHandler = async (message, controls) => {
  const logger = syntropyLog.getLogger('notification-service');
  const messageContent = message.payload.toString();
  
  logger.info(
    { data: messageContent, target: 'user-xyz' },
    'Enviando notificación basada en el evento.'
  );

  // Confirmamos que el mensaje fue procesado.
  await controls.ack();
};


// --- 3. Función Principal de Orquestación ---
async function main() {
  console.log('--- Iniciando Ejemplo Avanzado de RabbitMQ ---');

  await syntropyLog.init(config);
  const logger = syntropyLog.getLogger('main');
  
  // Obtenemos nuestro broker instrumentado.
  const rabbitBroker = syntropyLog.getBroker('rabbit-main');
  
  // En RabbitMQ, para un patrón Fanout, necesitamos un "exchange".
  // Los publicadores envían a un exchange, los consumidores leen de una cola.
  const exchangeName = 'user-events-exchange';
  const auditQueue = 'audit-queue';
  const notificationQueue = 'notification-queue';

  // Hack para acceder al canal de amqplib y configurar el exchange y las colas.
  // En una app real, esto podría estar en un script de inicialización.
  const adapter = config.brokers!.instances![0].adapter as RabbitMQAdapter;
  // @ts-ignore - Accediendo a una propiedad privada para el bien de la demo.
  const channel = adapter.channel;
  if (!channel) {
    logger.fatal('El canal de RabbitMQ no se ha inicializado.');
    return;
  }
  
  await channel.assertExchange(exchangeName, 'fanout', { durable: false });
  await channel.assertQueue(auditQueue, { exclusive: true });
  await channel.assertQueue(notificationQueue, { exclusive: true });
  await channel.bindQueue(auditQueue, exchangeName, '');
  await channel.bindQueue(notificationQueue, exchangeName, '');

  logger.info(`Exchange '${exchangeName}' y colas '${auditQueue}', '${notificationQueue}' configuradas.`);

  // Suscribimos nuestros dos workers a sus respectivas colas
  await rabbitBroker.subscribe(auditQueue, auditServiceHandler);
  await rabbitBroker.subscribe(notificationQueue, notificationServiceHandler);
  logger.info('Workers suscritos y esperando mensajes...');

  // Esperamos un momento para que las suscripciones se establezcan
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Publicamos un único evento. El exchange lo enviará a ambas colas.
  const eventPayload = { userId: 'user-123', action: 'login' };
  logger.info({ event: eventPayload }, 'Publicando un nuevo evento de usuario...');
  
  // El "topic" para publicar es el nombre del exchange.
  await rabbitBroker.publish(exchangeName, {
    payload: Buffer.from(JSON.stringify(eventPayload)),
  });

  // Esperamos un poco para ver los logs de los consumidores y luego cerramos.
  setTimeout(async () => {
    logger.info('--- Finalizando Ejemplo ---');
    await syntropyLog.shutdown();
  }, 3000);
}

main().catch(error => {
  console.error('Error fatal en la aplicación:', error);
  process.exit(1);
}); 