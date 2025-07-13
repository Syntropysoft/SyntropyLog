import { syntropyLog } from 'syntropylog';

// 1. Initialize the logger using the singleton instance.
syntropyLog.init({
  logger: {
    serviceName: 'my-ts-app',
    level: 'info',
    // This field is required by the library's configuration schema
    // to prevent accidental performance issues with slow serializers.
    serializerTimeoutMs: 100,
  },
});

// 2. Get a logger instance.
const logger = syntropyLog.getLogger('main');

logger.info('Logger initialized in TypeScript project.');

// 3. Log a message with a structured payload.
logger.info('This is a typed log message!', {
  userId: 42,
  status: 'active',
});
