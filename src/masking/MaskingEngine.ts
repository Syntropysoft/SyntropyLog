/**
 * FILE: src/masking/MaskingEngine.ts
 * DESCRIPTION: Ultra-fast data masking engine using JSON flattening strategy.
 *
 * This engine flattens complex nested objects into linear key-value pairs,
 * applies masking rules, and then reconstructs the original structure.
 * This approach provides extreme processing speed for any object depth.
 */

// Using type assertion for regex-test module since it lacks proper TypeScript declarations
import RegexTest from 'regex-test';

/**
 * @enum MaskingStrategy
 * @description Different masking strategies for various data types.
 */
export enum MaskingStrategy {
  CREDIT_CARD = 'credit_card',
  SSN = 'ssn',
  EMAIL = 'email',
  PHONE = 'phone',
  PASSWORD = 'password',
  TOKEN = 'token',
  CUSTOM = 'custom',
}

/**
 * @interface MaskingRule
 * @description Configuration for a masking rule.
 */
export interface MaskingRule {
  /** Regex pattern to match field names */
  pattern: string | RegExp;
  /** Masking strategy to apply */
  strategy: MaskingStrategy;
  /** Custom masking function (for CUSTOM strategy) */
  customMask?: (value: string) => string;
  /** Whether to preserve original length */
  preserveLength?: boolean;
  /** Character to use for masking */
  maskChar?: string;
  /** Compiled regex pattern for performance */
  _compiledPattern?: RegExp;
}

/**
 * @interface MaskingEngineOptions
 * @description Options for configuring the MaskingEngine.
 */
export interface MaskingEngineOptions {
  /** Array of masking rules */
  rules?: MaskingRule[];
  /** Default mask character */
  maskChar?: string;
  /** Whether to preserve original length by default */
  preserveLength?: boolean;
  /** Enable default rules for common data types */
  enableDefaultRules?: boolean;
}

/**
 * @class MaskingEngine
 * Ultra-fast data masking engine using JSON flattening strategy.
 *
 * Instead of processing nested objects recursively, we flatten them to a linear
 * structure for extreme processing speed. This approach provides O(n) performance
 * regardless of object depth or complexity.
 */
export class MaskingEngine {
  /** @private Array of masking rules */
  private rules: MaskingRule[] = [];
  /** @private Default mask character */
  private readonly maskChar: string;
  /** @private Whether to preserve original length by default */
  private readonly preserveLength: boolean;
  /** @private Whether the engine is initialized */
  private initialized: boolean = false;
  /** @private Secure regex tester with timeout */
  private readonly regexTest: InstanceType<typeof RegexTest>;

  constructor(options?: MaskingEngineOptions) {
    this.maskChar = options?.maskChar || '*';
    this.preserveLength = options?.preserveLength ?? true; // Default to true for security
    this.regexTest = new RegexTest({ timeout: 100 });

    // Add default rules if enabled
    if (options?.enableDefaultRules !== false) {
      this.addDefaultRules();
    }

    // Add custom rules from options
    if (options?.rules) {
      for (const rule of options.rules) {
        this.addRule(rule);
      }
    }
  }

  /**
   * Adds default masking rules for common data types.
   * @private
   */
  private addDefaultRules(): void {
    const defaultRules: MaskingRule[] = [
      {
        pattern: /credit_card|card_number|payment_number/i,
        strategy: MaskingStrategy.CREDIT_CARD,
        preserveLength: true,
        maskChar: this.maskChar,
      },
      {
        pattern: /ssn|social_security|security_number/i,
        strategy: MaskingStrategy.SSN,
        preserveLength: true,
        maskChar: this.maskChar,
      },
      {
        pattern: /email/i,
        strategy: MaskingStrategy.EMAIL,
        preserveLength: true,
        maskChar: this.maskChar,
      },
      {
        pattern: /phone|phone_number|mobile_number/i,
        strategy: MaskingStrategy.PHONE,
        preserveLength: true,
        maskChar: this.maskChar,
      },
      {
        pattern: /password|pass|pwd|secret/i,
        strategy: MaskingStrategy.PASSWORD,
        preserveLength: true,
        maskChar: this.maskChar,
      },
      {
        pattern: /token|api_key|auth_token|jwt|bearer/i,
        strategy: MaskingStrategy.TOKEN,
        preserveLength: true,
        maskChar: this.maskChar,
      },
    ];

    for (const rule of defaultRules) {
      this.addRule(rule);
    }
  }

  /**
   * Adds a custom masking rule.
   * @param rule - The masking rule to add
   */
  public addRule(rule: MaskingRule): void {
    // Compile regex pattern for performance
    if (typeof rule.pattern === 'string') {
      rule._compiledPattern = new RegExp(rule.pattern, 'i');
    } else {
      rule._compiledPattern = rule.pattern;
    }

    // Set defaults
    rule.preserveLength = rule.preserveLength ?? this.preserveLength;
    rule.maskChar = rule.maskChar ?? this.maskChar;

    this.rules.push(rule);
  }

