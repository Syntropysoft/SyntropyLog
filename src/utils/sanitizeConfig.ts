/**
 * FILE: src/utils/sanitizeConfig.ts
 * DESCRIPTION: Utilities for sanitizing the BeaconLog configuration object.
 * This security layer acts BEFORE the configuration is stored or used,
 * removing credentials and other sensitive data to prevent accidental exposure
 * in logs, even at maximum verbosity.
 */

const MASK = '[CONFIG_MASKED]';

// Lista de claves que siempre se consideran sensibles en cualquier nivel del objeto de configuración.
const SENSITIVE_KEYS = [
  'password', 'token', 'secret', 'apikey', 'auth', 'credential',
  'pass', 'key', 'accesstoken', 'refreshtoken', 'clientsecret',
  'sentinelpassword', 'sasl'
];

/**
 * Recursively sanitizes a configuration object.
 * It masks values for keys that are known to be sensitive or match custom rules.
 * @param config The configuration object to sanitize.
 * @param [customSensitiveKeys=[]] An additional list of sensitive key names.
 * @param [customSensitivePatterns=[]] An additional list of sensitive key patterns (string or RegExp).
 * @returns A new, sanitized configuration object.
 */
export function sanitizeConfig<T extends object>(
  config: T,
  customSensitiveKeys: string[] = [],
  customSensitivePatterns: (string | RegExp)[] = [] // Nuevo parámetro para patrones
): T {
  if (config === null || typeof config !== 'object') {
    return config;
  }

  if (Array.isArray(config)) {
    // Propagate patterns in recursion for arrays
    return config.map(item => sanitizeConfig(item, customSensitiveKeys, customSensitivePatterns)) as T;
  }

  const sanitized: Record<string, any> = {};
  const allSensitiveKeys = [...SENSITIVE_KEYS, ...customSensitiveKeys];
  const sensitiveLower = allSensitiveKeys.map((k) => k.toLowerCase());
  // Compile string patterns to RegExp, keeping those that are already RegExp.
  // Use the 'i' flag for case-insensitive pattern matching by default.
  const sensitivePatterns = customSensitivePatterns.map(p =>
    p instanceof RegExp ? p : new RegExp(p, 'i'));

  for (const key in config) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      const lowerKey = key.toLowerCase();
      const value = config[key];

      // Check if the key matches the list of names or any pattern
      const matchesPattern = sensitivePatterns.some(pattern => pattern.test(key));

      if (sensitiveLower.includes(lowerKey) || matchesPattern) {
        sanitized[key] = MASK;
      } else if (lowerKey === 'url' && typeof value === 'string') {
        // Special handling for URLs that may contain credentials
        sanitized[key] = value.replace(
          /(?<=:\/\/)([^:]+):([^@]+)@/,
          (match, user, pass) => `${user}:${MASK}@`
        );
      } else if (typeof value === 'object' && value !== null) {
        // Propagate patterns in recursion for nested objects
        sanitized[key] = sanitizeConfig(value, customSensitiveKeys, customSensitivePatterns);
      } else {
        sanitized[key] = value;
      }
    }
  }

  return sanitized as T;
}