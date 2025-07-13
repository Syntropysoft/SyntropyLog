import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import {
  runAllChecks,
  coreRules,
  DiagnosticRule,
} from '../../src/cli/checks';
import { SyntropyLogConfig } from '../../src/config';

// A helper to create a fully valid config object for testing.
// It performs a safe, manual deep merge to ensure nested objects like 'logger'
// are combined correctly, avoiding the pitfalls of a simple Object.assign.
const createMockConfig = (
  overrides: Partial<SyntropyLogConfig> = {}
): SyntropyLogConfig => {
  const base: SyntropyLogConfig = {
    logger: {
      serializerTimeoutMs: 50,
    },
  };

  // Manually merge the nested logger object to ensure defaults are kept.
  const logger =
    overrides.logger != null
      ? { ...base.logger, ...overrides.logger }
      : base.logger;

  return {
    ...base,
  ...overrides,
    logger,
  };
};

// Helper to find a rule from the core set to test it individually
const findRule = (id: string): DiagnosticRule => {
  const rule = coreRules.find((r) => r.id === id);
  if (!rule) {
    // This makes it clear in test failures if a rule ID has changed.
    throw new Error(`Diagnostic rule with ID "${id}" not found.`);
  }
  return rule;
};

describe('CLI: checks', () => {
  describe('runAllChecks', () => {
    it('should run all provided rules and aggregate the results', () => {
      const mockRule1: DiagnosticRule = {
        id: 'rule1',
        description: 'desc1',
        check: vi.fn().mockReturnValue([{ level: 'INFO', title: 'Info 1' }]),
      };
      const mockRule2: DiagnosticRule = {
        id: 'rule2',
        description: 'desc2',
        check: vi.fn().mockReturnValue([{ level: 'WARN', title: 'Warn 1' }]),
      };
      const config: SyntropyLogConfig = {
        logger: { serializerTimeoutMs: 50 },
      };
      const results = runAllChecks(config, [mockRule1, mockRule2]);

      expect(mockRule1.check).toHaveBeenCalledWith(config);
      expect(mockRule2.check).toHaveBeenCalledWith(config);
      expect(results).toHaveLength(2);
      expect(results).toContainEqual({ level: 'INFO', title: 'Info 1' });
      expect(results).toContainEqual({ level: 'WARN', title: 'Warn 1' });
    });

    it('should not run rules that are disabled in the config', () => {
      const mockRule1 = { id: 'rule1', description: 'desc1', check: vi.fn() };
      const mockRule2 = { id: 'rule2', description: 'desc2', check: vi.fn() };
      const config = createMockConfig({
        doctor: { disableRules: ['rule1'] },
      });

      runAllChecks(config, [mockRule1, mockRule2]);

      expect(mockRule1.check).not.toHaveBeenCalled();
      expect(mockRule2.check).toHaveBeenCalled();
    });

    it('should handle rules that throw an error during execution', () => {
      const error = new Error('Something went wrong');
      const failingRule: DiagnosticRule = {
        id: 'failing-rule',
        description: 'This one fails',
        check: vi.fn().mockImplementation(() => {
          throw error;
        }),
      };
      const config = createMockConfig();
      const results = runAllChecks(config, [failingRule]);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        level: 'ERROR',
        title: 'Rule Execution Failed: failing-rule',
        message: `The diagnostic rule itself threw an error: ${error.message}`,
        recommendation:
          'This indicates a bug in the SyntropyLog doctor. Please report it.',
      });
    });
  });

  describe('Core Rule Implementations', () => {
    describe('checkLoggerLevel', () => {
      let rule: DiagnosticRule;
      const originalNodeEnv = process.env.NODE_ENV;

      beforeAll(() => {
        rule = findRule('prod-log-level');
      });

      afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
      });

      it('should return a WARN if NODE_ENV is production and level is debug', () => {
        process.env.NODE_ENV = 'production';
        const config = createMockConfig({
          logger: { level: 'debug' },
        });
        const result = rule.check(config);
        expect(result).toHaveLength(1);
        expect(result[0].level).toBe('WARN');
        expect(result[0].title).toBe('Verbose Logger Level in Production');
      });

      it('should return a WARN if NODE_ENV is production and level is trace', () => {
        process.env.NODE_ENV = 'production';
        const config = createMockConfig({ logger: { level: 'trace' } });
        const result = rule.check(config);
        expect(result).toHaveLength(1);
        expect(result[0].level).toBe('WARN');
      });

      it('should return no results if NODE_ENV is production and level is info', () => {
        process.env.NODE_ENV = 'production';
        const config = createMockConfig({ logger: { level: 'info' } });
        const result = rule.check(config);
        expect(result).toHaveLength(0);
      });

      it('should return no results if NODE_ENV is not production', () => {
        process.env.NODE_ENV = 'development';
        const config = createMockConfig({ logger: { level: 'debug' } });
        const result = rule.check(config);
        expect(result).toHaveLength(0);
      });

      it('should return no results if logger config is missing', () => {
        process.env.NODE_ENV = 'production';
        const config = createMockConfig();
        const result = rule.check(config);
        expect(result).toHaveLength(0);
      });
    });

    describe('checkLoggerTransports', () => {
      let rule: DiagnosticRule;

      beforeAll(() => {
        rule = findRule('no-logger-transports');
      });

      it('should return an ERROR if transports is an empty array', () => {
        const config = createMockConfig({ logger: { transports: [] } });
        const result = rule.check(config);
        expect(result).toHaveLength(1);
        expect(result[0].level).toBe('ERROR');
        expect(result[0].title).toBe('No Logger Transports Defined');
      });

      it('should return no results if transports has items', () => {
        // The type assertion is needed because Transport is an abstract class.
        const config = createMockConfig({
          logger: { transports: [{}] as any },
        });
        const result = rule.check(config);
        expect(result).toHaveLength(0);
      });

      it('should return no results if the transports key is not defined', () => {
        // When 'transports' is missing, the framework uses the default, so no error.
        const config = createMockConfig({ logger: {} });
        const result = rule.check(config);
        expect(result).toHaveLength(0);
      });
    });

    describe('checkMaskingRules', () => {
      let rule: DiagnosticRule;

      beforeAll(() => {
        rule = findRule('no-masking-rules');
      });

      it('should return a WARN if masking.fields is an empty array', () => {
        const config = createMockConfig({ masking: { fields: [] } });
        const result = rule.check(config);
        expect(result).toHaveLength(1);
        expect(result[0].level).toBe('WARN');
        expect(result[0].title).toBe('No Data Masking Rules Defined');
      });

      it('should return a WARN if masking.fields is missing', () => {
        const config = createMockConfig({ masking: {} });
        const result = rule.check(config);
        expect(result).toHaveLength(1);
        expect(result[0].level).toBe('WARN');
      });
    });

    describe('checkRedisSentinel', () => {
      let rule: DiagnosticRule;

      beforeAll(() => {
        rule = findRule('redis-sentinel-name-missing');
      });

      it('should return an ERROR if a sentinel instance is missing a name', () => {
        const config = createMockConfig({
          redis: {
            instances: [{ instanceName: 'my-sentinel', mode: 'sentinel' }],
          },
        });
        const result = rule.check(config);
        expect(result).toHaveLength(1);
        expect(result[0].level).toBe('ERROR');
        expect(result[0].message).toContain('my-sentinel');
      });
    });

    describe('checkRedisInstanceNameUniqueness', () => {
      let rule: DiagnosticRule;

      beforeAll(() => {
        rule = findRule('duplicate-redis-instance-name');
      });

      it('should return an ERROR if instance names are duplicated', () => {
        const config = createMockConfig({
          redis: {
            instances: [
              { instanceName: 'cache' },
              { instanceName: 'session' },
              { instanceName: 'cache' },
            ],
          },
        });
        const result = rule.check(config);
        expect(result).toHaveLength(1);
        expect(result[0].level).toBe('ERROR');
        expect(result[0].message).toContain('cache');
      });
    });
  });
});