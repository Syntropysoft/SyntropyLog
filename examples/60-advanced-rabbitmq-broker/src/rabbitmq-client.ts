// examples/05-advanced-brokers-rabbitmq/src/rabbitmq-client.ts
import { RabbitMQAdapter } from './RabbitMQAdapter';

// La URL de conexión se obtiene del docker-compose.yaml
const RABBITMQ_CONNECTION_URL = 'amqp://user:password@localhost:5672';

/**
 * Crea y configura una nueva instancia del adaptador de RabbitMQ.
 * En una aplicación real, la URL de conexión vendría de variables de entorno.
 * @returns {RabbitMQAdapter} Una nueva instancia del adaptador.
 */
export function createRabbitMQAdapter(): RabbitMQAdapter {
  return new RabbitMQAdapter(RABBITMQ_CONNECTION_URL);
} 