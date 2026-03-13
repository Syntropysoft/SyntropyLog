import { bench, group, run } from 'mitata';
import { SyntropyLog } from '../src/SyntropyLog';
import { SyntropyLogConfig } from '../src/config';
import { NullTransport } from './NullTransport';
import pino from 'pino';
import { Writable } from 'node:stream';

// Setup SyntropyLog
const nullTransport = new NullTransport();

// Re-init for benchmark
SyntropyLog.resetInstance();
const newInstance = SyntropyLog.getInstance();
await newInstance.init({
    logger: {
        level: 'info',
        transports: [nullTransport]
    }
} as SyntropyLogConfig);

const logger = newInstance.getLogger('benchmark');

// Setup Pino
const devNull = new Writable({
    write(_chunk, _encoding, callback) {
        callback();
    }
});
const pinoLogger = pino(devNull);

group('Core Processing Throughput (No I/O)', () => {
    bench('SyntropyLog', () => {
        logger.info('test message');
    });

    bench('Pino', () => {
        pinoLogger.info('test message');
    });
});

await run();
