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
  /** When true, the native addon is not loaded (pure JS serialization). Use for debugging or when the addon is not built. */
  disableNativeAddon?: boolean;
}

export interface MaskingConfig {
  rules?: MaskingRule[];
  maskChar?: string;
  preserveLength?: boolean;
  enableDefaultRules?: boolean;
  regexTimeoutMs?: number;
  /**
   * Transports (by `Transport.name`) that receive the entry **unmasked**.
   *
   * For audit/forensic sinks, where masking destroys the evidentiary value: you cannot prove
   * who did what against `2*****9`. Everything else still applies — ANSI stripping, string
   * truncation, depth and size caps; only the obfuscation is dropped.
   *
   * This is a deliberate hole in the masking guarantee, so it is declared **here**, in the
   * application's own config, and never by a transport about itself — a dependency must not be
   * able to ship a transport that exempts itself. Unknown names fail loud at `init()`
   * (`UnknownExemptTransportError`): a typo must not silently mask an audit trail.
   *
   * @example
   * masking: { rules: [...], exemptTransports: ['audit-db'] }
   */
  exemptTransports?: string[];
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
  inbound?: Record<string, Record<string, string>>;
  outbound?: Record<string, Record<string, string>>;
  customHeaders?: string[];
}

// ─── Root config ──────────────────────────────────────────────────────────────

export interface SyntropyLogConfig {
  logger?: LoggerOptions;
  loggingMatrix?: LoggingMatrixConfig;
  masking?: MaskingConfig;
  context?: ContextConfig;
  shutdownTimeout?: number;
  /**
   * Optional registry of named retention policies. When set, `logger.withRetention('NAME')`
   * looks up the entry and binds it as the `retention` payload on every log.
   * `withRetention({ ... })` with an object literal remains supported and bypasses the registry.
   * Keys should be stable identifiers your transports can route on (e.g. 'SOX_AUDIT_TRAIL',
   * 'GDPR_ARTICLE_17', 'PCI_DSS_REQ_10').
   */
  retentionPolicies?: Readonly<Record<string, Record<string, unknown>>>;
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
