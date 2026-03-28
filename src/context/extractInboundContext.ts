/**
 * @file src/context/extractInboundContext.ts
 * @description Pure helper for extracting inbound context fields from HTTP request headers.
 * Reads the configured inbound map for the given source and returns a plain object
 * of { conceptualFieldName: value } ready to be written into the context via set().
 *
 * Does NOT mutate the context — call contextManager.set(field, value) with the result.
 */

import { randomUUID } from 'crypto';
import type { ContextConfig } from '../types';

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
 * @returns        A plain { field: value } object. Empty object if source is not configured.
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
  const inboundMap = config.inbound?.[source];
  if (!inboundMap) return {};

  const correlationField = config.correlationField ?? 'correlationId';
  const result: Record<string, string> = {};

  for (const [field, wireName] of Object.entries(inboundMap)) {
    // Node.js lowercases all incoming headers — normalize before lookup
    const rawValue = headers[wireName.toLowerCase()];
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;

    if (value !== undefined) {
      result[field] = value;
    } else if (field === correlationField) {
      // Auto-generate correlation ID when absent — the only field with this behaviour
      result[field] = randomUUID();
    }
  }

  // Passthrough custom headers — stored with lowercased key (hyphens → underscores)
  if (config.customHeaders) {
    for (const headerName of config.customHeaders) {
      const rawValue = headers[headerName.toLowerCase()];
      const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
      if (value !== undefined) {
        const key = headerName.toLowerCase().replace(/-/g, '_');
        result[key] = value;
      }
    }
  }

  return result;
}
