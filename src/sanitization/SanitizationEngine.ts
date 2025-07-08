/**
 * FILE: src/sanitization/SanitizationEngine.ts
 * DESCRIPTION: Final security layer that sanitizes log entries before they reach transports.
 */

/**
 * A security engine that makes log entries safe for printing by stripping
 * potentially malicious control characters, such as ANSI escape codes.
 * This prevents log injection attacks that could exploit terminal vulnerabilities.
 */
export class SanitizationEngine {
  // This regex matches ANSI escape codes used for colors, cursor movement, etc.
  private readonly ansiRegex =
    /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

  constructor() {
    // The engine is currently not configurable, but could be in the future.
  }

  /**
   * Processes a log metadata object, sanitizing all its string values.
   * @param meta The metadata object to sanitize.
   * @returns A new, sanitized metadata object.
   */
  public process(meta: Record<string, any>): Record<string, any> {
    return this.sanitizeRecursively(meta);
  }

  /**
   * Recursively traverses an object or array to sanitize all string values.
   * @param data The data to process.
   * @returns The sanitized data.
   */
  private sanitizeRecursively(data: any): any {
    if (typeof data === 'string') {
      return data.replace(this.ansiRegex, '');
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeRecursively(item));
    }

    // Recurse into plain objects, but not into special objects like RegExp
    if (data && typeof data === 'object' && !(data instanceof RegExp)) {
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
