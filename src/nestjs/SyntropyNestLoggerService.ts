/**
 * @file src/nestjs/SyntropyNestLoggerService.ts
 * @description Implementation of NestJS's `LoggerService` interface that
 * routes every call (`log`, `error`, `warn`, `debug`, `verbose`, `fatal`)
 * into a SyntropyLog instance. Install it via
 * `NestFactory.create(App, { logger: new SyntropyNestLoggerService(sl) })`
 * or through `SyntropyLogModule.forRoot({...})` and Nest will use it for
 * its own internal logs **and** for every `new Logger('Foo').log(...)` in
 * application code.
 *
 * The implementation mirrors the production pattern from
 * `echeq-sandbox-nestjs/src/common/syntropy-nest-logger.service.ts`, with
 * two improvements:
 *   1. Accepts an injected `ISyntropyLog` instance (instead of hardcoding
 *      the singleton). Multi-tenant or test apps can pass the instance
 *      they want.
 *   2. The default-context for the `nestContext` metadata is configurable.
 */

import {
  Inject,
  Injectable,
  Optional,
  type LoggerService,
  type LogLevel,
} from '@nestjs/common';
import type { ISyntropyLog } from '../ISyntropyLog';
import { syntropyLog as defaultSyntropyLog } from '../SyntropyLog';
import { SYNTROPYLOG_INSTANCE_TOKEN } from './tokens';

/** SyntropyLog method names that map 1:1 from Nest levels. */
const SL_METHODS = new Set([
  'info',
  'warn',
  'error',
  'debug',
  'trace',
  'fatal',
] as const);

type SLMethodName = 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'fatal';

/**
 * `JSON.stringify(new Error('x'))` returns `'{}'` because Error does not
 * expose `message` / `stack` as enumerable properties. We extract them
 * explicitly so the log line carries the actual error info — not `{"value":{}}`.
 */
function serializeForLog(value: unknown): unknown {
  if (value instanceof Error) {
    const cause = (value as Error & { cause?: unknown }).cause;
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(cause !== undefined && { cause: serializeForLog(cause) }),
    };
  }
  return value;
}

/**
 * Builds the final message string Nest will see. Nest passes the primary
 * message plus arbitrary `optionalParams`; some are context strings (short,
 * no newlines), others are extras (stack traces, structured data). We pack
 * the non-context extras into a JSON value alongside the primary message.
 */
function toMessageString(message: unknown, optionalParams: unknown[]): string {
  if (typeof message === 'string') return message;

  const serialized = serializeForLog(message);
  const extras = optionalParams
    .filter((p) => typeof p !== 'string' || !String(p).includes('\n'))
    .map((p) => serializeForLog(p));
  try {
    return JSON.stringify(
      extras.length ? { value: serialized, extra: extras } : serialized
    );
  } catch {
    return String(message);
  }
}

/**
 * Nest's `new Logger('PaymentService').log('msg')` passes `'PaymentService'`
 * as the last optional param. We pluck the first short string we see — that
 * matches Nest's convention and ignores stack traces (which contain newlines).
 */
function pickNestContext(optionalParams: unknown[]): string | undefined {
  for (const p of optionalParams) {
    if (typeof p === 'string' && !p.includes('\n')) return p;
  }
  return undefined;
}

/** Options accepted by the service constructor (and forwarded by the module). */
export interface SyntropyNestLoggerServiceOptions {
  /**
   * Default value for the `nestContext` metadata when Nest does not pass a
   * context string (rare; some internal logs lack it). Defaults to `'nest'`.
   */
  defaultContext?: string;
  /**
   * Name of the SyntropyLog logger used to emit Nest messages. Defaults to
   * `'nest'`. Useful when you route Nest's own logs to a different transport
   * than your application code.
   */
  loggerName?: string;
}

/**
 * NestJS `LoggerService` implementation that delegates to SyntropyLog.
 *
 * Once registered via `SyntropyLogModule.forRoot()` (or passed directly to
 * `NestFactory.create`), every `new Logger('Module').log('msg')` in your
 * codebase routes through SyntropyLog's masking/serialization/matrix
 * pipeline — including Nest's own startup banner.
 */
@Injectable()
export class SyntropyNestLoggerService implements LoggerService {
  private readonly defaultContext: string;
  private readonly loggerName: string;

  constructor(
    @Optional() @Inject(SYNTROPYLOG_INSTANCE_TOKEN) syntropyLog?: ISyntropyLog,
    options: SyntropyNestLoggerServiceOptions = {}
  ) {
    this.sl = syntropyLog ?? defaultSyntropyLog;
    this.defaultContext = options.defaultContext ?? 'nest';
    this.loggerName = options.loggerName ?? 'nest';
  }

  private readonly sl: ISyntropyLog;

  private emit(
    level: 'info' | 'warn' | 'error' | 'debug' | 'verbose' | 'fatal',
    message: unknown,
    optionalParams: unknown[]
  ): void {
    const log = this.sl.getLogger(this.loggerName);
    const nestContext = pickNestContext(optionalParams) ?? this.defaultContext;
    const msg = toMessageString(message, optionalParams);
    const meta = { type: 'app', nestContext };

    // Nest's `verbose` maps to SyntropyLog's `trace`. Any unknown level falls back to `info`.
    const slLevel: SLMethodName =
      level === 'verbose'
        ? 'trace'
        : SL_METHODS.has(level as SLMethodName)
          ? (level as SLMethodName)
          : 'info';

    const fn = (
      log as unknown as Record<SLMethodName, (m: object, s: string) => void>
    )[slLevel];

    if (typeof fn === 'function') {
      fn.call(log, meta, msg);
    } else {
      log.info(meta, msg);
    }
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('fatal', message, optionalParams);
  }

  /**
   * Nest sometimes calls `setLogLevels` to adjust verbosity at runtime. We
   * accept it but do not act on it — SyntropyLog levels are configured at
   * `init()` and (in some surfaces) via `logger.setLevel()`. Honoring Nest's
   * call here would override your declarative level config without the
   * config knowing.
   */
  setLogLevels(_levels: LogLevel[]): void {
    // intentional no-op
  }
}