  /** Message used when masking fails (e.g. timeout) so we never emit raw payload. */
  private static readonly MASKING_FAILED_MESSAGE =
    '[SyntropyLog] Masking could not be applied (e.g. timeout or error); payload redacted for safety.';

  /**
   * Processes a metadata object and applies the configured masking rules.
   * Uses JSON flattening strategy for extreme performance.
   * On failure (timeout, rule error, etc.) returns a safe redacted object with an explicit message
   * instead of the original data, to avoid leaking sensitive content.
   * @param meta - The metadata object to process
   * @returns A new object with the masked data, or a safe fallback object if masking fails
   */
  public async process(
    meta: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Set initialized flag on first use
    if (!this.initialized) {
      this.initialized = true;
    }

    try {
      // Apply masking rules directly to the data structure
      const visited = new WeakSet<object>();
      const masked = (await this.applyMaskingRules(meta, visited)) as Record<
        string,
        unknown
      >;

      // Return the masked data
      return masked;
    } catch {
      // Do not return original data: emit a safe placeholder so sensitive payload is never logged
      return {
        ...MaskingEngine.buildSafeFallbackFromMeta(meta),
        _maskingFailed: true,
        _maskingFailedMessage: MaskingEngine.MASKING_FAILED_MESSAGE,
      };
    }
  }

  /**
   * Builds a minimal safe object from meta (level, timestamp, message, service) for fallback.
   * Avoids leaking any arbitrary keys/values when masking fails.
   */
  private static buildSafeFallbackFromMeta(
    meta: Record<string, unknown>
  ): Record<string, unknown> {
    const safe: Record<string, unknown> = {};
    const allowedKeys = ['level', 'timestamp', 'message', 'service'] as const;
    for (const key of allowedKeys) {
      if (key in meta && meta[key] !== undefined) {
        safe[key] = meta[key];
      }
    }
    return safe;
  }

  /**
   * Applies masking rules to data recursively.
   * @param data - Data to mask
   * @param visited - Set of visited objects to prevent circular references
   * @returns Masked data
   * @private
   */
  private async applyMaskingRules(
    data: unknown,
    visited: WeakSet<object>
  ): Promise<unknown> {
    if (data === null || typeof data !== 'object') {
      return data;
    }

    if (visited.has(data)) {
      return data;
    }
    visited.add(data);

    if (Array.isArray(data)) {
      return Promise.all(
        data.map((item) => this.applyMaskingRules(item, visited))
      );
    }

    const dataObj = data as Record<string, unknown>;
    const masked = { ...dataObj };

    for (const key in dataObj) {
      if (Object.prototype.hasOwnProperty.call(dataObj, key)) {
        const value = dataObj[key];

        if (typeof value === 'string') {
          // Check each rule
          for (const rule of this.rules) {
            let isMatch = false;
            if (rule._compiledPattern) {
              try {
                // Use regex-test for safe execution with timeout
                isMatch = await this.regexTest.test(rule._compiledPattern, key);
              } catch {
                // Silent failure on timeout/error - treat as no match
                isMatch = false;
              }
            }

            if (isMatch) {
              masked[key] = this.applyStrategy(value, rule);
              break; // First matching rule wins
            }
          }
        } else if (typeof value === 'object' && value !== null) {
          // Recursively mask nested objects
          masked[key] = await this.applyMaskingRules(value, visited);
        }
      }
    }

    return masked;
  }

  /**
   * Applies specific masking strategy to a value.
   * @param value - Value to mask
   * @param rule - Masking rule to apply
   * @returns Masked value
   * @private
   */
  private applyStrategy(value: string, rule: MaskingRule): string {
    if (rule.strategy === MaskingStrategy.CUSTOM && rule.customMask) {
      return rule.customMask(value);
    }

    switch (rule.strategy) {
      case MaskingStrategy.CREDIT_CARD:
        return this.maskCreditCard(value, rule);
      case MaskingStrategy.SSN:
        return this.maskSSN(value, rule);
      case MaskingStrategy.EMAIL:
        return this.maskEmail(value, rule);
      case MaskingStrategy.PHONE:
        return this.maskPhone(value, rule);
      case MaskingStrategy.PASSWORD:
        return this.maskPassword(value, rule);
      case MaskingStrategy.TOKEN:
        return this.maskToken(value, rule);
      default:
        return this.maskDefault(value, rule);
    }
  }

  /**
   * Masks credit card number.
   * @param value - Credit card number
   * @param rule - Masking rule
   * @returns Masked credit card
   * @private
   */
  private maskCreditCard(value: string, rule: MaskingRule): string {
    const clean = value.replace(/\D/g, '');
    if (rule.preserveLength) {
      // Preserve original format, mask all but last 4 digits
      return value.replace(/\d/g, (match, offset) => {
        const digitIndex = value.substring(0, offset).replace(/\D/g, '').length;
        return digitIndex < clean.length - 4 ? rule.maskChar! : match;
      });
    } else {
      // Fixed format: ****-****-****-1111
      return `${rule.maskChar!.repeat(4)}-${rule.maskChar!.repeat(4)}-${rule.maskChar!.repeat(4)}-${clean.slice(-4)}`;
    }
  }

