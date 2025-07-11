/**
 * FILE: src/cli/cli.test.ts
 * DESCRIPTION: Unit tests for the main CLI entry point (cli.ts).
 */

// Mock the implementation modules before any other imports.
// This replaces the actual functions with mock functions.
import { describe, it, expect, vi, afterEach, beforeEach, type Mock } from 'vitest';

vi.mock('../../src/cli/init', () => ({
  runInit: vi.fn(),
}));
vi.mock('../../src/cli/doctor', () => ({
  runDoctor: vi.fn(),
}));
vi.mock('../../src/cli/audit', () => ({
  runAudit: vi.fn(),
}));

import { runInit } from '../../src/cli/init';
import { runDoctor } from '../../src/cli/doctor';
import { runAudit } from '../../src/cli/audit';

// Cast the imported mocks to Mock for type-safe access to mock methods.
const mockRunInit = runInit as Mock;
const mockRunDoctor = runDoctor as Mock;
const mockRunAudit = runAudit as Mock;

/**
 * A helper function to parse a command string by simulating `process.argv`
 * and then dynamically importing the CLI script to execute it.
 * @param command The command string to execute (e.g., 'init --rules').
 */
const parse = async (command: string) => {
  // Backup original argv and set up the new one for yargs to parse.
  const originalArgv = process.argv;
  process.argv = ['node', 'syntropylog', ...command.split(' ').filter(Boolean)];

  // By resetting the module cache before a dynamic import, we ensure that
  // the CLI script (which has immediate side effects) is re-executed for each test.
  // This is a robust alternative to `vi.isolateModules`.
  vi.resetModules();
  // Dynamically import the CLI. This triggers yargs to parse `process.argv`
  // and execute the corresponding command handler. The `await` ensures that
  // async handlers complete before the test continues.
  await import('../../src/cli/cli');

  // Restore original argv to not affect other tests.
  process.argv = originalArgv;
};

describe('SyntropyLog CLI', () => {
  let mockExit: vi.SpyInstance;
  let mockConsoleError: vi.SpyInstance;

  beforeEach(() => {
    // Reset all mocks before each test to ensure test isolation.
    vi.clearAllMocks();

    // Spy on and mock implementations of process.exit and console.error.
    // This prevents tests from terminating and allows us to assert on error logging.
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number) => never);
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore the original implementations after each test.
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('init command', () => {
    it('should call runInit with --rules option', async () => {
      await parse('init --rules');
      expect(mockRunInit).toHaveBeenCalledTimes(1);
      // When a boolean option is not provided, yargs sets it to `false`.
      // We use expect.objectContaining to check for specific properties.
      expect(mockRunInit).toHaveBeenCalledWith(
        expect.objectContaining({
          rules: true,
          audit: false,
        })
      );
    });

    it('should call runInit with all options specified', async () => {
      await parse('init --rules --audit --lang ts --module esm');
      expect(mockRunInit).toHaveBeenCalledTimes(1);
      expect(mockRunInit).toHaveBeenCalledWith(
        expect.objectContaining({
          rules: true,
          audit: true,
          lang: 'ts',
          module: 'esm',
        })
      );
    });

    it('should show an error and exit if neither --rules nor --audit is provided', async () => {
      const expectedError = 'You must specify a file to generate. Use --rules or --audit.';
      // yargs with .exitProcess(false) throws on validation failure.
      await expect(parse('init')).rejects.toThrow(expectedError);

      // yargs' .check() failure message is what we expect to see on stderr.
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining(expectedError)
      );
      // process.exit is no longer called by yargs for this type of error
      expect(mockExit).not.toHaveBeenCalled();
      expect(mockRunInit).not.toHaveBeenCalled();
    });

    it('should handle unexpected errors from runInit and exit gracefully', async () => {
      const testError = new Error('Something went wrong during init!');
      mockRunInit.mockRejectedValueOnce(testError);

      await parse('init --rules');

      expect(mockRunInit).toHaveBeenCalledTimes(1);
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('UNEXPECTED ERROR'));
      expect(mockConsoleError).toHaveBeenCalledWith(testError);
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('doctor command', () => {
    it('should call runDoctor with the provided config path', async () => {
      const configPath = 'config/dev.yaml';
      await parse(`doctor ${configPath}`);

      expect(mockRunDoctor).toHaveBeenCalledTimes(1);
      expect(mockRunDoctor).toHaveBeenCalledWith({ configPath });
    });

    it('should show an error and exit if configPath is missing', async () => {
      // The error message from yargs for missing positional arguments
      const expectedError = 'Not enough non-option arguments: got 0, need at least 1';
      await expect(parse('doctor')).rejects.toThrow(expectedError);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining(expectedError)
      );
      expect(mockExit).not.toHaveBeenCalled();
      expect(mockRunDoctor).not.toHaveBeenCalled();
    });

    it('should handle unexpected errors from runDoctor and exit gracefully', async () => {
      const testError = new Error('Doctor is sick!');
      mockRunDoctor.mockRejectedValueOnce(testError);

      await parse('doctor config.yaml');

      expect(mockRunDoctor).toHaveBeenCalledTimes(1);
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('UNEXPECTED ERROR'), testError);
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('audit command', () => {
    it('should call runAudit when the audit command is used', async () => {
      await parse('audit');
      expect(mockRunAudit).toHaveBeenCalledTimes(1);
    });

    it('should handle unexpected errors from runAudit and exit gracefully', async () => {
      const testError = new Error('Audit failed!');
      mockRunAudit.mockRejectedValueOnce(testError);

      await parse('audit');

      expect(mockRunAudit).toHaveBeenCalledTimes(1);
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('UNEXPECTED ERROR'), testError);
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('General CLI Behavior', () => {
    it('should show an error if no command is provided', async () => {
      const expectedError = 'You must provide a command. Try "init", "doctor", or "audit".';
      await expect(parse('')).rejects.toThrow(expectedError);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining(expectedError)
      );
      expect(mockExit).not.toHaveBeenCalled();
    });
  });
});