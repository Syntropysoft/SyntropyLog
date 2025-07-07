/**
 * FILE: src/utils/sanitizeConfig.ts
 * DESCRIPTION: Utilities for sanitizing the SyntropyLog configuration object.
 * This security layer acts BEFORE the configuration is stored or used,
 * removing credentials and other sensitive data to prevent accidental exposure.
 */

import { Transport } from '../logger/transports/Transport';

const MASK = '[CONFIG_MASKED]';

const SENSITIVE_KEYS = [
  'password',
  'token',
  'secret',
  'apikey',
  'auth',
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
 * Recursively sanitizes a configuration object.
 * It masks values for keys that are known to be sensitive.
 * It intelligently skips instances of Transport to preserve their methods.
 * @param config The configuration object to sanitize.
 * @returns A new, sanitized configuration object.
 */
export function sanitizeConfig<T extends object>(config: T): T {
  // --- THE DEFINITIVE FIX IS HERE ---
  // If the object is an instance of Transport, return it immediately without processing.
  // This preserves the class instance and all its methods.
  if (config instanceof Transport) {
    return config;
  }

  if (config === null || typeof config !== 'object') {
    return config;
  }

  if (Array.isArray(config)) {
    return config.map((item) => sanitizeConfig(item)) as T;
  }

  const sanitized: Record<string, any> = {};
  const sensitiveLower = SENSITIVE_KEYS.map((k) => k.toLowerCase());

  for (const key in config) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      const lowerKey = key.toLowerCase();
      const value = config[key];

      if (sensitiveLower.includes(lowerKey)) {
        sanitized[key] = MASK;
      } else if (lowerKey === 'url' && typeof value === 'string') {
        sanitized[key] = value.replace(
          /(?<=:\/\/)([^:]+):([^@]+)@/,
          (match, user, pass) => `${user}:${MASK}@`
        );
      } else if (
        // Recurse only if it's a plain object, but NOT a RegExp.
        // The Transport check is now handled at the top of the function.
        typeof value === 'object' &&
        value !== null &&
        !(value instanceof RegExp)
      ) {
        sanitized[key] = sanitizeConfig(value);
      } else {
        sanitized[key] = value;
      }
    }
  }

  return sanitized as T;
}
