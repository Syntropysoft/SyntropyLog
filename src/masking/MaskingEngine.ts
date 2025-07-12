/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * FILE: src/masking/MaskingEngine.ts
 * DESCRIPTION: Central engine for applying data masking rules to log objects.
 */

/**
 * @interface FieldMaskConfig
 * @description Configuration for masking a specific field.
 */
export interface FieldMaskConfig {
  /** The path to the field (e.g., "user.password") or a RegExp to match field names. */
  path: string | RegExp;
  /** The masking strategy: 'full' replaces the entire value, 'partial' shows only the last characters. */
  type: 'full' | 'partial';
  /** For 'partial' masking, the number of characters to show at the end. @default 4 */
  showLast?: number;
}

/**
 * @interface MaskingEngineOptions
 * @description Options for configuring the MaskingEngine.
 */
export interface MaskingEngineOptions {
  /** An array of field-specific masking configurations. */
  fields?: FieldMaskConfig[];
  /** The character(s) to use for masking. Defaults to '******'. */
  maskChar?: string;
  /** The maximum recursion depth for masking nested objects. Defaults to 10. */
  maxDepth?: number;
}

/**
 * @class MaskingEngine
 * A central engine responsible for applying masking rules to log metadata.
 * It processes objects after serialization to ensure no sensitive data is leaked.
 */
export class MaskingEngine {
  /** @private Store the rich field configuration directly. */
  private readonly fieldConfigs: FieldMaskConfig[];
  /** @private The character(s) to use for masking. */
  private readonly maskChar: string;
  /** @private The maximum recursion depth for masking nested objects. */
  private readonly maxDepth: number;
  /**
   * @private Regular expression to identify potential URLs for selective sanitization.
   */
  private readonly urlRegex = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;

  constructor(options?: MaskingEngineOptions) {
    this.fieldConfigs = options?.fields || [];
    this.maskChar = options?.maskChar || '******';
    this.maxDepth = options?.maxDepth || 10;
  }

  /**
   * Processes a metadata object and applies the configured masking rules.
   * @param {Record<string, any>} meta - The metadata object to process.
   * @returns {Record<string, any>} A new object with the masked data.
   */
  public process(meta: Record<string, unknown>): Record<string, unknown> {
    return this.maskRecursively(meta, 0);
  }

  /**
   * @private
   * Recursively masks sensitive information within an object or array.
   * @param {any} data - The data to process (can be an object, array, or primitive).
   * @param {number} depth - The current recursion depth.
   * @returns {any} The processed data with masking applied.
   */
  private maskRecursively(data: any, depth: number): any {
    if (depth >= this.maxDepth || data === null || typeof data !== 'object') {
      if (typeof data === 'string' && this.urlRegex.test(data)) {
        return this.sanitizeUrl(data);
      }
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.maskRecursively(item, depth + 1));
    }

    const sanitizedObject: Record<string, any> = {};

    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        // Find if any rule applies to the current key (case-sensitive for strings, RegExp test for RegExp)
        const applicableRule = this.fieldConfigs.find((config) =>
          typeof config.path === 'string'
            ? config.path === key
            : config.path.test(key)
        );

        // If a rule is found, mask the value accordingly.
        // Otherwise, recurse into the value to check for nested sensitive data.

        if (applicableRule) {
          // If a rule is found, mask the value accordingly
          sanitizedObject[key] = this.maskValue(data[key], applicableRule);
        } else {
          // If no rule applies, recurse into the value
          sanitizedObject[key] = this.maskRecursively(data[key], depth + 1);
        }
      }
    }

    return sanitizedObject;
  }

  /**
   * @private
   * Masks a single value based on a `FieldMaskConfig` rule.
   * This method applies either 'full' or 'partial' masking based on the rule.
   * @param {any} value - The value to be masked.
   * @param {FieldMaskConfig} config - The masking rule to apply.
   * @returns {string} The masked value as a string.
   */
  private maskValue(value: any, config: FieldMaskConfig): string {
    const stringValue = String(value);
    if (config.type === 'full') {
      return this.maskChar;
    }
    if (config.type === 'partial') {
      const showLast = config.showLast ?? 4;
      return this.maskChar + stringValue.slice(-showLast);
    }
    return stringValue;
  }

  /**
   * @private
   * Sanitizes a URL string by masking sensitive query parameters.
   * It parses the URL, iterates through its query parameters, and applies any
   * matching masking rules to the parameter values.
   * @param {string} urlString - The URL string to sanitize.
   * @returns {string} The sanitized URL with masked query parameters.
   */
  private sanitizeUrl(urlString: string): string {
    try {
      const url = new URL(urlString);
      url.searchParams.forEach((value, key) => {
        const applicableRule = this.fieldConfigs.find((config) =>
          typeof config.path === 'string'
            ? config.path === key
            : config.path.test(key)
        );
        if (applicableRule) {
          url.searchParams.set(key, this.maskValue(value, applicableRule));
        }
      });
      return url.toString();
    } catch (e) {
      return urlString;
    }
  }
}
