/**
 * Transport pool and per-environment routing — runnable example.
 *
 * Run from repo root: npx tsx examples/TransportPoolExample.ts
 * (or use your preferred TypeScript runner; the example imports from ../src)
 *
 * All destinations (console, db, azure, file) are simulated to stdout with labels
 * so you can see the behavior without real backends.
 * 
 * 
 * 
 *************************************************************************************
 * To see the behavior in production environment, run:
 * NODE_ENV=production npx tsx examples/TransportPoolExample.ts
 *************************************************************************************
 */
import { syntropyLog } from '../src/SyntropyLog';
import { ClassicConsoleTransport } from '../src/logger/transports/ClassicConsoleTransport';
import { ColorfulConsoleTransport } from '../src/logger/transports/ColorfulConsoleTransport';
import { CompactConsoleTransport } from '../src/logger/transports/CompactConsoleTransport';

import { AdapterTransport } from '../src/logger/transports/AdapterTransport';
import { UniversalAdapter } from '../src/logger/adapters/UniversalAdapter';

const mockToConsole = (label: string) =>
  new AdapterTransport({
    name: label,
    adapter: new UniversalAdapter({
      executor: (data: unknown) =>
        console.log(`[${label}]`, JSON.stringify(data, null, 0).slice(0, 120) + '...'),
    }),
  });

async function main() {
  await new Promise<void>((resolve, reject) => {
    syntropyLog.on('ready', () => resolve());
    syntropyLog.on('error', (err) => reject(err));
    syntropyLog.init({
      logger: {
        envKey: 'NODE_ENV',
        level: 'info',
        serviceName: 'transport-pool-example',
        serializerTimeoutMs: 50,
        transportList: {
          console: new ClassicConsoleTransport({ name: 'console' }),
          db: new ColorfulConsoleTransport({ name: 'db' }),
          azure: mockToConsole('azure'),
          file: new CompactConsoleTransport({ name: 'file' }),
        },
        env: {
          development: ['console'],
          staging: ['console', 'file', 'azure'],
          production: ['console', 'db', 'azure'],
        },
      },
      redis: { instances: [] },
    });
  });

  const log = syntropyLog.getLogger('app');

  console.log('\n--- 1. Default (according to NODE_ENV) ---');
  await log.info('Hello, default set');

  console.log('\n--- 2. Override: only console ---');
  await log.override('console').info('This goes only to console');

  console.log('\n--- 3. Remove db and azure from default ---');
  await log.remove('db').remove('azure').info('Default minus db and azure');

  console.log('\n--- 4. Add file to default ---');
  await log.add('file').info('Default plus file');

  console.log('\n--- 5. Back to default ---');
  await log.info('Default again');

  await syntropyLog.shutdown();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
