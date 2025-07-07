import { beaconLog } from '../../../src';
import { v4 as uuidv4 } from 'uuid';

/**
 * Simulates a function elsewhere in your code (e.g., a service, a repository)
 * that needs to access the correlation ID.
 */
async function doSomethingImportant() {
  console.log('  -> Entering "doSomethingImportant" function...');
  const contextManager = beaconLog.getContextManager();

  // 2. RETRIEVE the ID from the context. It doesn't need to know where it came from.
  const currentId = contextManager.getCorrelationId();

  console.log(
    `     [doSomethingImportant] ID retrieved from context: ${currentId}`
  );
  console.log('     [doSomethingImportant] Performing asynchronous work...');
  await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate I/O
  console.log('  <- Exiting "doSomethingImportant".');
}

/**
 * Main function that simulates the entry point of an operation.
 * (e.g., a route controller in a web server).
 */
async function executeOperation() {
  console.log('--- OPERATION START ---');

  // Get the context manager from the library.
  const contextManager = beaconLog.getContextManager();

  // Get a logger instance. The name ('main-executeOperation') is a key to retrieve this specific
  // logger from anywhere in the application. If it doesn't exist, it's created.
  //
  // Note on log output: The 'serviceName' configured in init() takes precedence
  // as the logger's name in the output. The name provided here ('main-executeOperation') is
  // primarily for retrieval and acts as a fallback name if 'serviceName'
  // is not set.
  const loggerExample = beaconLog.getLogger('main-executeOperation');
  // 1. START a new context for this operation.
  // Everything executed within the 'run' callback will share this context.
  await contextManager.run(async () => {
    const startTime = performance.now(); // <-- 1. Record start time

    const newCorrelationId = uuidv4();

    // The property name must match the one that the `getCorrelationId()` method
    // expects. By default, it's 'x-correlation-id'.
    // If a 'correlationIdHeader' is configured in init(), that name is used.
    const correlationKey = contextManager.getCorrelationIdHeaderName();
    contextManager.set(correlationKey, newCorrelationId);

    console.log(
      '--------------------------------------------------------------------------------'
    );
    console.log(
      `>> [Main Operation] Context created. ID: ${newCorrelationId}  (via console.log)`
    );
    console.log(
      '--------------------------------------------------------------------------------'
    );
    loggerExample.info(
      `>> [Main Operation] Context created. ID: ${newCorrelationId}`,
      { note: 'via beaconlog logger.info' }
    );
    console.log(
      '--------------------------------------------------------------------------------'
    );
    await doSomethingImportant();

    const endTime = performance.now(); // <-- 2. Record end time
    const duration = endTime - startTime; // <-- 3. Calculate duration

    loggerExample.info('Operation within context finished.', {
      duration_ms: duration,
    });
    console.log(`--- CONTEXT END (Duration: ${duration.toFixed(2)}ms) ---`);
  });

  console.log('--- OPERATION END ---');

  // Outside the `run` block, the context no longer exists.
  const idOutsideContext = contextManager.getCorrelationId();

  console.log(
    '--------------------------------------------------------------------------------'
  );
  loggerExample.info(
    `Outside the context, the ID is: ${idOutsideContext}.`,
    { note: 'via beaconlog logger.info' }
  );
  console.log(
    '--------------------------------------------------------------------------------'
  );
}

// --- Configuration and Execution ---

// The library must be initialized once in your application.
beaconLog.init({
  context: {
    correlationIdHeader: 'x-trace-id', // Use a custom header name for the correlation ID
  },
  logger: { level: 'info', serviceName: 'example-2' }, // Configure logger settings
});

// Execute the example
executeOperation();
