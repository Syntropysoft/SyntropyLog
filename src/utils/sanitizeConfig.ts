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
 * Función de ayuda para detectar si un objeto es una instancia de una clase
 * que no debemos clonar (como un Transport o un Adapter).
 * @param value El valor a comprobar.
 */
function isSpecialInstance(
  value: any
): value is Transport | IHttpClientAdapter {
  if (value instanceof Transport) {
    return true;
  }
  // Si tiene un método 'request', asumimos que es un adaptador y no lo tocamos.
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as IHttpClientAdapter).request === 'function'
  ) {
    return true;
  }

  // =================================================================
  //  CORRECCIÓN: Si tiene un método 'publish', asumimos que es un
  //  adaptador de broker y tampoco lo tocamos.
  // =================================================================
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as IBrokerAdapter).publish === 'function'
  ) {
    return true;
  }
  
  return false;
}

/**
 * Recursively sanitizes a configuration object.
 * It masks values for keys that are known to be sensitive.
 * It intelligently skips special class instances to preserve their methods.
 * @param config The configuration object to sanitize.
 * @returns A new, sanitized configuration object.
 */
export function sanitizeConfig<T extends object>(config: T): T {
  // =================================================================
  //  CORRECCIÓN: Usamos nuestra nueva función de ayuda aquí.
  //  Si el objeto es una instancia especial, la devolvemos sin procesar.
  // =================================================================
  if (isSpecialInstance(config)) {
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
        typeof value === 'object' &&
        value !== null &&
        !(value instanceof RegExp)
      ) {
        // La llamada recursiva ahora respetará las instancias especiales.
        sanitized[key] = sanitizeConfig(value);
      } else {
        sanitized[key] = value;
      }
    }
  }

  return sanitized as T;
}
