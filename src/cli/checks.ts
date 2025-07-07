/**
 * FILE: src/cli/checks.ts
 * DESCRIPTION: The engine for the diagnostic rules. This file contains the array of
 * core rules and the logic to execute them against a configuration.
 */
import fs from 'fs';
import { SyntropyLogConfig } from '../config'; // Using the new config type

export interface CheckResult {
  level: 'ERROR' | 'WARN' | 'INFO';
  title: string;
  message: string;
  recommendation?: string;
}

export interface DiagnosticRule {
  id: string;
  description: string;
  check: (config: SyntropyLogConfig) => CheckResult[];
}

// --- CORE RULE DEFINITIONS ---
// This array is the set of built-in rules that SyntropyLog provides.
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
/* RULE IMPLEMENTATIONS                            */
/* ------------------------------------------------------------------------- */

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
