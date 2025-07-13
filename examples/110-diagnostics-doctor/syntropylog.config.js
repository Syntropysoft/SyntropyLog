/**
 * @file syntropylog.config.js
 * @description
 * This is a configuration file for SyntropyLog designed to demonstrate the "doctor" tool.
 * It contains several common configuration issues that the doctor's built-in rules
 * are designed to catch.
 *
 * Run `npm run check` in this directory to see the doctor's report.
 */

// We don't need any real transport instances for this example,
// so we use a simple mock object.
const mockTransport = { log: () => {}, flush: () => {} };

module.exports = {
  // We explicitly set the version to ensure the configuration format is recognized.
  version: 1,

  logger: {
    // Problem 1: Verbose log level in a simulated "production" environment.
    // The doctor should warn about this if NODE_ENV is set to 'production'.
    level: 'debug',

    // Problem 2: An empty transports array.
    // This is a critical error because it means no logs will be emitted.
    transports: [],
  },

  // Problem 3: No data masking rules.
  // The doctor should warn that no fields are configured for redaction,
  // which is a potential security risk.
  masking: {
    fields: [],
  },

  redis: {
    instances: [
      // Problem 4: A Redis Sentinel instance without a master 'name'.
      // This is a configuration error that prevents the client from connecting.
      {
        instanceName: 'my-sentinel-broker',
        mode: 'sentinel',
        // The 'name' property is missing!
      },
      // Problem 5: Duplicate instance names.
      // This can lead to ambiguity and misconfiguration.
      {
        instanceName: 'cache-main',
        mode: 'single',
        url: 'redis://localhost:6379',
      },
      {
        instanceName: 'cache-main', // Duplicate!
        mode: 'single',
        url: 'redis://localhost:6380',
      },
    ],
  },
}; 