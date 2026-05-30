/**
 * @file src/middleware/index.ts
 * @description Public re-exports for the framework-agnostic correlation helpers
 * and the per-framework adapters (Express middleware, Fastify hook).
 */

export {
  resolveCorrelationId,
  traceIdFromTraceparent,
  DEFAULT_INCOMING_HEADERS,
  DEFAULT_RESPONSE_HEADERS,
} from './correlation';
export type {
  CorrelationResolveOptions,
  HeadersRecord,
  IncomingHeaderValue,
} from './correlation';

export { correlationIdMiddleware } from './express';
export type {
  ExpressCorrelationOptions,
  ExpressRequestLike,
  ExpressResponseLike,
  ExpressNextLike,
} from './express';

export { fastifyCorrelationHook } from './fastify';
export type {
  FastifyCorrelationOptions,
  FastifyRequestLike,
  FastifyReplyLike,
  FastifyDoneLike,
} from './fastify';
