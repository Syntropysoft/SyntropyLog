import { syntropyLog } from '../src/SyntropyLog';
import { UniversalAdapter } from '../src/logger/adapters/UniversalAdapter';
import { AdapterTransport } from '../src/logger/transports/AdapterTransport';

async function run() {
  const captured: unknown[] = [];
  const executor = (data: unknown) => {
    captured.push(data);
  };
  const adapter = new UniversalAdapter({ executor });
  const transport = new AdapterTransport({ adapter, level: 'info' });

  await syntropyLog.init({
    logger: { level: 'info', transports: [transport] },
    masking: { enableDefaultRules: true, maskChar: '*' },
    loggingMatrix: { info: ['*'] },
  });

  const logger = syntropyLog.getLogger('debug-test');

  const sensitivePayload = {
    user: 'john_doe',
    password: 'mySuperSecretPassword123',
    credit_card: '4532-1111-2222-3333',
    safeField: 'Hello World',
  };

  await logger.info(sensitivePayload, 'User registration attempt');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circularObj: any = { name: 'I am circular' };
  circularObj.self = circularObj;
  await logger.info({ nastyPayload: circularObj }, 'Attempting circular log');

  console.log('CAPTURED LOGS:', JSON.stringify(captured, null, 2));
  await syntropyLog.shutdown();
}

run().catch(console.error);
