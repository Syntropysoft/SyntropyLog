/**
 * @file src/middleware/fastify.ts
 * @description Production-grade Fastify `onRequest` hook with the same
 * resolution semantics as the Express middleware. Same defaults, same option
 * surface, same SyntropyLog instance handling.
 *
 * Fastify and Express have different async models, so the hook can't reuse
 * the Express function verbatim — but both wrap the request lifecycle in a
 * `contextManager.run()` scope and keep the scope alive until the response
 * is finished or closed.
 *
 * Why `onRequest` (not `preHandler` or `preValidation`):
 *   - It runs first, so even `preValidation`/`preHandler` hooks observe the
 *     correlation context.
 *   - It has access to `reply.raw` so we can hook into the underlying Node
 *     response's `finish`/`close` events to keep the ALS scope open for the
 *     entire request lifetime.
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
 * Minimal shape of a Fastify request used by the hook. Compatible with
 * `FastifyRequest` from any Fastify version without depending on the package.
 */
export interface FastifyRequestLike {
  headers: HeadersRecord;
}

/**
 * Minimal shape of a Fastify reply used by the hook. Compatible with
 * `FastifyReply`.
 */
export interface FastifyReplyLike {
  /** Fastify's high-level header setter. */
  header(name: string, value: string): unknown;
  /** Underlying Node response — used to listen for finish/close. */
  raw: {
    once(event: string, listener: () => void): unknown;
  };
}

/** Fastify's `done` continuation callback for sync-style hooks. */
export type FastifyDoneLike = (err?: Error) => void;

/**
 * Configuration for the Fastify correlation hook. Same option surface as the
 * Express middleware, since the underlying resolver is shared.
 */
export interface FastifyCorrelationOptions extends CorrelationResolveOptions {
  /**
   * SyntropyLog instance whose `ContextManager` will scope each request.
   * Defaults to the global singleton.
   */
  syntropyLog?: ISyntropyLog;

  /**
   * Response headers to echo the resolved correlation ID into. Pass `[]` to
   * skip echoing. Defaults to {@link DEFAULT_RESPONSE_HEADERS}.
   */
  responseHeaders?: readonly string[];
}

/**
 * Builds a Fastify `onRequest` hook that opens a SyntropyLog context for the
 * request, resolves the correlation ID, echoes it onto the response headers,
 * and holds the AsyncLocalStorage scope open until the response is closed.
 *
 * ```typescript
 * import Fastify from 'fastify';
 * import { fastifyCorrelationHook } from 'syntropylog';
 *
 * const app = Fastify();
 * app.addHook('onRequest', fastifyCorrelationHook());
 *
 * // Or with custom options:
 * app.addHook('onRequest', fastifyCorrelationHook({
 *   syntropyLog: tenantLogging,
 *   incomingHeaders: ['x-acme-trace-id'],
 *   responseHeaders: [],          // no echoing
 *   parseTraceparent: true,
 * }));
 * ```
 *
 * The hook uses the `done`-callback form intentionally — calling `done()`
 * synchronously inside the context scope schedules Fastify's next step while
 * the scope is still active, so every subsequent hook, validator, and
 * handler observes the same correlation context. The scope remains open
 * until `reply.raw` emits `finish` or `close`.
 */
export function fastifyCorrelationHook(
  options: FastifyCorrelationOptions = {}
): (
  request: FastifyRequestLike,
  reply: FastifyReplyLike,
  done: FastifyDoneLike
) => void {
  const sl = options.syntropyLog ?? defaultSyntropyLog;
  const responseHeaders = options.responseHeaders ?? DEFAULT_RESPONSE_HEADERS;

  return function fastifyCorrelationHookImpl(request, reply, done) {
    let contextManager;
    try {
      contextManager = sl.getContextManager();
    } catch (err) {
      done(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const cm = contextManager;
    void cm
      .run(async () => {
        const correlationId = resolveCorrelationId(request.headers, options);

        cm.setCorrelationId(correlationId);
        cm.set(cm.getCorrelationIdHeaderName(), correlationId);

        for (const header of responseHeaders) {
          reply.header(header, correlationId);
        }

        await new Promise<void>((resolve) => {
          reply.raw.once('finish', resolve);
          reply.raw.once('close', resolve);
          done();
        });
      })
      .catch((err: unknown) => {
        done(err instanceof Error ? err : new Error(String(err)));
      });
  };
}
