/**
 * @file src/serialization/utils/DataSanitizer.ts
 * @description Simple data sanitization utility for sensitive data redaction
 */

import { SerializableData, SanitizationConfig } from '../../types';
import { DEFAULT_VALUES } from '../../constants';
import {
  MASK_KEY_PWD,
  MASK_KEY_TOK,
  MASK_KEY_SEC,
  MASK_KEY_KEY,
  MASK_KEY_AUTH,
  MASK_KEY_AUTHORIZATION,
  MASK_KEY_API_KEY,
  MASK_KEY_APIKEY,
  MASK_KEY_PRIVATE_KEY,
  MASK_KEY_PRIVATEKEY,
  MASK_KEY_CREDENTIAL,
  MASK_KEY_CREDENTIAL_ID,
  MASK_KEY_CREDENTIALID,
  MASK_KEY_ACCESS_TOKEN,
  MASK_KEY_ACCESSTOKEN,
  MASK_KEY_REFRESH_TOKEN,
  MASK_KEY_REFRESHTOKEN,
  MASK_KEY_SESSION_ID,
  MASK_KEY_SESSIONID,
} from '../../sensitiveKeys';

export interface SanitizationContext {
  sensitiveFields?: string[];
  maxDepth?: number;
  currentDepth?: number;
}

export class DataSanitizer {
  private defaultSensitiveFields = [
    MASK_KEY_PWD,
    MASK_KEY_TOK,
    MASK_KEY_SEC,
    MASK_KEY_KEY,
    MASK_KEY_AUTH,
    MASK_KEY_AUTHORIZATION,
    MASK_KEY_API_KEY,
    MASK_KEY_APIKEY,
    MASK_KEY_PRIVATE_KEY,
    MASK_KEY_PRIVATEKEY,
    MASK_KEY_CREDENTIAL,
    MASK_KEY_CREDENTIAL_ID,
    MASK_KEY_CREDENTIALID,
    MASK_KEY_ACCESS_TOKEN,
    MASK_KEY_ACCESSTOKEN,
    MASK_KEY_REFRESH_TOKEN,
    MASK_KEY_REFRESHTOKEN,
    MASK_KEY_SESSION_ID,
    MASK_KEY_SESSIONID,
  ];

  private defaultMaxDepth = DEFAULT_VALUES.maxDepth;

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
      const ctx: SanitizationContext = {
        sensitiveFields,
        maxDepth,
        currentDepth: currentDepth + 1,
      };
      for (let i = 0; i < data.length; i++) {
        const s = this.sanitize(data[i], ctx);
        if (s !== data[i]) data[i] = s;
      }
      return data;
    }

    if (typeof data === 'object') {
      const obj = data as Record<string, SerializableData>;
      for (const key of Object.keys(obj)) {
        const lowerKey = key.toLowerCase();
        const isSensitive = sensitiveFields.some((field) =>
          lowerKey.includes(field.toLowerCase())
        );

        if (isSensitive) {
          obj[key] = '[REDACTED]';
        } else {
          const sanitizedValue = this.sanitize(obj[key], {
            sensitiveFields,
            maxDepth,
            currentDepth: currentDepth + 1,
          });
          if (sanitizedValue !== obj[key]) {
            obj[key] = sanitizedValue;
          }
        }
      }
      return data;
    }

    return data;
  }
}
