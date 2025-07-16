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
