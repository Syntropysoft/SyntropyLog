/**
 * @file src/middleware/correlation.ts
 * @description Framework-agnostic helpers for resolving a correlation/trace ID
 * from incoming HTTP headers. Used by the Express middleware and Fastify hook;
 * also exposed directly for any custom integration that needs the same
 * resolution logic (Koa, Hono, custom servers, etc.).
 *
 * Resolution order:
 *   1. The first header in `incomingHeaders` that has a non-empty value wins.
 *   2. If `parseTraceparent` is on (default), the W3C `traceparent` header is
 *      parsed and its 32-hex `trace-id` field is used.
 *   3. Otherwise a generated ID is returned (`generateCorrelationId`, default
 *      `trc_${epoch}_${random}`).
 *
 * The resolver never throws, never reads more than the headers it's asked
 * about, and is allocation-light: it returns existing string references when
 * the value comes from a header.
 */

/** Default list of incoming headers checked for a correlation ID, in order. */
export const DEFAULT_INCOMING_HEADERS: readonly string[] = Object.freeze([
  'x-trace-id',
  'x-correlation-id',
  'x-request-id',
  'request-id',
]);

/** Default response headers the middleware echoes the resolved ID into. */
export const DEFAULT_RESPONSE_HEADERS: readonly string[] = Object.freeze([
  'X-Trace-Id',
  'X-Correlation-ID',
  'X-Request-ID',
]);

/**
 * Header value type a Node.js HTTP server typically presents. Aligns with
 * Express's and Fastify's `IncomingHttpHeaders` shape without importing
 * either framework's types.
 */
export type IncomingHeaderValue = string | string[] | undefined;

/** Minimal record shape both Express and Fastify request objects fulfill. */
export type HeadersRecord = Record<string, IncomingHeaderValue>;

/**
 * Configuration shared by the Express middleware and Fastify hook. Defaults
 * mirror what the framework's documented production patterns use.
 */
export interface CorrelationResolveOptions {
  /**
   * Headers checked for an incoming correlation ID, in order. First non-empty
   * wins. Defaults to {@link DEFAULT_INCOMING_HEADERS}.
   */
  incomingHeaders?: readonly string[];

  /**
   * Whether to honor the W3C `traceparent` header as a fallback after
   * `incomingHeaders`. Defaults to `true`.
   */
  parseTraceparent?: boolean;

  /**
   * Custom generator used when no incoming ID matches. Defaults to
   * `trc_${Date.now()}_${random9}` — opaque, sortable, easy to filter.
   */
  generateCorrelationId?: () => string;
}

/**
 * W3C Trace Context: `traceparent: {version}-{trace-id}-{parent-id}-{flags}`.
 * Returns the lowercased 32-hex `trace-id` field, or `null` if the header is
 * absent, malformed, or carries the all-zero trace-id (which the spec says
 * MUST be ignored).
 */
export function traceIdFromTraceparent(
  value: IncomingHeaderValue
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  // version-traceid-parentid-flags, hex only, exact lengths.
  const m = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/i.exec(
    raw.trim()
  );
  if (!m) return null;
  const traceId = m[1].toLowerCase();
  if (/^0{32}$/.test(traceId)) return null;
  return traceId;
}

/** Returns the first non-empty string value from a header record by name. */
function firstHeaderValue(
  headers: HeadersRecord,
  name: string
): string | undefined {
  const raw = headers[name];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === 'string') {
        const trimmed = v.trim();
        if (trimmed.length > 0) return trimmed;
      }
    }
  }
  return undefined;
}

/** Fallback ID generator used when no incoming header carries one. */
function defaultGenerateCorrelationId(): string {
  return `trc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Resolves a correlation ID from a headers record according to {@link CorrelationResolveOptions}.
 *
 * Pure function. Returns a string (never `undefined`) — falls back to a
 * generated ID when nothing else matches.
 *
 * @example
 * const id = resolveCorrelationId(req.headers);
 * // → uses x-trace-id / x-correlation-id / x-request-id / request-id / traceparent / generated
 */
export function resolveCorrelationId(
  headers: HeadersRecord,
  options?: CorrelationResolveOptions
): string {
  const incoming = options?.incomingHeaders ?? DEFAULT_INCOMING_HEADERS;

  for (const name of incoming) {
    const v = firstHeaderValue(headers, name);
    if (v) return v;
  }

  if (options?.parseTraceparent !== false) {
    const fromTraceparent = traceIdFromTraceparent(headers.traceparent);
    if (fromTraceparent) return fromTraceparent;
  }

  const generate =
    options?.generateCorrelationId ?? defaultGenerateCorrelationId;
  return generate();
}
