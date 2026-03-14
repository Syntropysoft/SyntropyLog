/**
 * FILE: src/type-exports.ts
 * DESCRIPTION: Entry for rollup-plugin-dts to generate dist/index.d.ts.
 * Must include every export from index.ts (values and types) so the published
 * declaration file is complete. When adding an export to index.ts, add it here too.
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
export { ColorfulConsoleTransport } from './logger/transports/ColorfulConsoleTransport';
export { SpyTransport } from './logger/transports/SpyTransport';
export { AdapterTransport } from './logger/transports/AdapterTransport';

// --- Universal Logging Adapters ---
export { UniversalAdapter } from './logger/adapters/UniversalAdapter';
export { UniversalLogFormatter } from './logger/formatters/UniversalLogFormatter';

// --- Utility Classes for Advanced Configuration ---
export { SerializationManager } from './serialization/SerializationManager';
export { MaskingEngine } from './masking/MaskingEngine';
export { SanitizationEngine } from './sanitization/SanitizationEngine';

// --- Default values (constants) ---
export { DEFAULT_VALUES } from './constants';
export type { DefaultValues } from './constants';

// --- Extensibility (contracts) ---
export type { ISerializer } from './serialization/types';
export { SerializationComplexity } from './serialization/types';
