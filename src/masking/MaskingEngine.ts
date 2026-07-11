/**
 * FILE: src/masking/MaskingEngine.ts
 * DESCRIPTION: Ultra-fast data masking engine using JSON flattening strategy.
 *
 * This engine flattens complex nested objects into linear key-value pairs,
 * applies masking rules, and then reconstructs the original structure.
 * This approach provides extreme processing speed for any object depth.
 */
import { DEFAULT_VALUES } from '../constants';
import {
  MASK_KEY_PWD,
  MASK_KEY_TOK,
  MASK_KEYS_PASSWORD,
  MASK_KEYS_TOKEN,
  MASK_KEYS_ALL,
} from '../sensitiveKeys';
import { applyMask, MaskSpec, REDACTED } from './maskSpec';
import { assertSafeKeyPattern } from './regexSafety';

/**
 * @enum MaskingStrategy
 * @description Different masking strategies for various data types.
 */
export enum MaskingStrategy {
  CREDIT_CARD = 'credit_card',
  SSN = 'ssn',
  EMAIL = 'email',
  PHONE = 'phone',
  PASSWORD = MASK_KEY_PWD,
  TOKEN = MASK_KEY_TOK,
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
  /** Custom masking function (for CUSTOM strategy). Runs only in the JS path — a JS
   * closure cannot cross to the native engine, so a rule using this disables native
   * for that logger (the function still runs faithfully in JS). Prefer `spec` for a
   * declarative custom mask that works in both engines. */
  customMask?: (value: string) => string;
  /** Declarative custom mask. Overrides the strategy preset and crosses to native. */
  spec?: MaskSpec;
  /** Whether to preserve original length */
  preserveLength?: boolean;
  /** Character to use for masking */
  maskChar?: string;
  /** Compiled regex pattern for performance */
  _compiledPattern?: RegExp;
  /** Resolved declarative spec (from `spec` or derived from `strategy`); the single
   * thing both engines interpret. Absent only for CUSTOM-with-function rules. */
  _spec?: MaskSpec;
  /**
   * Internal: when true, rule is a built-in default (safe pattern); use sync RegExp.test()
   * instead of regex-test worker to avoid ~3s delay per log from IPC round-trips.
   */
  _isDefaultRule?: boolean;
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
  /**
   * @deprecated Has never been enforced — V8 cannot interrupt a running regex, so no runtime
   * timeout is possible in the JS path. Real ReDoS defense: explosive custom patterns are
   * rejected at init (regexSafety.ts) and keys are truncated to a bounded length. Kept only
   * for config compatibility; ignored.
   */
  regexTimeoutMs?: number;
  /** Called when masking fails (timeout or error). Never receives raw payload. */
  onMaskingError?: (error: unknown) => void;
}

/** Options for getDefaultMaskingRules (maskChar/preserveLength applied to each rule). */
export interface GetDefaultMaskingRulesOptions {
  maskChar?: string;
  preserveLength?: boolean;
}

/**
 * Returns the default masking rules (credit_card, ssn, email, phone, password, token).
 * Use with spread to add your own: rules: [...getDefaultMaskingRules({ maskChar: '*' }), { pattern: /myKey/i, strategy: MaskingStrategy.PASSWORD }].
 */
