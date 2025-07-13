import { syntropyLog } from 'syntropylog';

// Imagine you're building an e-commerce platform.
// You handle sensitive data like credit card numbers and API tokens.
// Leaking this data into logs is a big security no-no!

// 1. Configure the logger with masking rules.
// We define `masking.keys` with a list of property names that should be masked.
// SyntropyLog will find any key with these names, no matter how nested, and redact its value.
syntropyLog.init({
  logger: {
    serviceName: 'secure-payment-processor',
    level: 'info',
    serializerTimeoutMs: 100,
  },
  masking: {
    // A simple "[REDACTED]" string is used by default, but you can customize it.
    // mask: '***CENSORED***',
    keys: ['creditCardNumber', 'apiToken'],
  },
});

const logger = syntropyLog.getLogger('main');

logger.info('Processing a new payment...');

// 2. Log an object containing sensitive data.
// This could be a request body, a database record, or any other object.
const paymentDetails = {
  transactionId: 'txn_12345abc',
  amount: 49.99,
  currency: 'USD',
  customer: {
    id: 'cust_67890',
    name: 'John Doe',
  },
  paymentMethod: {
    type: 'credit_card',
    // This sensitive value should be masked!
    creditCardNumber: '4111-1111-1111-1111',
  },
  // This is another sensitive piece of data we want to hide.
  metadata: {
    source: 'web-checkout',
    apiToken: 'sk_live_abcdef123456',
    timestamp: new Date().toISOString(),
  },
};

logger.info('New payment received', {
  payload: paymentDetails,
});

logger.info('Payment processed successfully. Awaiting confirmation.');

// Notice in the console output how `creditCardNumber` and `apiToken`
// have their values replaced with "[REDACTED]". Magic! 