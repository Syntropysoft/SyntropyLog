/**
 * FILE: src/index.ts
 * DESCRIPTION: The main entry point for the SyntropyLog framework.
 * It exports the singleton instance of the framework and key types for users.
 */

export { syntropyLog, SyntropyLog } from './SyntropyLog';
export { MaskingEngine } from './masking/MaskingEngine';

// --- Core Types for Configuration and Usage ---
export type { SyntropyLogConfig } from './config';
export type { ILogger } from './logger/ILogger';
export type { IContextManager } from './context';
export type { LogEntry } from './types';

// --- Transport Classes and Interfaces for Custom Configuration ---
export { Transport } from './logger/transports/Transport';
export { ConsoleTransport } from './logger/transports/ConsoleTransport';
export { PrettyConsoleTransport } from './logger/transports/PrettyConsoleTransport';
export { CompactConsoleTransport } from './logger/transports/CompactConsoleTransport';
export { ClassicConsoleTransport } from './logger/transports/ClassicConsoleTransport'; // <-- ADDED
export { SpyTransport } from './logger/transports/SpyTransport';
export type { LogFormatter } from './logger/transports/formatters/LogFormatter';

// --- Utility Classes for Advanced Configuration ---
export { SanitizationEngine } from './sanitization/SanitizationEngine';

// --- Interfaces for Instrumented Clients ---
export type { IBeaconRedis } from './redis/IBeaconRedis';

// --- Broker-related exports for creating custom adapters ---
export type {
  IBrokerAdapter,
  BrokerMessage,
  MessageHandler,
  MessageLifecycleControls,
} from './brokers/adapter.types';
// export type { InstrumentedHttpClient } from './http/types';
