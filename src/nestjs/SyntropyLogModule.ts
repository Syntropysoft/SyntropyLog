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
// Singleton VALUE and core TYPES from the package entry (external at build time) → one
// shared runtime instance and the SAME nominal types, not a bundled second copy that
// deadlocks the singleton and clashes on types (TS2322). See KNOWN-ISSUES #1.
import type { ILogger, ISyntropyLog } from 'syntropylog';
import { syntropyLog as defaultSyntropyLog } from 'syntropylog';
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

/**
 * A lazily-resolved {@link ILogger}: the underlying logger is fetched from
 * SyntropyLog on **first use**, not at injection time, then memoized.
 *
 * This is what lets an `@InjectLogger()` consumer be constructed *before*
 * `syntropyLog.init()` has run — a common NestJS ordering (init inside a
 * lifecycle hook, or after `NestFactory.create()`) — without throwing
 * `Logger Factory not available` at bootstrap. Resolution is deferred to the
 * moment the consumer actually logs, by which point `init()` has completed.
 * `SyntropyNestLoggerService` was already lazy (it resolves per `emit()`); this
 * brings `@InjectLogger()` to the same, so the two exports behave consistently.
 */
function createLazyLogger(resolve: () => ILogger): ILogger {
  let real: ILogger | undefined;
  const target = (): ILogger => (real ??= resolve());
  return new Proxy(Object.create(null) as ILogger, {
    get(_t, prop): unknown {
      // Never resolve on a thenable probe (`await logger`) or a Symbol lookup
      // (inspection, `util.inspect.custom`): those must not eagerly build the
      // logger, or they'd re-introduce the pre-init throw we're avoiding.
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      const owner = target();
      const value = (owner as unknown as Record<string, unknown>)[prop];
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(owner)
        : value;
    },
  });
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
        // Resolve the underlying logger LAZILY (on first log call), so a consumer
        // can be constructed before init() ran without throwing at bootstrap.
        return createLazyLogger(() =>
          syntropyLog.getLogger(source).withSource(source)
        );
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
