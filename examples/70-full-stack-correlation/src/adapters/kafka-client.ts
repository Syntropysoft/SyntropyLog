// =================================================================
//  ARCHIVO 2 (Corregido): src/kafka-client.ts
//  RESPONSABILIDAD: Crear y exportar la ÚNICA instancia (singleton)
//  de nuestro adaptador. Es el único lugar donde se configura Kafka.
// =================================================================

import { Kafka, logLevel as kafkaLogLevel } from 'kafkajs';
import { KafkaAdapter } from './KafkaAdapter';

const KAFKA_BROKERS = ['localhost:9092'];

// 1. Se crea la instancia de Kafka UNA SOLA VEZ.
const kafka = new Kafka({
  clientId: 'my-app-client',
  brokers: KAFKA_BROKERS,
  logLevel: kafkaLogLevel.ERROR,
});

// 2. Se crea el adaptador pasándole la instancia de Kafka.
const kafkaAdapter = new KafkaAdapter(kafka, 'my-app-group');

// 3. Se exporta la instancia del adaptador para que toda la app la use.
export const myKafkaBusAdapter = kafkaAdapter;