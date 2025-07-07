/**
 * FILE: src/masking/MaskingEngine.ts
 * DESCRIPTION: Central engine for applying data masking rules to log objects.
 */

// This type would be inferred from the Zod schema in config.ts, but we define it here for clarity.
export interface FieldMaskConfig {
  path: string | RegExp;
  type: 'full' | 'partial';
  showLast?: number;
}

export interface MaskingEngineOptions {
  fields?: FieldMaskConfig[];
  maskChar?: string;
  maxDepth?: number;
}

/**
 * A central engine responsible for applying masking rules to log metadata.
 * It processes objects after serialization to ensure no sensitive data is leaked.
 */
export class MaskingEngine {
  // Store the rich field configuration directly
  private readonly fieldConfigs: FieldMaskConfig[];
  private readonly maskChar: string;
  private readonly maxDepth: number;
  private readonly urlRegex = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;

  constructor(options?: MaskingEngineOptions) {
    this.fieldConfigs = options?.fields || [];
    this.maskChar = options?.maskChar || '******';
    this.maxDepth = options?.maxDepth || 10;
  }

  public process(meta: Record<string, any>): Record<string, any> {
    return this.maskRecursively(meta, 0);
  }

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
        // Find if any rule applies to the current key
        const applicableRule = this.fieldConfigs.find((config) =>
          typeof config.path === 'string'
            ? config.path === key
            : config.path.test(key)
        );

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
   * Masks a single value based on a FieldMaskConfig rule.
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
