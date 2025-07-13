// =================================================================
//  FILE: src/kafka-client.ts
//  RESPONSIBILITY: Create and export the SINGLE instance (singleton)
//  of our adapter. This is the only place where Kafka is configured.
// =================================================================

import { Kafka, logLevel as kafkaLogLevel } from 'kafkajs';
import { KafkaAdapter } from './KafkaAdapter';

const KAFKA_BROKERS = ['localhost:9092'];

// 1. The Kafka instance is created ONCE.
const kafka = new Kafka({
  clientId: 'my-app-client',
  brokers: KAFKA_BROKERS,
  logLevel: kafkaLogLevel.ERROR,
});

// 2. The adapter is created by passing it the Kafka instance.
const kafkaAdapter = new KafkaAdapter(kafka, 'my-app-group');

// 3. The adapter instance is exported for the entire app to use.
export const myKafkaBusAdapter = kafkaAdapter;