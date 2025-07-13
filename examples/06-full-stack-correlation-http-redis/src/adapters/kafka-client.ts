import { Kafka, logLevel as kafkaLogLevel } from 'kafkajs';
import { KafkaAdapter } from './KafkaAdapter';

const KAFKA_BROKERS = ['localhost:9092'];

const kafkaInstance = new Kafka({
  clientId: 'my-app',
  brokers: KAFKA_BROKERS,
  logLevel: kafkaLogLevel.ERROR,
});

export const myKafkaBusAdapter = new KafkaAdapter(kafkaInstance, 'my-group'); 