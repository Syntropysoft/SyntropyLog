/**
 * FILE: src/index.ts
 * DESCRIPTION: The main entry point for the SyntropyLog framework.
 * It exports the singleton instance of the framework and key types for users.
 */

export { syntropyLog } from './SyntropyLog';

// --- Core Types for Configuration and Usage ---
export type { SyntropyLogConfig } from './config';
export type { ILogger } from './logger/ILogger';
export type { IContextManager } from './context';

// --- Transport Classes and Interfaces for Custom Configuration ---
export { Transport } from './logger/transports/Transport';
export { ConsoleTransport } from './logger/transports/ConsoleTransport';
export { PrettyConsoleTransport } from './logger/transports/PrettyConsoleTransport';
export { CompactConsoleTransport } from './logger/transports/CompactConsoleTransport';
export { ClassicConsoleTransport } from './logger/transports/ClassicConsoleTransport'; // <-- ADDED
export { SpyTransport } from './logger/transports/SpyTransport';
export type { LogFormatter } from './logger/transports/formatters/LogFormatter';

// --- Interfaces for Instrumented Clients ---
export type { IBeaconRedis } from './redis/IBeaconRedis';
// export type { InstrumentedHttpClient } from './http/types';
