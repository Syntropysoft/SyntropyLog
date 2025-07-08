import { syntropyLog, Transport } from 'syntropylog';
import { randomUUID } from 'crypto';
import * as rfs from 'rotating-file-stream';
import path from 'path';
import fs from 'fs';

// --- Advanced Use Case: Composition with a Specialized Library ---

// 1. The user decides they need log rotation and installs a dedicated library
//    like 'rotating-file-stream'.
//    (Run: npm install rotating-file-stream)

// Create the logs directory if it doesn't exist
const logDirectory = path.join(process.cwd(), 'logs');
fs.mkdirSync(logDirectory, { recursive: true });

// 2. Create a rotating write stream. This stream handles all the logic
//    for file size, rotation intervals, compression, etc.
const stream = rfs.createStream('app.log', {
  size: '1M', // Rotate when file size reaches 1MB
  interval: '1d', // Rotate daily
  compress: 'gzip', // Compress rotated files
  path: logDirectory,
});

// 3. Our custom transport becomes incredibly simple. It doesn't need to know
//    about files or rotation; it just needs to know how to write to a stream.
class WritableStreamTransport extends Transport {
  constructor(writeStream) {
    super();
    // THE FIX: Assign the stream to a class property.
    this.writeStream = writeStream;
  }

  async log(entry) {
    const logString = JSON.stringify(entry) + '\\n';
    this.writeStream.write(logString);
  }
}

async function processOrder() {
  const logger = syntropyLog.getLogger('order-service');
  logger.info(
    { product: 'SyntropyCloud', plan: 'enterprise' },
    'Processing order...'
  );
  await checkInventory();
}

async function checkInventory() {
  const logger = syntropyLog.getLogger('inventory-service');
  logger.info(
    { sku: 'SYN-CLOUD-ENT', region: 'us-east-1' },
    'Checking capacity.'
  );
}

async function main() {
  // 4. In the configuration, we compose our simple transport with the powerful stream.
  await syntropyLog.init({
    logger: {
      level: 'debug',
      serviceName: 'my-rotating-log-app',
      transports: [new WritableStreamTransport(stream)],
    },
    context: {
      correlationIdHeader: 'X-TRACE-ID',
    },
  });

  const contextManager = syntropyLog.getContextManager();
  const correlationId = randomUUID();

  console.log(`--- Running operation with WritableStreamTransport ---`);
  console.log(
    `--- Logs will be written and rotated in the 'logs' directory ---`
  );

  await contextManager.run(async () => {
    contextManager.set(
      contextManager.getCorrelationIdHeaderName(),
      correlationId
    );
    await processOrder();
  });

  console.log(
    `\n--- Operation finished. Check the 'logs' directory for output. ---`
  );

  // Shutdown is important to ensure the stream can close properly.
  await syntropyLog.shutdown();
}

main();
