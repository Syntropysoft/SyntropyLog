/**
 * @file src/serialization/utils/DataSanitizer.ts
 * @description Simple data sanitization utility for sensitive data redaction
 */

import { SerializableData, SanitizationConfig } from '../../types';

export interface SanitizationContext {
  sensitiveFields?: string[];
  maxDepth?: number;
  currentDepth?: number;
}

export class DataSanitizer {
  private defaultSensitiveFields = [
    'password',
    'token',
    'secret',
    'key',
    'auth',
    'authorization',
    'api_key',
    'apikey',
    'private_key',
    'privatekey',
    'credential',
    'credential_id',
    'credentialid',
    'access_token',
    'accesstoken',
    'refresh_token',
    'refreshtoken',
    'session_id',
    'sessionid',
  ];

  private defaultMaxDepth = 10;

  sanitize(
    data: SerializableData,
    context: SanitizationConfig | SanitizationContext = {}
  ): SerializableData {
    const sensitiveFields =
      context.sensitiveFields || this.defaultSensitiveFields;
    const maxDepth =
      (context as SanitizationContext).maxDepth || this.defaultMaxDepth;
    const currentDepth = (context as SanitizationContext).currentDepth || 0;

    if (currentDepth >= maxDepth) {
      return '[MAX_DEPTH_REACHED]';
    }

    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      return data;
    }

    if (typeof data === 'number' || typeof data === 'boolean') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((_item, _index) =>
        this.sanitize(_item, {
          ...context,
          currentDepth: currentDepth + 1,
        })
      );
    }

    if (typeof data === 'object') {
      const sanitized: Record<string, SerializableData> = {};

      for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        const isSensitive = sensitiveFields.some((field) =>
          lowerKey.includes(field.toLowerCase())
        );

        if (isSensitive) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitize(value, {
            ...context,
            currentDepth: currentDepth + 1,
          });
        }
      }

      return sanitized;
    }

    return data;
  }
}
