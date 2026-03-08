/**
 * @file src/sanitization/SanitizationEngine.ts
 * @description Final security layer that sanitizes log entries before they are written by a transport.
 */

import { MaskingEngine } from '../masking/MaskingEngine';

/**
 * @class SanitizationEngine
 * A security engine that makes log entries safe for printing by stripping
 * potentially malicious control characters, such as ANSI escape codes.
 * This prevents log injection attacks that could exploit terminal vulnerabilities.
 */
export class SanitizationEngine {
  private readonly maskingEngine?: MaskingEngine;
  /** @private This regex matches ANSI escape codes used for colors, cursor movement, etc. */
  // prettier-ignore
  // eslint-disable-next-line no-control-regex
  private readonly ansiRegex =/[\x1b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  /**
   * @constructor
   * The engine is currently not configurable, but the constructor is in place for future enhancements.
   */
  constructor(maskingEngine?: MaskingEngine) {
    this.maskingEngine = maskingEngine;
  }

  /**
   * Processes a log metadata object, sanitizing all its string values.
   * @param {Record<string, unknown>} meta - The metadata object to sanitize.
   * @returns {Record<string, unknown>} A new, sanitized metadata object.
   */
  public async process(
    meta: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    let sanitized = this.sanitizeRecursively(meta) as Record<string, unknown>;
    if (this.maskingEngine) {
      sanitized = await this.maskingEngine.process(sanitized);
    }
    return sanitized;
  }

  /**
   * @private
   * Recursively traverses an object or array to sanitize all string values.
   * @param {unknown} data - The data to process.
   * @returns {unknown} The sanitized data.
   */
  private sanitizeRecursively(data: unknown): unknown {
    if (typeof data === 'string') {
      return data.replace(this.ansiRegex, '');
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeRecursively(item));
    }

    // Clave: Solo procesar objetos planos para no corromper instancias de clases.
    if (
      typeof data === 'object' &&
      data !== null &&
      data.constructor === Object
    ) {
      const sanitizedObject: Record<string, unknown> = {};
      const dataObj = data as Record<string, unknown>;
      for (const key in dataObj) {
        if (Object.prototype.hasOwnProperty.call(dataObj, key)) {
          sanitizedObject[key] = this.sanitizeRecursively(dataObj[key]);
        }
      }
      return sanitizedObject;
    }

    // Return any other type (numbers, booleans, instances, etc.) unchanged.
    return data;
  }
}
