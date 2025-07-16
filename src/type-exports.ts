/**
 * FILE: src/type-exports.ts
 * DESCRIPTION: Type exports for the SyntropyLog framework.
 * This file is processed by rollup-plugin-dts to generate type declarations.
 */

// --- Core Types for Configuration and Usage ---
export type { SyntropyLogConfig } from './config';
export type { ILogger } from './logger/ILogger';
export type { IContextManager } from './context/IContextManager';
export * from './brokers/adapter.types';
export type { LogEntry } from './types';
export * from './types';

// --- Transport Interfaces ---
export type { LogFormatter } from './logger/transports/formatters/LogFormatter';

// --- Interfaces for Instrumented Clients ---
export type { IBeaconRedis } from './redis/IBeaconRedis';

// --- Broker-related exports for creating custom adapters ---
export type {
  IBrokerAdapter,
  BrokerMessage,
  MessageHandler,
  MessageLifecycleControls,
} from './brokers/adapter.types';

// --- HTTP-related exports ---
export type {
  IHttpClientAdapter,
  AdapterHttpRequest,
  AdapterHttpResponse,
  InstrumentedHttpClient,
} from './http';

// --- Main Framework Exports ---
export { SyntropyLog, syntropyLog } from './SyntropyLog';

// --- Transport Classes ---
export { Transport } from './logger/transports/Transport';
export { ConsoleTransport } from './logger/transports/ConsoleTransport';
export { PrettyConsoleTransport } from './logger/transports/PrettyConsoleTransport';
export { CompactConsoleTransport } from './logger/transports/CompactConsoleTransport';
export { ClassicConsoleTransport } from './logger/transports/ClassicConsoleTransport';
export { SpyTransport } from './logger/transports/SpyTransport';

// --- Utility Classes ---
export { MaskingEngine } from './masking/MaskingEngine';
export { SanitizationEngine } from './sanitization/SanitizationEngine';
