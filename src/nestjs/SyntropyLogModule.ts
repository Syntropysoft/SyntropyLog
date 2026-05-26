/**
 * @file src/nestjs/SyntropyLogModule.ts
 * @description The NestJS module that wires SyntropyLog into an app.
 *
 * Registers three things:
 *   1. The `ISyntropyLog` instance (singleton by default, override via options).
 *   2. {@link SyntropyNestLoggerService} as a Nest `LoggerService` so
 *      `new Logger('Foo').log(...)` calls route through SyntropyLog.
 *   3. A `TRANSIENT`-scope `ILogger` provider keyed on
 *      {@link SYNTROPYLOG_LOGGER_TOKEN}, used by `@InjectLogger()`. The
 *      provider uses `INQUIRER` so each consumer receives a logger pre-bound
 *      with its own class name as `source`.
 *
 * The module is marked `global` so the providers are visible everywhere
 * without re-importing in every feature module.
 *
 * ```typescript
 * @Module({
 *   imports: [SyntropyLogModule.forRoot()],
 *   controllers: [AppController],
 *   providers: [PaymentService],
 * })
 * export class AppModule {}
 * ```
 */

import {
  Module,
  Scope,
  type DynamicModule,
  type Provider,
} from '@nestjs/common';
import { INQUIRER } from '@nestjs/core';
import type { ILogger } from '../logger';
import type { ISyntropyLog } from '../ISyntropyLog';
import { syntropyLog as defaultSyntropyLog } from '../SyntropyLog';
import { SYNTROPYLOG_INSTANCE_TOKEN, SYNTROPYLOG_LOGGER_TOKEN } from './tokens';
import {
  SyntropyNestLoggerService,
  type SyntropyNestLoggerServiceOptions,
} from './SyntropyNestLoggerService';

/** Options accepted by {@link SyntropyLogModule.forRoot}. */
export interface SyntropyLogModuleOptions extends SyntropyNestLoggerServiceOptions {
  /**
   * The SyntropyLog instance to use for all NestJS-issued logs and for the
   * `@InjectLogger()` provider. Defaults to the global singleton.
   *
   * Pass an instance from {@link createSyntropyLog} for multi-tenant apps
   * or for isolated test setups.
   */
  syntropyLog?: ISyntropyLog;
}

/**
 * Reads the class name of the consumer requesting an `@InjectLogger()`
 * injection. Falls back to a deterministic default when the inquirer is
 * unavailable (rare — happens in some edge cases of dynamic resolution).
 */
function sourceFromInquirer(inquirer: unknown): string {
  if (
    inquirer &&
    typeof inquirer === 'object' &&
    'constructor' in inquirer &&
    typeof (inquirer as { constructor: { name?: unknown } }).constructor
      .name === 'string'
  ) {
    return (inquirer as { constructor: { name: string } }).constructor.name;
  }
  return 'unknown';
}

@Module({})
export class SyntropyLogModule {
  /**
   * Configures the module synchronously with a known SyntropyLog instance.
   *
   * @example
   * ```typescript
   * // Default — uses the global singleton:
   * SyntropyLogModule.forRoot()
   *
   * // Multi-tenant — uses a factory-produced instance:
   * SyntropyLogModule.forRoot({ syntropyLog: tenantLogging })
   *
   * // Custom Nest-internal log routing:
   * SyntropyLogModule.forRoot({ loggerName: 'nest-internal', defaultContext: 'platform' })
   * ```
   */
  static forRoot(options: SyntropyLogModuleOptions = {}): DynamicModule {
    const sl = options.syntropyLog ?? defaultSyntropyLog;

    const instanceProvider: Provider = {
      provide: SYNTROPYLOG_INSTANCE_TOKEN,
      useValue: sl,
    };

    const serviceProvider: Provider = {
      provide: SyntropyNestLoggerService,
      inject: [SYNTROPYLOG_INSTANCE_TOKEN],
      useFactory: (syntropyLog: ISyntropyLog) =>
        new SyntropyNestLoggerService(syntropyLog, {
          defaultContext: options.defaultContext,
          loggerName: options.loggerName,
        }),
    };

    const transientLoggerProvider: Provider = {
      provide: SYNTROPYLOG_LOGGER_TOKEN,
      scope: Scope.TRANSIENT,
      inject: [SYNTROPYLOG_INSTANCE_TOKEN, { token: INQUIRER, optional: true }],
      useFactory: (syntropyLog: ISyntropyLog, inquirer: unknown): ILogger => {
        const source = sourceFromInquirer(inquirer);
        return syntropyLog.getLogger(source).withSource(source);
      },
    };

    return {
      module: SyntropyLogModule,
      global: true,
      providers: [instanceProvider, serviceProvider, transientLoggerProvider],
      exports: [
        SYNTROPYLOG_INSTANCE_TOKEN,
        SYNTROPYLOG_LOGGER_TOKEN,
        SyntropyNestLoggerService,
      ],
    };
  }
}
