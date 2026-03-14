/**
 * @file src/config.schema.ts
 * @description Defines and exports the configuration types for the entire library.
 * These are pure TypeScript interfaces — no runtime dependencies.
 * Runtime validation is done by `src/config/config.validator.ts`.
 */

import { Transport } from './logger/transports/Transport';
import { MaskingStrategy, MaskingRule } from './masking/MaskingEngine';

// ─── Sub-types ────────────────────────────────────────────────────────────────

export interface TransportDescriptor {
  transport: Transport;
  env?: string | string[];
}

export type TransportEntry = Transport | TransportDescriptor;

export interface LoggerOptions {
  name?: string;
  level?:
    | 'audit'
    | 'fatal'
    | 'error'
    | 'warn'
    | 'info'
    | 'debug'
    | 'trace'
    | 'silent';
  serviceName?: string;
  environment?: string;
  transportList?: Record<string, Transport>;
  env?: Record<string, string[]>;
  transports?: TransportEntry[] | Record<string, TransportEntry[]>;
  serializerTimeoutMs?: number;
  prettyPrint?: { enabled?: boolean };
}

export interface MaskingConfig {
  rules?: MaskingRule[];
  maskChar?: string;
  preserveLength?: boolean;
  enableDefaultRules?: boolean;
  regexTimeoutMs?: number;
  /** Called when masking fails (e.g. timeout, error). Never receives raw payload. */
  onMaskingError?: (error: unknown) => void;
}

export interface LoggingMatrixConfig {
  default?: string[];
  trace?: string[];
  debug?: string[];
  info?: string[];
  warn?: string[];
  error?: string[];
  fatal?: string[];
  [key: string]: string[] | undefined;
}

export interface ContextConfig {
  correlationIdHeader?: string;
  transactionIdHeader?: string;
  [key: string]: string | undefined;
}

// ─── Root config ──────────────────────────────────────────────────────────────

export interface SyntropyLogConfig {
  logger?: LoggerOptions;
  loggingMatrix?: LoggingMatrixConfig;
  masking?: MaskingConfig;
  context?: ContextConfig;
  shutdownTimeout?: number;
  /** Called when logging fails (serialization or transport). Optional; for observability. */
  onLogFailure?: (error: unknown, entry?: unknown) => void;
  /** Called when a transport fails (flush, shutdown, or log write). Optional; single handler from config. */
  onTransportError?: (error: unknown, context?: string) => void;
  /** Called when a pipeline step fails (e.g. hygiene). Optional; for observability. */
  onStepError?: (step: string, error: unknown) => void;
  /** Called when native addon fails and the framework falls back to the JS pipeline. Optional; for observability. */
  onSerializationFallback?: (reason?: unknown) => void;
}

// Re-export for convenience
export { MaskingStrategy, Transport };
