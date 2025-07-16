/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @file src/http/utils/redact.ts
 * @description Provides utility functions for redacting sensitive information
 * from objects and headers, crucial for secure logging.
 */

/** @private The placeholder string used to replace redacted values. */
const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * Deeply clones and redacts sensitive fields from an object or array.
 * This function is designed to be safe and avoid modifying the original object.
 * @param {any} data - The object or array to redact.
 * @param {string[]} [sensitiveFields=[]] - An array of keys (strings) to be redacted, matched case-insensitively.
 * @param {number} [maxDepth=10] - The maximum recursion depth to prevent infinite loops.
 * @returns A new object or array with sensitive fields redacted.
 */
export function redactObject(
  data: any,
  sensitiveFields: string[] = [],
  maxDepth = 10
): any {
  const sensitiveSet = new Set(sensitiveFields.map((f) => f.toLowerCase()));

  const redactRecursive = (currentData: any, depth: number): any => {
    if (depth >= maxDepth) {
      return '[REDACTED_DUE_TO_DEPTH]';
    }

    if (Array.isArray(currentData)) {
      return currentData.map((item) => redactRecursive(item, depth + 1));
    }

    if (
      currentData &&
      typeof currentData === 'object' &&
      !Buffer.isBuffer(currentData)
    ) {
      const clonedObj: { [key: string]: any } = {};
      for (const key in currentData) {
        if (Object.prototype.hasOwnProperty.call(currentData, key)) {
          if (sensitiveSet.has(key.toLowerCase())) {
            clonedObj[key] = REDACTED_PLACEHOLDER;
          } else {
            clonedObj[key] = redactRecursive(currentData[key], depth + 1);
          }
        }
      }
      return clonedObj;
    }

    return currentData;
  };

  return redactRecursive(data, 0);
}

/**
 * Redacts sensitive headers from a headers object.
 * Header names are treated case-insensitively.
 * @param {Record<string, any>} headers - The headers object (e.g., from an HTTP request).
 * @param {string[]} [sensitiveHeaders=[]] - An array of header names to redact.
 * @returns A new headers object with sensitive values redacted.
 */
export function redactHeaders(
  headers: Record<string, any> | null | undefined,
  sensitiveHeaders: string[] = []
): Record<string, any> | null | undefined {
  if (!headers || !sensitiveHeaders || sensitiveHeaders.length === 0) {
    return headers;
  }

  const clonedHeaders: Record<string, any> = {};
  const sensitiveSet = new Set(sensitiveHeaders.map((h) => h.toLowerCase()));

  for (const key in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, key)) {
      clonedHeaders[key] = sensitiveSet.has(key.toLowerCase())
        ? REDACTED_PLACEHOLDER
        : headers[key];
    }
  }

  return clonedHeaders;
}
