/**
 * @file src/context/extractInboundContext.ts
 * @description Pure helper for extracting inbound context fields from HTTP request headers.
 * Reads the configured inbound map for the given source and returns a plain object
 * of { conceptualFieldName: value } ready to be written into the context via set().
 *
 * Does NOT mutate the context — call contextManager.set(field, value) with the result.
 */

import type { ContextConfig } from '../types';

/** Resolves a single header value from a Node.js headers object.
 *  Node lowercases all incoming header names — normalize wireName before lookup.
 *  Returns the first element when the value is an array (multi-value headers). */
const resolveHeaderValue = (
  headers: Record<string, string | string[] | undefined>,
  wireName: string
): string | undefined => {
  const raw = headers[wireName.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
};

/**
 * Extracts context fields from inbound HTTP headers using the configured source map.
 *
 * Node.js lowercases all incoming headers — this function normalizes wire names
 * to lowercase before looking them up, so developers can declare canonical casing
 * ('X-Correlation-ID') in config without worrying about case mismatches.
 *
 * @param headers  The incoming headers object (e.g. req.headers). Keys must be lowercase (Node default).
 * @param source   The source name to look up in context.inbound (e.g. 'frontend', 'partner').
 * @param config   The ContextConfig from syntropyLog init (pass syntropyLog.config.context).
 * @returns        A plain { field: value } object. Empty object if source is not configured or no headers matched.
 *
 * @example
 * app.use(async (req, res, next) => {
 *   await contextManager.run(async () => {
 *     const fields = extractInboundContext(req.headers, SOURCE_FRONTEND, config.context);
 *     for (const [field, value] of Object.entries(fields)) {
 *       contextManager.set(field, value);
 *     }
 *     next();
 *   });
 * });
 */
export function extractInboundContext(
  headers: Record<string, string | string[] | undefined>,
  source: string,
  config: ContextConfig
): Record<string, string> {
  const result: Record<string, string> = {};

  const inboundMap = config.inbound?.[source];
  if (!inboundMap && !config.customHeaders?.length) return result;

  if (inboundMap) {
    for (const [field, wireName] of Object.entries(inboundMap)) {
      const value = resolveHeaderValue(headers, wireName);
      if (value !== undefined) result[field] = value;
    }
  }

  // Passthrough custom headers — stored with lowercased key (hyphens → underscores)
  if (config.customHeaders) {
    for (const headerName of config.customHeaders) {
      const value = resolveHeaderValue(headers, headerName);
      if (value !== undefined)
        result[headerName.toLowerCase().replace(/-/g, '_')] = value;
    }
  }

  return result;
}
