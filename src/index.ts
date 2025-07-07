/**
 * FILE: src/index.ts
 * DESCRIPTION: The main entry point for the SyntropyLog framework.
 * It exports the singleton instance of the framework and key types for users.
 */

// Export the singleton instance of the framework, which is the primary interaction point.
export { syntropyLog } from './SyntropyLog';

// --- Core Types for Configuration and Usage ---
// We use a type alias during the transition from BeaconLog to SyntropyLog
export type { SyntropyLogConfig } from './config';
export type { ILogger } from './logger/ILogger';

// --- Transport Classes for Custom Configuration ---
export { Transport } from './logger/transports/Transport';
export { ConsoleTransport } from './logger/transports/ConsoleTransport';
export { SpyTransport } from './logger/transports/SpyTransport';
// We will export PrettyConsoleTransport once we create it in Step 2.

// --- Interfaces for Instrumented Clients ---
export type { IBeaconRedis } from './redis/IBeaconRedis';
// export type { InstrumentedHttpClient } from './http/types';
