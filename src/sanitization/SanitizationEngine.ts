/**
 * @file src/sanitization/SanitizationEngine.ts
 * @description Final security layer that sanitizes log entries before they are written by a transport.
 */

/**
 * @class SanitizationEngine
 * A security engine that makes log entries safe for printing by stripping
 * potentially malicious control characters, such as ANSI escape codes.
 * This prevents log injection attacks that could exploit terminal vulnerabilities.
 */
export class SanitizationEngine {
  /** @private This regex matches ANSI escape codes used for colors, cursor movement, etc. */
  private readonly ansiRegex =
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

  /**
   * @constructor
   * The engine is currently not configurable, but the constructor is in place for future enhancements.
   */
  constructor() {
    // No configuration needed at this time.
  }

  /**
   * Processes a log metadata object, sanitizing all its string values.
   * @param {Record<string, any>} meta - The metadata object to sanitize.
   * @returns {Record<string, any>} A new, sanitized metadata object.
   */
  public process(meta: Record<string, any>): Record<string, any> {
    return this.sanitizeRecursively(meta);
  }

  /**
   * @private
   * Recursively traverses an object or array to sanitize all string values.
   * @param {any} data - The data to process.
   * @returns {any} The sanitized data.
   */
  private sanitizeRecursively(data: any): any {
    if (typeof data === 'string') {
      return data.replace(this.ansiRegex, '');
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeRecursively(item));
    }

    // Recurse into plain objects, but not into special objects like Buffers or RegExps.
    // This prevents corruption of binary data and other non-plain-object types.
    if (
      data &&
      typeof data === 'object' &&
      !Buffer.isBuffer(data) &&
      !(data instanceof RegExp)
    ) {
      const sanitizedObject: Record<string, any> = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          sanitizedObject[key] = this.sanitizeRecursively(data[key]);
        }
      }
      return sanitizedObject;
    }

    return data;
  }
}