  /**
   * Masks SSN.
   * @param value - SSN
   * @param rule - Masking rule
   * @returns Masked SSN
   * @private
   */
  private maskSSN(value: string, rule: MaskingRule): string {
    const clean = value.replace(/\D/g, '');
    if (rule.preserveLength) {
      // Preserve original format, mask all but last 4 digits
      return value.replace(/\d/g, (match, offset) => {
        const digitIndex = value.substring(0, offset).replace(/\D/g, '').length;
        return digitIndex < clean.length - 4 ? rule.maskChar! : match;
      });
    } else {
      // Fixed format: ***-**-6789
      return `***-**-${clean.slice(-4)}`;
    }
  }

  /**
   * Masks email address.
   * @param value - Email address
   * @param rule - Masking rule
   * @returns Masked email
   * @private
   */
  private maskEmail(value: string, rule: MaskingRule): string {
    const atIndex = value.indexOf('@');
    if (atIndex > 0) {
      const username = value.substring(0, atIndex);
      const domain = value.substring(atIndex);

      if (rule.preserveLength) {
        // Preserve original length: first char + asterisks + @domain
        const maskedUsername =
          username.length > 1
            ? username.charAt(0) + rule.maskChar!.repeat(username.length - 1)
            : rule.maskChar!.repeat(username.length);
        return maskedUsername + domain;
      } else {
        return `${username.charAt(0)}***${domain}`;
      }
    }
    return this.maskDefault(value, rule);
  }

  /**
   * Masks phone number.
   * @param value - Phone number
   * @param rule - Masking rule
   * @returns Masked phone number
   * @private
   */
  private maskPhone(value: string, rule: MaskingRule): string {
    const clean = value.replace(/\D/g, '');
    if (rule.preserveLength) {
      // Preserve original format, mask all but last 4 digits
      return value.replace(/\d/g, (match, offset) => {
        const digitIndex = value.substring(0, offset).replace(/\D/g, '').length;
        return digitIndex < clean.length - 4 ? rule.maskChar! : match;
      });
    } else {
      // Fixed format: ***-***-4567
      return `${rule.maskChar!.repeat(3)}-${rule.maskChar!.repeat(3)}-${clean.slice(-4)}`;
    }
  }

  /**
   * Masks password.
   * @param value - Password
   * @param rule - Masking rule
   * @returns Masked password
   * @private
   */
  private maskPassword(value: string, rule: MaskingRule): string {
    return rule.maskChar!.repeat(value.length);
  }

  /**
   * Masks token.
   * @param value - Token
   * @param rule - Masking rule
   * @returns Masked token
   * @private
   */
  private maskToken(value: string, rule: MaskingRule): string {
    if (rule.preserveLength) {
      return (
        value.substring(0, 4) +
        rule.maskChar!.repeat(value.length - 9) +
        value.substring(value.length - 5)
      );
    } else {
      if (value.length > 8) {
        return (
          value.substring(0, 4) + '...' + value.substring(value.length - 5)
        );
      }
      return rule.maskChar!.repeat(value.length);
    }
  }

  /**
   * Default masking strategy.
   * @param value - Value to mask
   * @param rule - Masking rule
   * @returns Masked value
   * @private
   */
  private maskDefault(value: string, rule: MaskingRule): string {
    if (rule.preserveLength) {
      return rule.maskChar!.repeat(value.length);
    } else {
      return rule.maskChar!.repeat(Math.min(value.length, 8));
    }
  }

  /**
   * Gets masking engine statistics.
   * @returns Dictionary with masking statistics
   */
  public getStats(): Record<string, unknown> {
    return {
      initialized: this.initialized,
      totalRules: this.rules.length,
      defaultRules: this.rules.filter((r) =>
        [
          MaskingStrategy.CREDIT_CARD,
          MaskingStrategy.SSN,
          MaskingStrategy.EMAIL,
          MaskingStrategy.PHONE,
          MaskingStrategy.PASSWORD,
          MaskingStrategy.TOKEN,
        ].includes(r.strategy)
      ).length,
      customRules: this.rules.filter(
        (r) => r.strategy === MaskingStrategy.CUSTOM
      ).length,
      strategies: this.rules.map((r) => r.strategy),
    };
  }

  /**
   * Checks if the masking engine is initialized.
   * @returns True if initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Shutdown the masking engine.
   */
  public shutdown(): void {
    this.rules = [];
    this.initialized = false;
    // Clean up regex-test worker to prevent process leaks
    if (this.regexTest?.cleanWorker) {
      this.regexTest.cleanWorker();
    }
  }
}
