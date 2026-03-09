/**
 * FILE: src/type-exports.ts
 * DESCRIPTION: Type exports for the SyntropyLog framework.
 * This file is processed by rollup-plugin-dts to generate type declarations.
 */

// --- Internal Types (for advanced usage and Slytherin magic) ---
export * from './internal-types';

// --- Core Types for Configuration and Usage ---
export type { SyntropyLogConfig } from './config';
export type { ILogger } from './logger/ILogger';
export type { IContextManager } from './context/IContextManager';
export type { LogEntry, JsonValue, LoggerOptions } from './types';
export type { LogLevel } from './logger/levels';

// --- Transport Interfaces ---
export type { LogFormatter } from './logger/transports/formatters/LogFormatter';

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
