/*
=============================================================================
ARCHIVO 7: src/cli/checks.ts (MODIFICADO - EL MOTOR DE REGLAS)
-----------------------------------------------------------------------------
DESCRIPTION (en-US):
The checks are now defined as an array of `DiagnosticRule` objects. This
array, `coreRules`, is exported so it can be imported by users in their
manifest files. `runAllChecks` now accepts the rules to run as a parameter.
=============================================================================
*/
import fs from 'fs';
import { BeaconLogConfig } from '../config'; // Assuming config types are exported from a central place
export interface CheckResult {
  level: 'ERROR' | 'WARN' | 'INFO';
  title: string;
  message: string;
  recommendation?: string;
}
export interface DiagnosticRule {
  id: string;
  description: string;
  check: (config: BeaconLogConfig) => CheckResult[];
}

// --- CORE RULE DEFINITIONS ---
// This array is the set of built-in rules that beaconlog provides.
// It is exported via `src/doctor.ts` for users to import.
export const coreRules: DiagnosticRule[] = [
  {
    id: 'http-body-logging',
    description: 'Checks if HTTP request body logging is enabled in production.',
    check: checkHttpLogging,
  },
  {
    id: 'sensitive-headers-missing',
    description: 'Checks for common sensitive headers that are not configured.',
    check: checkSensitiveHeaders,
  },
  {
    id: 'redis-sentinel-name-missing',
    description: 'Ensures Redis Sentinel instances have a master name.',
    check: checkRedisSentinel,
  },
  {
    id: 'prod-log-level',
    description: 'Warns if logger level is too verbose for production environments.',
    check: checkLoggerLevel,
  },
  {
    id: 'no-logger-transports',
    description: 'Errors if no logger transports are defined.',
    check: checkLoggerTransports,
  },
  {
    id: 'correlation-config',
    description: 'Checks for serviceName and consistent correlation headers.',
    check: checkCorrelationConfig,
  },
  {
    id: 'duplicate-sensitive-keys',
    description: 'Warns about duplicate entries in customSensitiveKeys.',
    check: checkDuplicateSensitive,
  },
  {
    id: 'high-sanitize-depth',
    description: 'Checks if maxSanitizeDepth has a potentially expensive value.',
    check: checkSanitizeDepth,
  },
  {
    id: 'redis-sentinel-quorum',
    description: 'Warns if a Redis Sentinel setup has too few nodes.',
    check: checkRedisSentinelQuorum,
  },
  {
    id: 'redis-cluster-parity',
    description: 'Suggests an odd number of nodes for Redis Cluster.',
    check: checkRedisClusterParity,
  },
  {
    id: 'no-sensitive-body-fields',
    description: 'Suggests defining sensitiveBodyFields to prevent data leaks.',
    check: checkSensitiveBodyFields,
  },
  {
    id: 'duplicate-redis-instance-name',
    description: 'Errors if multiple Redis instances share the same name.',
    check: checkRedisInstanceNameUniqueness,
  },
  {
    id: 'invalid-regex-pattern',
    description: 'Errors if a string-based regex pattern is invalid.',
    check: checkRegexPatterns,
  },
  {
    id: 'file-transport-path',
    description: 'Checks for issues with file transport paths.',
    check: checkFileTransportPath,
  },
  {
    id: 'suspicious-timeouts',
    description: 'Checks for HTTP or Redis timeouts that are unusually high or low.',
    check: checkTimeoutRanges,
  },
  {
    id: 'whitespace-in-values',
    description: 'Checks for leading/trailing whitespace in key configuration values.',
    check: checkWhitespaceInValues,
  },
];

export function runAllChecks(
  config: BeaconLogConfig,
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
            'This indicates a bug in the beaconlog doctor. Please report it.',
        });
      }
    }
  }
  return results;
}

/* ------------------------------------------------------------------------- */
/* IMPLEMENTACIÓN DE REGLAS... (Las 11 reglas anteriores se mantienen igual) */
/* ------------------------------------------------------------------------- */

function checkHttpLogging(config: BeaconLogConfig): CheckResult[] {
  if (config.http?.logRequestBody) {
    return [
      {
        level: 'WARN',
        title: 'HTTP Request Body Logging Enabled',
        message:
          'The "logRequestBody" option is set to true. This may expose sensitive data in the logs.',
        recommendation:
          'Disable "logRequestBody" (set to false) in production environments.',
      },
    ];
  }
  return [];
}

function checkSensitiveHeaders(config: BeaconLogConfig): CheckResult[] {
  const common = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
  const defined = (config.http?.sensitiveHeaders ?? []).map((h) =>
    h.toLowerCase()
  );
  const missing = common.filter((h) => !defined.includes(h));

  if (missing.length) {
    return [
      {
        level: 'INFO',
        title: 'Common Sensitive Headers Missing',
        message: `Some typical sensitive headers are not configured: ${missing.join(', ')}.`,
        recommendation:
          'Add them to "http.sensitiveHeaders" to avoid leaking secrets.',
      },
    ];
  }
  return [];
}

