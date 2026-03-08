/**
 * Prueba todos los console transports en una sola init (pool + override).
 * Ejecutar desde la raíz del repo: npx tsx examples/AllTransportsExample.ts
 *
 * Usa la librería local (imports desde ../src) para validar antes de publicar.
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
  await log.override('json').info('Mensaje de prueba info');
  await log.override('json').warn('Mensaje de prueba warn');
  await log.override('json').error('Mensaje de prueba error');
  await log
    .override('json')
    .info('Con metadata', { userId: 'u-1', action: 'login' });

  console.log('\n' + '='.repeat(60));
  console.log('  2. ClassicConsoleTransport');
  console.log('='.repeat(60));
  await log.override('classic').info('Mensaje de prueba info');
  await log.override('classic').warn('Mensaje de prueba warn');
  await log.override('classic').error('Mensaje de prueba error');
  await log
    .override('classic')
    .info('Con metadata', { userId: 'u-1', action: 'login' });

  console.log('\n' + '='.repeat(60));
  console.log('  3. PrettyConsoleTransport');
  console.log('='.repeat(60));
  await log.override('pretty').info('Mensaje de prueba info');
  await log.override('pretty').warn('Mensaje de prueba warn');
  await log
    .override('pretty')
    .info('Con metadata', { userId: 'u-1', action: 'login' });

  console.log('\n' + '='.repeat(60));
  console.log('  4. CompactConsoleTransport');
  console.log('='.repeat(60));
  await log.override('compact').info('Mensaje de prueba info');
  await log.override('compact').warn('Mensaje de prueba warn');
  await log
    .override('compact')
    .info('Con metadata', { userId: 'u-1', action: 'login' });

  console.log('\n' + '='.repeat(60));
  console.log('  5. ColorfulConsoleTransport');
  console.log('='.repeat(60));
  await log.override('colorful').info('Mensaje de prueba info');
  await log.override('colorful').warn('Mensaje de prueba warn');
  await log
    .override('colorful')
    .info('Con metadata', { userId: 'u-1', action: 'login' });

  await syntropyLog.shutdown();
  console.log('\n' + '='.repeat(60));
  console.log('  Todos los transportes OK');
  console.log('='.repeat(60) + '\n');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
