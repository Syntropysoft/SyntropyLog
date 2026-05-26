/**
 * @file src/middleware/express.ts
 * @description Production-grade Express correlation middleware shipped as part
 * of the framework, replacing the boilerplate every team has been copy-pasting
 * from `docs/context.md`.
 *
 * What it does, in one request lifecycle:
 *
 *   1. Resolves a correlation ID from incoming headers (multi-source +
 *      optional W3C `traceparent` fallback + generated fallback). See
 *      {@link resolveCorrelationId}.
 *   2. Opens a new SyntropyLog context scope via `contextManager.run()`,
 *      sets the resolved ID as the correlation ID inside it.
 *   3. Echoes the ID onto the response headers so downstream / clients see it.
 *   4. Calls Express `next()` inside the scope, then awaits `res.finish` /
 *      `res.close` to keep the AsyncLocalStorage scope alive until the
 *      response is done.
 *
 * Designed to be safe with the global singleton (default) or with an instance
 * produced by {@link createSyntropyLog} (Phase 2A). Pass `syntropyLog` in the
 * options to target a non-default instance.
 */

import { syntropyLog as defaultSyntropyLog } from '../SyntropyLog';
import type { ISyntropyLog } from '../ISyntropyLog';
import {
  resolveCorrelationId,
  DEFAULT_RESPONSE_HEADERS,
  type CorrelationResolveOptions,
  type HeadersRecord,
} from './correlation';

/**
 * Minimal shape of an Express request the middleware reads from. Compatible
 * with `express.Request` without taking an `@types/express` dependency.
 */
export interface ExpressRequestLike {
  headers: HeadersRecord;
}

/**
 * Minimal shape of an Express response the middleware writes to / observes.
 * Compatible with `express.Response`.
 */
export interface ExpressResponseLike {
  setHeader(name: string, value: string): unknown;
  once(event: string, listener: () => void): unknown;
}

/** Express's `next` callback. */
export type ExpressNextLike = (err?: unknown) => void;

/**
 * Configuration for the Express correlation middleware.
 * Combines the resolver options with Express-specific settings.
 */
export interface ExpressCorrelationOptions extends CorrelationResolveOptions {
  /**
   * SyntropyLog instance whose `ContextManager` will scope each request.
   * Defaults to the global `syntropyLog` singleton. Pass an instance returned
   * by {@link createSyntropyLog} for multi-tenant setups.
   */
  syntropyLog?: ISyntropyLog;

  /**
   * Response headers to echo the resolved correlation ID into. Pass an empty
   * array to skip echoing entirely. Defaults to {@link DEFAULT_RESPONSE_HEADERS}
   * (`X-Trace-Id`, `X-Correlation-ID`, `X-Request-ID`).
   */
  responseHeaders?: readonly string[];
}

/**
 * Builds an Express middleware that opens a SyntropyLog context for each
 * request, resolves the correlation ID, and keeps the scope alive until the
 * response is closed.
 *
 * ```typescript
 * import express from 'express';
 * import { correlationIdMiddleware } from 'syntropylog';
 *
 * const app = express();
 * app.use(correlationIdMiddleware());        // singleton + sensible defaults
 *
 * // Or with a factory instance and custom headers:
 * app.use(correlationIdMiddleware({
 *   syntropyLog: tenantLogging,
 *   incomingHeaders: ['x-acme-trace-id', 'x-correlation-id'],
 *   responseHeaders: ['X-Acme-Trace-Id'],
 *   parseTraceparent: true,
 * }));
 * ```
 *
 * Mount this **before** the routes / handlers that should observe the
 * context — typically right after JSON parsing and CORS.
 */
export function correlationIdMiddleware(
  options: ExpressCorrelationOptions = {}
): (
  req: ExpressRequestLike,
  res: ExpressResponseLike,
  next: ExpressNextLike
) => Promise<void> {
  const sl = options.syntropyLog ?? defaultSyntropyLog;
  const responseHeaders = options.responseHeaders ?? DEFAULT_RESPONSE_HEADERS;

  return async function correlationIdMiddlewareImpl(req, res, next) {
    try {
      const contextManager = sl.getContextManager();
      await contextManager.run(async () => {
        const correlationId = resolveCorrelationId(req.headers, options);

        contextManager.setCorrelationId(correlationId);
        contextManager.set(
          contextManager.getCorrelationIdHeaderName(),
          correlationId
        );

        for (const header of responseHeaders) {
          res.setHeader(header, correlationId);
        }

        await new Promise<void>((resolve) => {
          res.once('finish', resolve);
          res.once('close', resolve);
          next();
        });
      });
    } catch (err) {
      next(err);
    }
  };
}