export function getDefaultMaskingRules(
  options: GetDefaultMaskingRulesOptions = {}
): MaskingRule[] {
  const maskChar = options.maskChar ?? '*';
  const preserveLength = options.preserveLength ?? true;
  return [
    {
      // Match snake_case AND camelCase (the `i` flag makes `creditcard` match
      // `creditCard`, `cardnumber` match `cardNumber`, etc.).
      pattern: /credit_card|creditcard|card_number|cardnumber|payment_number/i,
      strategy: MaskingStrategy.CREDIT_CARD,
      preserveLength,
      maskChar,
    },
    {
      pattern: /ssn|social_security|security_number/i,
      strategy: MaskingStrategy.SSN,
      preserveLength,
      maskChar,
    },
    {
      pattern: /email/i,
      strategy: MaskingStrategy.EMAIL,
      preserveLength,
      maskChar,
    },
    {
      pattern: /phone|phone_number|mobile_number/i,
      strategy: MaskingStrategy.PHONE,
      preserveLength,
      maskChar,
    },
    {
      pattern: new RegExp(MASK_KEYS_PASSWORD.join('|'), 'i'),
      strategy: MaskingStrategy.PASSWORD,
      preserveLength,
      maskChar,
    },
    {
      pattern: new RegExp(MASK_KEYS_TOKEN.join('|'), 'i'),
      strategy: MaskingStrategy.TOKEN,
      preserveLength,
      maskChar,
    },
    {
      // Catch-all for the remaining secret-type keys (auth, credential, connection
      // string, wallet, session id, …) so the rule set — the single source of truth —
      // covers everything the legacy native `sensitiveFields` list did. Redacted.
      pattern: new RegExp(MASK_KEYS_ALL.join('|'), 'i'),
      strategy: MaskingStrategy.PASSWORD,
      preserveLength,
      maskChar,
    },
  ];
}

/**
 * Expand a built-in strategy into its declarative {@link MaskSpec}. Presets only —
 * the actual masking is done by the shared `applyMask` primitive (and its Rust twin),
 * so a new strategy is a new spec here, not a new function in two languages.
 *
 * Identifiers (email/phone/card/ssn) keep a format-preserving partial (the last 4 of an
 * identifier is not the secret and aids debugging); credentials are fully redacted.
 */
