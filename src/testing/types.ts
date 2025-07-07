import { SpyTransport } from '../logger/transports/SpyTransport';

/**
 * The collection of tools returned by `beaconLog.setupTestHarness()`,
 * designed to facilitate testing of application logic that uses BeaconLog.
 */
export interface BeaconLogTestHarness {
  /**
   * A spy transport that captures all log entries in memory.
   * Use its methods (`getEntries`, `findEntries`, `clear`) to make
   * assertions about what has been logged.
   */
  spyTransport: SpyTransport;

  // Mocks for other clients (Redis, HTTP, etc.) will be added here in the future.
}