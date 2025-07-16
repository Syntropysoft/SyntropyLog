/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * FILE: src/masking/MaskingEngine.ts
 * DESCRIPTION: Central engine for applying robust, secure data masking to log objects.
 */

// Using type assertion for regex-test module since it lacks proper TypeScript declarations
import RegexTest from 'regex-test';

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
  /** Un array de nombres de campos sensibles. */
  fields?: (string | RegExp)[];
  /** El carácter de máscara. */
  maskChar?: string;
  /** Profundidad máxima de búsqueda. Default: 3 */
  maxDepth?: number;
  /** El estilo de enmascaramiento ('fixed' o 'preserve-length'). */
  style?: 'fixed' | 'preserve-length';
}

/**
 * @class MaskingEngine
 * A central engine responsible for applying masking rules to log metadata.
 * It recursively scans objects and masks data based on key names, and can also
 * sanitize sensitive values from URL paths. Its design is "secure-by-default,"
 * allowing for runtime configuration updates that can only add (not remove) masking rules.
 */
export class MaskingEngine {
  /** @private A dynamic array of sensitive field names or RegExps. */
  private fieldConfigs: (string | RegExp)[];
  /** @private The character(s) to use for masking. */
  private readonly maskChar: string;
  /** @private The maximum recursion depth for masking nested objects. */
  private readonly maxDepth: number;
  /** @private The masking style to apply. */
  private readonly style: 'fixed' | 'preserve-length';
  /** @private Secure regex tester with timeout. */
  private readonly regexTest: any;

  constructor(options?: MaskingEngineOptions) {
    this.fieldConfigs = options?.fields || [];
    this.maskChar = options?.maskChar || '******';
    this.maxDepth = options?.maxDepth ?? 3;
    this.style = options?.style ?? 'fixed';
    this.regexTest = new RegexTest({ timeout: 100 });
  }

  /**
   * Adds new sensitive fields to the masking configuration at runtime.
   * This method is "additive only" to prevent security degradation. Once a field
   * is added to the mask list, it cannot be removed during the application's lifecycle.
   *
   * @param {(string | RegExp)[]} fields - An array of new field names or RegExps to add.
   *        Duplicates are silently ignored.
   */
  public addFields(fields: (string | RegExp)[]): void {
    if (!fields || fields.length === 0) {
      return;
    }

    const existingFieldsSet = new Set(
      this.fieldConfigs.map((f) => f.toString())
    );

    for (const field of fields) {
      if (!existingFieldsSet.has(field.toString())) {
        this.fieldConfigs.push(field);
        existingFieldsSet.add(field.toString()); // Update the set for the current run
      }
    }
  }

  /**
   * Processes a metadata object and applies the configured masking rules.
   * @param {Record<string, any>} meta - The metadata object to process.
   * @returns {Record<string, any>} A new object with the masked data.
   */
  public async process(
    meta: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.maskRecursively(meta, '', 0);
  }

  /**
   * @private
   * Recursively traverses an object or array to mask data.
   * It applies two types of masking:
   * 1. **Key-based masking**: If an object key matches a rule in `fieldConfigs`, its value is masked.
   * 2. **Path-based masking**: If a string value looks like a path/URL, it's sanitized.
   *
   * @param {any} data - The data to process (can be an object, array, or primitive).
   * @param {string} currentPath - The dot-notation path of the current key.
   * @param {number} depth - The current recursion depth to prevent infinite loops.
   * @returns {any} The processed data with masking applied.
   */
  private async maskRecursively(
    data: any,
    currentPath: string,
    depth: number
  ): Promise<any> {
    if (depth > this.maxDepth || data === null || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      // For arrays, we process each item individually.
      return Promise.all(
        data.map((item) => this.maskRecursively(item, currentPath, depth + 1))
      );
    }

    const sanitizedObject: Record<string, any> = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const value = data[key];
        const newPath = currentPath ? `${currentPath}.${key}` : key;

        if (await this.isSensitive(newPath)) {
          sanitizedObject[key] = this.getMask(value);
        } else if (typeof value === 'string') {
          sanitizedObject[key] = await this.sanitizeUrlPath(value);
        } else if (typeof value === 'object' && value !== null) {
          sanitizedObject[key] = await this.maskRecursively(
            value,
            newPath,
            depth + 1
          );
        } else {
          sanitizedObject[key] = value;
        }
      }
    }
    return sanitizedObject;
  }

  /**
   * @private
   * Checks if a given object key path is sensitive based on the configured rules.
   * @param {string} path - The dot-notation path of the key (e.g., "user.password").
   * @returns {Promise<boolean>} - True if the path should be masked.
   */
  private async isSensitive(path: string): Promise<boolean> {
    for (const config of this.fieldConfigs) {
      if (typeof config === 'string') {
        if (path === config || path.endsWith(`.${config}`)) {
          return true;
        }
      } else if (config instanceof RegExp) {
        // FIXME: This uses the native .test() method, which does not protect against
        // Regular Expression Denial of Service (ReDoS) attacks. The 'regex-test'
        // library was causing timeouts. This should be revisited to find a secure
        // and performant solution.
        if (config.test(path)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * @private
   * Sanitizes a string that may represent a URL path.
   * If a segment of the path matches a sensitive field name (case-insensitively),
   * the following path segment is completely replaced with the mask character.
   *
   * @example
   * // with `fields: ['password']`
   * sanitizeUrlPath("/api/v1/password/s3cr3t-v4lu3")
   * // returns: "/api/v1/password/*****"
   *
   * @param {string} str - The string to sanitize.
   * @returns {string} The sanitized string, or the original if no sensitive keywords were found.
   */
  private async sanitizeUrlPath(str: string): Promise<string> {
    // Quick check to avoid processing every single string.
    if (!str.includes('/')) {
      return str;
    }

    const parts = str.split('/');
    let modified = false;

    for (let i = 0; i < parts.length - 1; i++) {
      const currentPart = parts[i];
      const nextPart = parts[i + 1];

      let isSensitive = false;
      for (const config of this.fieldConfigs) {
        // Path sanitization should ONLY act on string keywords, not complex regex.
        if (typeof config === 'string') {
          if (currentPart.toLowerCase() === config.toLowerCase()) {
            isSensitive = true;
            break;
          }
        }
      }

      if (isSensitive && nextPart.length > 0) {
        parts[i + 1] = this.getMask(nextPart);
        modified = true;
        i++;
      }
    }

    return modified ? parts.join('/') : str;
  }

  /**
   * @private
   * Generates the appropriate mask string based on the configured style.
   * @param {any} originalValue - The original value being masked. Its length is used for 'preserve-length' style.
   * @returns {string} The generated mask string.
   */
  private getMask(originalValue: any): string {
    if (this.style === 'preserve-length') {
      const length = String(originalValue).length;
      // Use the first character of maskChar and repeat it.
      return this.maskChar.charAt(0).repeat(length > 0 ? length : 1);
    }
    // For 'fixed' style, always return the configured maskChar.
    return this.maskChar;
  }
}