function checkRedisSentinel(config: BeaconLogConfig): CheckResult[] {
  const instances = config.redis?.instances ?? [];

  return instances.flatMap((i) => {
    if (i.mode === 'sentinel' && !i.name) {
      return [
        {
          level: 'ERROR',
          title: 'Redis Sentinel Missing "name"',
          message: `Instance "${i.instanceName}" is in sentinel mode but the master "name" is not provided.`,
          recommendation:
            'Add the "name" (master group name) to the sentinel configuration.',
        },
      ];
    }
    return [];
  });
}

function checkLoggerLevel(config: BeaconLogConfig): CheckResult[] {
  const level = config.logger?.level?.toLowerCase?.();
  if (
    process.env.NODE_ENV === 'production' &&
    (level === 'debug' || level === 'trace')
  ) {
    return [
      {
        level: 'WARN',
        title: 'Verbose Logger Level in Production',
        message: `Logger level is "${level}" while running in production.`,
        recommendation:
          'Change the level to "info" or "warn" to reduce noise and disk usage.',
      },
    ];
  }
  return [];
}

function checkLoggerTransports(config: BeaconLogConfig): CheckResult[] {
  // This rule only triggers for an explicit empty array.
  // The absence of the `transports` key implies a default transport will be used.
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
          'BeaconLog will not emit any log because "logger.transports" is an empty array.',
        recommendation:
          'Add at least one transport such as a ConsoleTransport instance, or remove the "transports" key to use the default console transport.',
      },
    ];
  }
  return [];
}

function checkCorrelationConfig(config: BeaconLogConfig): CheckResult[] {
  const res: CheckResult[] = [];

  if (!config.logger?.serviceName) {
    res.push({
      level: 'ERROR',
      title: 'Missing "serviceName"',
      message:
        'The "logger.serviceName" field is not set; traces and dashboards will lack context.',
      recommendation: 'Provide a unique service name, e.g. "payments-api".',
    });
  }

  const key = config.logger?.correlationKey;
  const hdr = config.context?.correlationIdHeader;
  if (key && hdr && key !== hdr) {
    res.push({
      level: 'INFO',
      title: 'Correlation Header Mismatch',
      message: `"logger.correlationKey" ("${key}") and "context.correlationIdHeader" ("${hdr}") differ.`,
      recommendation: 'Align both values so logs and HTTP headers map 1-to-1.',
    });
  }
  return res;
}

function checkDuplicateSensitive(config: BeaconLogConfig): CheckResult[] {
  const keys = config.customSensitiveKeys ?? [];
  const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);

  if (duplicates.length) {
    return [
      {
        level: 'WARN',
        title: 'Duplicate customSensitiveKeys',
        message: `Found duplicated sensitive keys: ${[...new Set(duplicates)].join(', ')}.`,
        recommendation:
          'Remove duplicates to avoid redundant sanitization work.',
      },
    ];
  }
  return [];
}

function checkSanitizeDepth(config: BeaconLogConfig): CheckResult[] {
  const depth = config.http?.maxSanitizeDepth;
  if (depth && depth > 5) {
    return [
      {
        level: 'INFO',
        title: 'High maxSanitizeDepth',
        message: `maxSanitizeDepth is set to ${depth}. Deep sanitization can impact performance.`,
        recommendation:
          'Use a value of 5 or less unless you truly handle very deep JSON structures.',
      },
    ];
  }
  return [];
}

function checkRedisSentinelQuorum(config: BeaconLogConfig): CheckResult[] {
  return (config.redis?.instances ?? [])
    .filter(
      (i): i is Extract<typeof i, { mode: 'sentinel' }> => i.mode === 'sentinel'
    )
    .flatMap((i) => {
      const count = (i.sentinels ?? []).length;
      if (count < 2) {
        return [
          {
            level: 'WARN',
            title: 'Redis Sentinel Quorum Too Small',
            message: `Instance "${i.instanceName}" has only ${count} sentinel node(s).`,
            recommendation:
              'Configure at least 2-3 sentinel nodes for fail-over reliability.',
          },
        ];
      }
      return [];
    });
}

function checkRedisClusterParity(config: BeaconLogConfig): CheckResult[] {
  return (config.redis?.instances ?? [])
    .filter(
      (i): i is Extract<typeof i, { mode: 'cluster' }> => i.mode === 'cluster'
    )
    .flatMap((i) => {
      const count = (i.rootNodes ?? []).length;
      if (count > 0 && count % 2 === 0) {
        return [
          {
            level: 'INFO',
            title: 'Redis Cluster Even Node Count',
            message: `Instance "${i.instanceName}" has ${count} nodes; an odd number helps prevent split-brain issues.`,
            recommendation:
              'Consider adding or removing a node to reach an odd number (3, 5, 7, etc.).',
          },
        ];
      }
      return [];
    });
}

function checkSensitiveBodyFields(config: BeaconLogConfig): CheckResult[] {
  if (
    config.http &&
    (!config.http.sensitiveBodyFields ||
      config.http.sensitiveBodyFields.length === 0)
  ) {
    return [
      {
        level: 'INFO',
        title: 'No Sensitive Body Fields Defined',
        message:
          'The "sensitiveBodyFields" list is empty; personal data may leak in request/response bodies.',
        recommendation:
          'Add typical fields such as "password", "token", "ssn" to ensure masking.',
      },
    ];
  }
  return [];
}

