/**
 * @file src/cli/checks.ts
 * @description The engine for the diagnostic rules. This file contains the array of
 * core rules and the logic to execute them against a configuration.
 */
import { SyntropyLogConfig } from '../config';

/**
 * @interface CheckResult
 * @description Represents the outcome of a single diagnostic check.
 */
export interface CheckResult {
  /** The severity level of the finding. */
  level: 'ERROR' | 'WARN' | 'INFO';
  /** A short, descriptive title for the finding. */
  title: string;
  /** A detailed message explaining the issue. */
  message: string;
  /** An optional recommendation on how to fix the issue. */
  recommendation?: string;
}

/**
 * @interface DiagnosticRule
 * @description Defines the structure for a diagnostic rule that can be run by the doctor.
 */
export interface DiagnosticRule {
  /** A unique identifier for the rule, used for disabling it in the config. */
  id: string;
  /** A brief description of what the rule checks for. */
  description: string;
  /** The function that contains the actual check logic. */
  check: (config: SyntropyLogConfig) => CheckResult[];
}

/**
 * @constant coreRules
 * @description An array containing the set of built-in diagnostic rules provided by SyntropyLog.
 * Users can extend, filter, or replace this set in their own audit manifests.
 */
export const coreRules: DiagnosticRule[] = [
  {
    id: 'prod-log-level',
    description:
      'Warns if logger level is too verbose for production environments.',
    check: checkLoggerLevel,
  },
  {
    id: 'no-logger-transports',
    description: 'Errors if no logger transports are defined.',
    check: checkLoggerTransports,
  },
  {
    id: 'no-masking-rules',
    description: 'Warns if no data masking rules are defined.',
    check: checkMaskingRules,
  },
  {
    id: 'redis-sentinel-name-missing',
    description: 'Ensures Redis Sentinel instances have a master name.',
    check: checkRedisSentinel,
  },
  {
    id: 'duplicate-redis-instance-name',
    description: 'Errors if multiple Redis instances share the same name.',
    check: checkRedisInstanceNameUniqueness,
  },
  // Add other relevant checks here...
];

/**
 * Executes a set of diagnostic rules against a given configuration.
 * It respects the `doctor.disableRules` property in the configuration,
 * skipping any rules that the user has explicitly disabled.
 * @param {SyntropyLogConfig} config - The parsed configuration object to check.
 * @param {DiagnosticRule[]} rules - The array of rules to execute.
 * @returns {CheckResult[]} An array of all findings from the executed rules.
 */
export function runAllChecks(
  config: SyntropyLogConfig,
  rules: DiagnosticRule[]
): CheckResult[] {
  const disabledRules = new Set(config.doctor?.disableRules ?? []);
  let results: CheckResult[] = [];
  for (const rule of rules) {
    if (!disabledRules.has(rule.id)) {
      try {
        results = [...results, ...rule.check(config)];
      } catch (error) {
        results.push({
          level: 'ERROR',
          title: `Rule Execution Failed: ${rule.id}`,
          message: `The diagnostic rule itself threw an error: ${(error as Error).message}`,
          recommendation:
            'This indicates a bug in the SyntropyLog doctor. Please report it.',
        });
      }
    }
  }
  return results;
}

/* ------------------------------------------------------------------------- */
/*                          RULE IMPLEMENTATIONS                             */
/* ------------------------------------------------------------------------- */

/**
 * Checks if the logger level is appropriate for a production environment.
 * @param {SyntropyLogConfig} config - The configuration object.
 * @returns {CheckResult[]} A warning if the level is 'debug' or 'trace' in production.
 */
function checkLoggerLevel(config: SyntropyLogConfig): CheckResult[] {
  const level = config.logger?.level;
  if (
    process.env.NODE_ENV === 'production' &&
    (level === 'debug' || level === 'trace')
  ) {
    return [
      {
        level: 'WARN',
        title: 'Verbose Logger Level in Production',
        message: `Logger level is set to "${level}", which can be noisy and impact performance in production.`,
        recommendation:
          'Consider changing the level to "info" or "warn" for production environments.',
      },
    ];
  }
  return [];
}

/**
 * Checks if any logger transports are defined.
 * @param {SyntropyLogConfig} config - The configuration object.
 * @returns {CheckResult[]} An error if `logger.transports` is an empty array.
 */
function checkLoggerTransports(config: SyntropyLogConfig): CheckResult[] {
  if (
    config.logger &&
    'transports' in config.logger &&
    config.logger.transports?.length === 0
  ) {
    return [
      {
        level: 'ERROR',
        title: 'No Logger Transports Defined',
        message:
          'SyntropyLog will not emit any logs because "logger.transports" is an empty array.',
        recommendation:
          'Add at least one transport (e.g., new ConsoleTransport()), or remove the "transports" key to use the default.',
      },
    ];
  }
  return [];
}

/**
 * Checks if any data masking rules are defined.
 * @param {SyntropyLogConfig} config - The configuration object.
 * @returns {CheckResult[]} A warning if `masking.fields` is empty or not defined.
 */
function checkMaskingRules(config: SyntropyLogConfig): CheckResult[] {
  if (!config.masking?.fields || config.masking.fields.length === 0) {
    return [
      {
        level: 'WARN',
        title: 'No Data Masking Rules Defined',
        message:
          'The "masking.fields" array is empty. No sensitive data will be automatically obfuscated.',
        recommendation:
          'Add common sensitive field rules (e.g., { path: "password", type: "full" }) to prevent data leaks.',
      },
    ];
  }
  return [];
}

/**
 * Checks if Redis instances configured in 'sentinel' mode have a master name.
 * @param {SyntropyLogConfig} config - The configuration object.
 * @returns {CheckResult[]} An error for each sentinel instance missing the `name` property.
 */
function checkRedisSentinel(config: SyntropyLogConfig): CheckResult[] {
  const instances = config.redis?.instances ?? [];
  return instances.flatMap((i) => {
    if (i.mode === 'sentinel' && !i.name) {
      return [
        {
          level: 'ERROR',
          title: 'Redis Sentinel Missing Master Name',
          message: `Instance "${i.instanceName}" is in sentinel mode but the master "name" is not provided.`,
          recommendation:
            'Add the "name" property (the master group name) to the sentinel configuration.',
        },
      ];
    }
    return [];
  });
}

/**
 * Checks for duplicate `instanceName` properties among Redis instances.
 * @param {SyntropyLogConfig} config - The configuration object.
 * @returns {CheckResult[]} An error if any duplicate instance names are found.
 */
function checkRedisInstanceNameUniqueness(
  config: SyntropyLogConfig
): CheckResult[] {
  const names = (config.redis?.instances ?? []).map((i) => i.instanceName);
  const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
  if (duplicates.length > 0) {
    return [
      {
        level: 'ERROR',
        title: 'Duplicate Redis Instance Name',
        message: `The following Redis instance names appear more than once: ${[...new Set(duplicates)].join(', ')}.`,
        recommendation:
          'Ensure each Redis instance has a unique "instanceName".',
      },
    ];
  }
  return [];
}
