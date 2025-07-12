/**
 * FILE: src/utils/sanitizeConfig.ts
 * DESCRIPTION: Utilities for sanitizing the SyntropyLog configuration object.
 */

import { Transport } from '../logger/transports/Transport';
import { IHttpClientAdapter } from '../http/adapters/adapter.types';
import { IBrokerAdapter } from '../brokers';

const MASK = '[CONFIG_MASKED]';

const SENSITIVE_KEYS = [
  'password',
  'token',
  'secret',
  'apikey',
  'credential',
  'pass',
  'key',
  'accesstoken',
  'refreshtoken',
  'clientsecret',
  'sentinelpassword',
  'sasl',
];

/**
 * @private
 * A helper function to detect if a value is a special class instance
 * (like a Transport or an Adapter) that should not be deeply cloned or sanitized.
 * This is crucial to preserve methods and internal state of user-provided instances.
 * @param {any} value - The value to check.
 * @returns {value is Transport | IHttpClientAdapter | IBrokerAdapter} True if the value is a special instance.
 */
function isSpecialInstance(
  value: unknown
): value is Transport | IHttpClientAdapter | IBrokerAdapter {
  if (value instanceof Transport) {
    return true;
  }
  // Duck-typing for adapters: if it has the core method, we treat it as an adapter.
  if (
    typeof value === 'object' &&
    value !== null &&
    (typeof (value as IHttpClientAdapter).request === 'function' ||
      typeof (value as IBrokerAdapter).publish === 'function')
  ) {
    return true;
  }

  return false;
}

/**
 * Recursively sanitizes a configuration object for safe logging.
 * It masks values for keys that are known to be sensitive and redacts credentials from URLs.
 * It intelligently skips special class instances (Transports, Adapters) to preserve their methods.
 * @param {T} config - The configuration object to sanitize.
 * @returns {T} A new, sanitized configuration object.
 */
export function sanitizeConfig<T extends object>(config: T): T {
  // If the object is a special instance (like a Transport or Adapter), return it without processing.
  if (isSpecialInstance(config)) {
    return config;
  }

  if (config === null || typeof config !== 'object') {
    return config;
  }

  if (Array.isArray(config)) {
    return config.map((item) => sanitizeConfig(item)) as T;
  }

  const sanitized: Record<string, unknown> = {};
  const sensitiveLower = SENSITIVE_KEYS.map((k) => k.toLowerCase());

  for (const key in config) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      const lowerKey = key.toLowerCase();
      const value = config[key];

      if (sensitiveLower.includes(lowerKey)) {
        sanitized[key] = MASK;
      } else if (
        (lowerKey.includes('url') || lowerKey.includes('uri')) &&
        typeof value === 'string'
      ) {
        // Redact user:pass from connection strings.
        sanitized[key] = value.replace(/(?<=:\/\/)[^:]+:[^@]+@/, `${MASK}@`);
      } else if (
        typeof value === 'object' &&
        value !== null &&
        !(value instanceof RegExp)
      ) {
        // The recursive call will also respect special instances.
        sanitized[key] = sanitizeConfig(value);
      } else {
        sanitized[key] = value;
      }
    }
  }

  return sanitized as T;
}