/* ------------------------------------------------------------------------- */
/* REGLAS NUEVAS Y REVISADAS                                                 */
/* ------------------------------------------------------------------------- */

function checkRedisInstanceNameUniqueness(
  config: BeaconLogConfig
): CheckResult[] {
  const names = (config.redis?.instances ?? []).map((i) => i.instanceName);
  const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
  if (duplicates.length > 0) {
    return [
      {
        level: 'ERROR',
        title: 'Duplicate Redis instanceName',
        message: `The following Redis instanceName values appear more than once: ${[...new Set(duplicates)].join(', ')}.`,
        recommendation:
          'Ensure each Redis instance has a unique "instanceName".',
      },
    ];
  }
  return [];
}

function checkRegexPatterns(config: BeaconLogConfig): CheckResult[] {
  const patterns = [
    ...(config.customSensitivePatterns ?? []),
    ...(config.http?.sensitiveHeaderPatterns ?? []),
    ...(config.http?.sensitiveBodyFieldPatterns ?? []),
  ];
  const invalidPatterns = patterns.filter((p) => {
    if (typeof p !== 'string' || !p) return false;
    try {
      new RegExp(p);
      return false;
    } catch {
      return true;
    }
  });

  if (invalidPatterns.length > 0) {
    return [
      {
        level: 'ERROR',
        title: 'Invalid Regular Expression Pattern',
        message: `One or more string patterns provided for sanitization are not valid regular expressions: ${invalidPatterns.join(', ')}.`,
        recommendation:
          'Verify each pattern compiles correctly (e.g., test with regex101.com) or use plain strings.',
      },
    ];
  }
  return [];
}

function checkFileTransportPath(config: BeaconLogConfig): CheckResult[] {
  const fileTransports = (config.logger?.transports ?? []).filter(
    (t: any) => t.type === 'file'
  );

  return fileTransports.flatMap((t: any): CheckResult[] => {
    const path = t.options?.filePath as string | undefined;
    if (!path) {
      return [
        {
          level: 'ERROR',
          title: 'File Transport Missing Path',
          message:
            'A "file" transport is configured but "filePath" is not provided.',
          recommendation:
            'Add the "filePath" property (e.g., "./logs/app.log").',
        },
      ];
    }
    // Check if the directory of the file path exists.
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir && !fs.existsSync(dir)) {
      return [
        {
          level: 'WARN',
          title: 'File Path Directory Does Not Exist',
          message: `The directory for path "${path}" does not exist; BeaconLog will attempt to create it at runtime.`,
          recommendation:
            'Ensure the base directory exists and BeaconLog has write permissions.',
        },
      ];
    }
    return [];
  });
}
// This function is not used in the current version of the code.
function checkTimeoutRanges(config: BeaconLogConfig): CheckResult[] {
  const results: CheckResult[] = [];
  const httpTimeout = config.http?.timeoutMs;
  if (httpTimeout && (httpTimeout < 100 || httpTimeout > 60000)) {
    results.push({
      level: 'INFO',
      title: 'Suspicious HTTP Timeout',
      message: `HTTP timeout is set to ${httpTimeout} ms, which is outside the typical range.`,
      recommendation:
        'Consider using a value between 100 and 60000 ms unless you have a specific reason.',
    });
  }

  (config.redis?.instances ?? []).forEach((instance) => {
    // Only check retryOptions for 'single' and 'sentinel' modes as 'cluster' does not have it.
    if (instance.mode === 'single' || instance.mode === 'sentinel') {
      const redisTimeout = instance.retryOptions?.retryDelay;
      if (redisTimeout && (redisTimeout < 50 || redisTimeout > 30000)) {
        results.push({
          level: 'INFO',
          title: 'Suspicious Redis Timeout',
          message: `Redis instance "${instance.instanceName}" has a retryDelay of ${redisTimeout} ms.`,
          recommendation:
            'Consider using a value between 50 and 30000 ms to balance latency and fail-over time.',
        });
      }
    }
  });

  return results;
}

function checkWhitespaceInValues(config: BeaconLogConfig): CheckResult[] {
  const results: CheckResult[] = [];
  const keysToCheck = [
    'instanceName',
    'serviceName',
    'correlationKey',
    'correlationIdHeader',
    'name',
    'url',
  ];

  function inspect(obj: any, path: string[]) {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        const newPath = [...path, key];

        if (
          keysToCheck.includes(key) &&
          typeof value === 'string' &&
          value.trim() !== value
        ) {
          results.push({
            level: 'WARN',
            title: 'Leading/Trailing Whitespace Detected',
            message: `The value for "${newPath.join('.')}" has leading or trailing whitespace ("${value}").`,
            recommendation:
              'Remove the extra whitespace to prevent potential connection or identification issues.',
          });
        }

        if (typeof value === 'object') {
          inspect(value, newPath);
        }
      }
    }
  }

  inspect(config, []);
  return results;
}