export function strategyToSpec(
  strategy: MaskingStrategy,
  opts: { maskChar?: string; preserveLength?: boolean } = {}
): MaskSpec {
  const base: MaskSpec = {
    maskChar: opts.maskChar,
    preserveLength: opts.preserveLength,
  };
  switch (strategy) {
    case MaskingStrategy.EMAIL:
      return { ...base, unmaskStart: 1, keepAfter: '@' };
    case MaskingStrategy.CREDIT_CARD:
    case MaskingStrategy.SSN:
    case MaskingStrategy.PHONE:
      return { ...base, scope: 'digits', unmaskEnd: 4 };
    case MaskingStrategy.PASSWORD:
    case MaskingStrategy.TOKEN:
      return { redact: true };
    default:
      return base; // mask all characters
  }
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
  /**
   * @private Cap for the per-key-name decision cache. Bounded so attacker-controlled
   * key names (a hostile payload generating unique keys per log) cannot grow memory:
   * past the cap, new keys still mask correctly — they just pay the scan, uncached.
   */
  private static readonly DECISION_CACHE_MAX = 4096;
  /** @private Array of masking rules */
  private rules: MaskingRule[] = [];
  /**
   * @private Per-key-name decision cache: key → matched rule (or null for "no rule").
   * Field NAMES repeat across log entries while values change, and the scan tests every
   * rule (the catch-all is a wide alternation) on every non-sensitive key — so caching
   * the decision, never the value, removes the whole scan from the hot path. Family fix
   * (found by the Java port's JMH suite: 4,497→1,187 ns/op). Deterministic by design:
   * matching depends only on the key name and the rule set — and it is invalidated on
   * addRule() because a new rule can change the decision for keys cached as "no rule".
   */
  private readonly decisionCache = new Map<string, MaskingRule | null>();
  /** @private Default mask character */
  private readonly maskChar: string;
  /** @private Whether to preserve original length by default */
  private readonly preserveLength: boolean;
  /** @private Whether the engine is initialized */
  private initialized: boolean = false;
  /** @private Max ms per custom rule regex; on timeout we warn and skip the rule */
  private readonly regexTimeoutMs: number;
  /** @private Optional callback when masking fails; never receives payload. */
  private readonly onMaskingError?: (error: unknown) => void;

  constructor(options?: MaskingEngineOptions) {
    this.maskChar = options?.maskChar || '*';
    this.preserveLength = options?.preserveLength ?? true; // Default to true for security
    this.regexTimeoutMs =
      options?.regexTimeoutMs ?? DEFAULT_VALUES.regexTimeoutMs;
    this.onMaskingError = options?.onMaskingError;

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
    const defaultRules = getDefaultMaskingRules({
      maskChar: this.maskChar,
      preserveLength: this.preserveLength,
    });
    for (const rule of defaultRules) {
      (rule as MaskingRule)._isDefaultRule = true;
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

    // ReDoS defense happens HERE, at init time — not on the log hot path. V8 cannot
    // interrupt a running regex (no timeout is possible), so an explosive custom pattern
    // is rejected before it can ever run. Default rules are known-safe alternations.
    if (!rule._isDefaultRule) {
      assertSafeKeyPattern(rule._compiledPattern);
    }

    // Set defaults
    rule.preserveLength = rule.preserveLength ?? this.preserveLength;
    rule.maskChar = rule.maskChar ?? this.maskChar;

    // Resolve the declarative spec once: an explicit spec wins, otherwise derive it from
    // the strategy. A CUSTOM rule with a JS function keeps no spec (it runs the function).
    if (rule.spec) {
      rule._spec = rule.spec;
    } else if (!(rule.strategy === MaskingStrategy.CUSTOM && rule.customMask)) {
      rule._spec = strategyToSpec(rule.strategy, {
        maskChar: rule.maskChar,
        preserveLength: rule.preserveLength,
      });
    }

    this.rules.push(rule);

    // A new rule can only change the decision for keys cached as "no rule matched"
    // (first-match-wins keeps existing matches valid), but clearing everything is the
    // simple, obviously-correct move — addRule is config-time, not hot-path.
    this.decisionCache.clear();
  }

  /** Message used when masking fails (e.g. timeout) so we never emit raw payload. */
  private static readonly MASKING_FAILED_MESSAGE =
    '[SyntropyLog] Masking could not be applied (e.g. timeout or error); payload redacted for safety.';

  /**
   * Processes a metadata object and applies the configured masking rules.
   * Uses JSON flattening strategy for extreme performance.
   * On failure (timeout, rule error, etc.) does not return any user data (could be sensitive);
   * only reports the error via onMaskingError and returns a fixed redaction marker.
   * @param meta - The metadata object to process
   * @returns A new object with the masked data, or a fixed redaction marker if masking fails (no meta-derived fields).
   */
  /**
   * Synchronous masking: pure CPU (regexes), no I/O. Avoids Promise/timer pressure per log.
   */
  public process(meta: Record<string, unknown>): Record<string, unknown> {
    if (!this.initialized) {
      this.initialized = true;
    }

    try {
      const visited = new WeakSet<object>();
      return this.applyMaskingRules(meta, visited) as Record<string, unknown>;
    } catch (err) {
      this.onMaskingError?.(err);
      return {
        _maskingFailed: true,
        _maskingFailedMessage: MaskingEngine.MASKING_FAILED_MESSAGE,
      };
    }
  }

  /**
   * Applies masking rules recursively. Synchronous (pure CPU, regexes only) to avoid Promise pressure per log.
   */
  private applyMaskingRules(data: unknown, visited: WeakSet<object>): unknown {
    if (data === null || typeof data !== 'object') {
      return data;
    }

    if (visited.has(data)) {
      return data;
    }
    visited.add(data);

    if (Array.isArray(data)) {
      let isArrayModified = false;
      const out: unknown[] = new Array(data.length);
      for (let i = 0; i < data.length; i++) {
        const maskedItem = this.applyMaskingRules(data[i], visited);
        out[i] = maskedItem;
        if (maskedItem !== data[i]) {
          isArrayModified = true;
        }
      }
      return isArrayModified ? out : data;
    }

    const dataObj = data as Record<string, unknown>;

    for (const key in dataObj) {
      if (!Object.prototype.hasOwnProperty.call(dataObj, key)) continue;
      const value = dataObj[key];
      const rule = this.findMatchingRule(key);

      if (rule) {
        // Matched key: mask string values by spec; redact any non-string value whole
        // (no descent → nested PII can't leak under a sensitive-named parent). This
        // mirrors the native engine's `resolve_key_action` exactly.
        dataObj[key] =
          typeof value === 'string'
            ? this.applyStrategy(value, rule)
            : REDACTED;
      } else if (typeof value === 'object' && value !== null) {
        const maskedValue = this.applyMaskingRules(value, visited);
        if (maskedValue !== value) {
          dataObj[key] = maskedValue;
        }
      }
    }

    return dataObj;
  }

  /**
   * First rule whose key-pattern matches (order preserved → first wins), served from
   * the bounded decision cache when the key name has been seen before.
   */
  private findMatchingRule(key: string): MaskingRule | undefined {
    const cached = this.decisionCache.get(key);
    if (cached !== undefined) {
      return cached ?? undefined; // null = cached "no rule matched"
    }

    const found = this.scanRules(key);
    if (this.decisionCache.size < MaskingEngine.DECISION_CACHE_MAX) {
      this.decisionCache.set(key, found ?? null);
    }
    return found;
  }

  /** The uncached scan: every rule, in order. Pure — depends only on key + rule set. */
  private scanRules(key: string): MaskingRule | undefined {
    for (const rule of this.rules) {
      if (!rule._compiledPattern) continue;
      const isMatch = rule._isDefaultRule
        ? rule._compiledPattern.test(key)
        : this.testCustomPatternBounded(rule._compiledPattern, key);
      if (isMatch) return rule;
    }
    return undefined;
  }

  /**
   * Apply a matched rule to a string value. A custom JS function (if any) runs here;
   * otherwise the resolved declarative spec is interpreted by the shared `applyMask`
   * primitive — the exact same code path the native engine mirrors.
   * @private
   */
  private applyStrategy(value: string, rule: MaskingRule): string {
    if (rule.customMask) {
      return rule.customMask(value);
    }
    if (rule._spec) {
      return applyMask(value, rule._spec);
    }
    return REDACTED; // no function and no spec → safe fallback
  }

  /**
   * Export the rules for the native engine as `[{ pattern, flags, spec }]`, or `null`
   * if any rule uses a custom JS function (which cannot cross to Rust). On `null` the
   * caller must keep masking in the JS path so the function still runs — never silently
   * skip it.
   */
  public getNativeRules(): Array<{
    pattern: string;
    flags: string;
    spec: MaskSpec;
  }> | null {
    const out: Array<{ pattern: string; flags: string; spec: MaskSpec }> = [];
    for (const rule of this.rules) {
      if (rule.customMask) return null; // JS-only function → native cannot honor it
      if (!rule._compiledPattern || !rule._spec) return null;
      out.push({
        pattern: rule._compiledPattern.source,
        flags: rule._compiledPattern.flags,
        spec: rule._spec,
      });
    }
    return out;
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
      decisionCacheSize: this.decisionCache.size,
    };
  }

  /**
   * Checks if the masking engine is initialized.
   * @returns True if initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  private testCustomPatternBounded(regex: RegExp, key: string): boolean {
    // There is NO timeout here and none is possible: V8 regex execution is synchronous and
    // uninterruptible (the old name, testRegexWithTimeout, promised one — it lied). The
    // layered defense is:
    //   1. Explosive patterns are REJECTED at addRule() time (see regexSafety.ts) — a
    //      pattern that reaches this point has star-height ≤ 1.
    //   2. The key is TRUNCATED (never skipped) to cap polynomial blow-up. Skipping was
    //      fail-open: an over-long key named "…password…" sailed through unmasked.
    //   3. The full elimination is the declarative path — spec rules cross to the native
    //      Rust engine (linear-time `regex` crate), where ReDoS cannot exist.
    const bounded =
      key.length > DEFAULT_VALUES.maxKeyLengthForRegex
        ? key.slice(0, DEFAULT_VALUES.maxKeyLengthForRegex)
        : key;

    try {
      return regex.test(bounded);
    } catch {
      return false;
    }
  }

  /**
   * Shutdown the masking engine.
   */
  public shutdown(): void {
    this.rules = [];
    this.decisionCache.clear();
    this.initialized = false;
  }
}
