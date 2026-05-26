/**
 * @file src/nestjs/InjectLogger.ts
 * @description Parameter decorator that injects a SyntropyLog `ILogger`
 * pre-bound with the consumer's class name as its `source`.
 *
 * Usage:
 *
 * ```typescript
 * @Injectable()
 * export class PaymentService {
 *   constructor(@InjectLogger() private readonly log: ILogger) {}
 *
 *   charge() {
 *     this.log.info({ amount: 1500 }, 'Charging');
 *     // → entry includes `source: 'PaymentService'` automatically.
 *   }
 * }
 * ```
 *
 * The decorator is just an alias for `@Inject(SYNTROPYLOG_LOGGER_TOKEN)`.
 * The provider behind that token is registered with `Scope.TRANSIENT` and
 * uses NestJS's `INQUIRER` to read the *consumer's* class name at injection
 * time, then returns `syntropyLog.getLogger(...).withSource(className)`.
 *
 * If you need a logger bound to a *custom* source string instead of the
 * class name, inject the SyntropyLog instance directly and call
 * `getLogger().withSource(...)` yourself.
 */

import { Inject } from '@nestjs/common';
import { SYNTROPYLOG_LOGGER_TOKEN } from './tokens';

/**
 * Inject a SyntropyLog `ILogger` pre-bound with the consumer's class name
 * as its `source` field.
 */
export function InjectLogger(): ParameterDecorator {
  return Inject(SYNTROPYLOG_LOGGER_TOKEN);
}
