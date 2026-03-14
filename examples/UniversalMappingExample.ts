/**
 * @file examples/UniversalMappingExample.ts
 * @description Demonstrates UniversalAdapter and UniversalLogFormatter.
 * Maps application logs to a flat "Legacy SIEM" schema without touching business code.
 */
import {
  syntropyLog,
  UniversalAdapter,
  UniversalLogFormatter,
  LogLevel,
} from '../src/index';
import { AdapterTransport } from '../src/logger/transports/AdapterTransport';

async function runExample() {
  // 1. Define the mapping for the "Legacy SIEM"
  // SIEM expects specific fields: 'evt_time', 'sev', 'msg', 'app_id', 'tx_id'
  const legacyFormatter = new UniversalLogFormatter({
    mapping: {
      evt_time: 'timestamp',
      sev: 'level',
      msg: 'message',
      app_id: { value: 'PAYMENT-GATEWAY-01' }, // Static value
      tx_id: ['transactionId', 'correlationId', { value: 'N/A' }], // Cascading fallbacks
      user: 'user.id', // Deep path (if present in metadata)
      retention_days: 'retention.days',
    },
  });

  // 2. Define the universal adapter with an executor (e.g. API or DB call)
  const siemAdapter = new UniversalAdapter({
    executor: async (mappedData) => {
      console.log('\n--- [LEGACY SIEM DESTINATION] ---');
      console.log(
        'Sending mapped object:',
        JSON.stringify(mappedData, null, 2)
      );
      console.log('-----------------------------\n');
      // Here you would: await axios.post('http://localhost:3000/logs', mappedData);
    },
  });

  // 3. Configure the transport using the adapter and formatter
  const legacyTransport = new AdapterTransport({
    adapter: siemAdapter,
    formatter: legacyFormatter as any, // Cast for structural type compatibility
    name: 'LegacySiemTransport',
  });

  await new Promise<void>((resolve, reject) => {
    syntropyLog.on('ready', () => resolve());
    syntropyLog.on('error', (err) => reject(err));
    syntropyLog.init({
      logger: {
        serviceName: 'payment-service',
        level: 'info' as LogLevel,
        serializerTimeoutMs: 100,
        transports: [legacyTransport],
      },
    });
  });

  const logger = syntropyLog.getLogger('payment-service');

  console.log('Starting transaction...');

  // 5. Business code only logs with standard metadata
  // SyntropyLog handles the mapping
  await logger.withTransactionId('TX-999555').info('Processing card payment', {
    user: { id: 'usr_4422', email: 'test@example.com' },
    amount: 1500.5,
    retention: { days: 90, policy: 'FINANCIAL_RECORDS' },
  });

  await syntropyLog.shutdown();
}

runExample().catch(console.error);
