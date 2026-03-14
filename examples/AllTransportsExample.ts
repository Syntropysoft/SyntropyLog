/**
 * Tests all console transports in a single init (pool + override).
 * Run from repo root: npx tsx examples/AllTransportsExample.ts
 *
 * Uses the local library (imports from ../src) for validation before publishing.
 */
import { syntropyLog } from '../src/SyntropyLog';
import { ConsoleTransport } from '../src/logger/transports/ConsoleTransport';
import { ClassicConsoleTransport } from '../src/logger/transports/ClassicConsoleTransport';
import { PrettyConsoleTransport } from '../src/logger/transports/PrettyConsoleTransport';
import { CompactConsoleTransport } from '../src/logger/transports/CompactConsoleTransport';
import { ColorfulConsoleTransport } from '../src/logger/transports/ColorfulConsoleTransport';

async function main() {
  await new Promise<void>((resolve, reject) => {
    syntropyLog.on('ready', () => resolve());
    syntropyLog.on('error', (err) => reject(err));
    syntropyLog.init({
      logger: {
        level: 'info',
        serviceName: 'test',
        serializerTimeoutMs: 50,
        transportList: {
          json: new ConsoleTransport({ name: 'json' }),
          classic: new ClassicConsoleTransport({ name: 'classic' }),
          pretty: new PrettyConsoleTransport({ name: 'pretty' }),
          compact: new CompactConsoleTransport({ name: 'compact' }),
          colorful: new ColorfulConsoleTransport({ name: 'colorful' }),
        },
        env: { development: ['json'] },
        envKey: 'NODE_ENV',
      },
      redis: { instances: [] },
    });
  });

  const log = syntropyLog.getLogger('all-transports');

  console.log('\n' + '='.repeat(60));
  console.log('  1. Default (plain JSON)');
  console.log('='.repeat(60));
  await log.override('json').info('Test message info');
  await log.override('json').warn('Test message warn');
  await log.override('json').error('Test message error');
  await log
    .override('json')
    .info('With metadata', { userId: 'u-1', action: 'login' });

  console.log('\n' + '='.repeat(60));
  console.log('  2. ClassicConsoleTransport');
  console.log('='.repeat(60));
  await log.override('classic').info('Test message info');
  await log.override('classic').warn('Test message warn');
  await log.override('classic').error('Test message error');
  await log
    .override('classic')
    .info('With metadata', { userId: 'u-1', action: 'login' });

  console.log('\n' + '='.repeat(60));
  console.log('  3. PrettyConsoleTransport');
  console.log('='.repeat(60));
  await log.override('pretty').info('Test message info');
  await log.override('pretty').warn('Test message warn');
  await log
    .override('pretty')
    .info('With metadata', { userId: 'u-1', action: 'login' });

  console.log('\n' + '='.repeat(60));
  console.log('  4. CompactConsoleTransport');
  console.log('='.repeat(60));
  await log.override('compact').info('Test message info');
  await log.override('compact').warn('Test message warn');
  await log
    .override('compact')
    .info('With metadata', { userId: 'u-1', action: 'login' });

  console.log('\n' + '='.repeat(60));
  console.log('  5. ColorfulConsoleTransport');
  console.log('='.repeat(60));
  await log.override('colorful').info('Test message info');
  await log.override('colorful').warn('Test message warn');
  await log
    .override('colorful')
    .info('With metadata', { userId: 'u-1', action: 'login' });

  await syntropyLog.shutdown();
  console.log('\n' + '='.repeat(60));
  console.log('  All transports OK');
  console.log('='.repeat(60) + '\n');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
