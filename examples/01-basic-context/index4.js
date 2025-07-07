import { syntropyLog, Transport } from 'syntropylog';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

// --- Creating a Custom Transport ---
// It's this simple! Just extend the base 'Transport' class
// and implement the 'log' method.

class CustomFileTransport extends Transport {
  constructor() {
    super();
    // Ensure the log file is empty on start for this simple example
    try {
      fs.unlinkSync(path.join(process.cwd(), 'app.log'));
    } catch (e) {
      // Ignore error if file doesn't exist
    }
  }

  async log(entry) {
    const logString = JSON.stringify(entry) + '\n';
    // For a real-world scenario, you'd want more robust error handling
    // and possibly a write stream.
    fs.appendFile('app.log', logString, (err) => {
      if (err) {
        console.error('Failed to write to log file', err);
      }
    });
  }
}

async function processOrder() {
  const logger = syntropyLog.getLogger('order-service');
  logger.info({ product: 'SyntropyBook', quantity: 1 }, 'Processing order...');
  await checkInventory();
}

async function checkInventory() {
  const logger = syntropyLog.getLogger('inventory-service');
  logger.info(
    { sku: 'SYN-001', stock: 42 },
    'Checking inventory for the order.'
  );
}

async function main() {
  await syntropyLog.init({
    logger: {
      level: 'debug',
      serviceName: 'my-custom-transport-app',
      // We use our new custom transport!
      transports: [new CustomFileTransport()],
    },
    context: {
      correlationIdHeader: 'X-Correlation-ID',
    },
  });

  const contextManager = syntropyLog.getContextManager();
  const correlationId = randomUUID();

  console.log(`--- Running operation with CustomFileTransport ---`);
  console.log(`--- Logs will be written to app.log ---`);

  await contextManager.run(async () => {
    contextManager.set(
      contextManager.getCorrelationIdHeaderName(),
      correlationId
    );
    await processOrder();
  });

  console.log(`\n--- Operation finished. Check app.log for output. ---`);

  // Shutdown is important to ensure all async operations like file writes can complete.
  await syntropyLog.shutdown();
}

main();
