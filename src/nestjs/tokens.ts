/**
 * @file src/nestjs/tokens.ts
 * @description Injection tokens shared across the NestJS sub-package.
 *
 * Symbol-based tokens to avoid accidental string collisions and to make the
 * dependency surface explicit in IDE search.
 */

/** Injection token for the configured `ISyntropyLog` instance. */
export const SYNTROPYLOG_INSTANCE_TOKEN = Symbol.for('SyntropyLog.Instance');

/**
 * Injection token for a per-consumer `ILogger`. The provider is registered
 * as `Scope.TRANSIENT` and uses `INQUIRER` to derive the source name from
 * the class that requested the injection — see `@InjectLogger`.
 */
export const SYNTROPYLOG_LOGGER_TOKEN = Symbol.for('SyntropyLog.Logger');
