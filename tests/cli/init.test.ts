/**
 * FILE: tests/cli/init.test.ts
 * DESCRIPTION: Unit tests for the init command logic (init.ts).
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mocked,
  SpyInstance,
} from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';
import {
  getDoctorManifestTemplate,
  getAuditPlanTemplate,
} from '../../src/cli/templates';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('inquirer');
vi.mock('../../src/cli/templates');

import { runInit } from '../../src/cli/init';

// Typed mocks
const mockFsAccess = vi.mocked(fs.access);
const mockFsReadFile = vi.mocked(fs.readFile);
const mockFsWriteFile = vi.mocked(fs.writeFile);
const mockInquirerPrompt = vi.mocked(inquirer.prompt);
const mockGetDoctorManifestTemplate = vi.mocked(getDoctorManifestTemplate);
const mockGetAuditPlanTemplate = vi.mocked(getAuditPlanTemplate);

const MOCK_CWD = '/mock/project';

describe('CLI: runInit', () => {
  let mockConsoleLog: SpyInstance;
  let mockConsoleError: SpyInstance;
  let mockIsTTY: SpyInstance;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock process and console
    vi.spyOn(process, 'cwd').mockReturnValue(MOCK_CWD);
    // In a non-interactive environment (like a test runner), `process.stdout.isTTY`
    // can be undefined. We need to ensure the property exists before spying on it.
    // We make it configurable so that `vi.spyOn` can work correctly.
    if (!Object.prototype.hasOwnProperty.call(process.stdout, 'isTTY')) {
      Object.defineProperty(process.stdout, 'isTTY', {
        configurable: true,
        value: true, // Default to TTY for most tests
      });
    }
    mockIsTTY = vi.spyOn(process.stdout, 'isTTY', 'get').mockReturnValue(true); // Default to interactive
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Default mock implementations for a clean state
    mockFsAccess.mockRejectedValue(new Error('File not found'));
    mockFsReadFile.mockRejectedValue(new Error('File not found'));
    mockFsWriteFile.mockResolvedValue(undefined);
    mockGetDoctorManifestTemplate.mockReturnValue('doctor-template');
    mockGetAuditPlanTemplate.mockReturnValue('audit-template');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Project Detection and Prompting', () => {
    it('should detect a TS/ESM project and use detected values in non-interactive mode', async () => {
      mockIsTTY.mockReturnValue(false);
      mockFsAccess.mockResolvedValue(undefined); // tsconfig.json exists
      mockFsReadFile.mockResolvedValue(JSON.stringify({ type: 'module' })); // package.json is ESM

      await runInit({ rules: true });

      expect(mockInquirerPrompt).not.toHaveBeenCalled();
      expect(mockGetDoctorManifestTemplate).toHaveBeenCalledWith('ts', 'esm');
      expect(mockFsWriteFile).toHaveBeenCalledWith(
        path.resolve(MOCK_CWD, 'syntropylog.doctor.ts'),
        'doctor-template',
        { flag: 'wx' }
      );
    });

    it('should prompt user when in interactive mode', async () => {
      mockInquirerPrompt.mockResolvedValue({
        langChoice: 'JavaScript',
        moduleChoice: 'CommonJS (require/module.exports)',
      });

      await runInit({ audit: true });

      expect(mockInquirerPrompt).toHaveBeenCalledTimes(2);
      expect(mockGetAuditPlanTemplate).toHaveBeenCalledWith('js', 'cjs');
      expect(mockFsWriteFile).toHaveBeenCalledWith(
        path.resolve(MOCK_CWD, 'syntropylog.audit.js'),
        'audit-template',
        { flag: 'wx' }
      );
    });

    it('should skip prompts if lang and module are provided as options', async () => {
      await runInit({ rules: true, lang: 'js', module: 'esm' });

      expect(mockInquirerPrompt).not.toHaveBeenCalled();
      expect(mockGetDoctorManifestTemplate).toHaveBeenCalledWith('js', 'esm');
      expect(mockFsWriteFile).toHaveBeenCalledWith(
        path.resolve(MOCK_CWD, 'syntropylog.doctor.mjs'),
        'doctor-template',
        { flag: 'wx' }
      );
    });
  });

  describe('File Generation', () => {
    it('should generate a doctor manifest for a TS project', async () => {
      await runInit({ rules: true, lang: 'ts', module: 'esm' });

      expect(mockGetDoctorManifestTemplate).toHaveBeenCalledWith('ts', 'esm');
      expect(mockFsWriteFile).toHaveBeenCalledWith(
        path.resolve(MOCK_CWD, 'syntropylog.doctor.ts'),
        'doctor-template',
        { flag: 'wx' }
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Successfully created manifest')
      );
    });

    it('should generate an audit plan for a JS/ESM project', async () => {
      await runInit({ audit: true, lang: 'js', module: 'esm' });

      expect(mockGetAuditPlanTemplate).toHaveBeenCalledWith('js', 'esm');
      expect(mockFsWriteFile).toHaveBeenCalledWith(
        path.resolve(MOCK_CWD, 'syntropylog.audit.mjs'),
        'audit-template',
        { flag: 'wx' }
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Successfully created manifest')
      );
    });

    it('should generate an audit plan for a JS/CJS project', async () => {
      await runInit({ audit: true, lang: 'js', module: 'cjs' });

      expect(mockGetAuditPlanTemplate).toHaveBeenCalledWith('js', 'cjs');
      expect(mockFsWriteFile).toHaveBeenCalledWith(
        path.resolve(MOCK_CWD, 'syntropylog.audit.js'),
        'audit-template',
        { flag: 'wx' }
      );
    });
  });

  describe('Error Handling', () => {
    it('should log a warning if the manifest file already exists', async () => {
      const eexistError = new Error('File already exists');
      (eexistError as any).code = 'EEXIST';
      mockFsWriteFile.mockRejectedValue(eexistError);

      // Since `lang` is provided but `module` is not, the interactive prompt for
      // the module system will be triggered. We need to mock its response.
      mockInquirerPrompt.mockResolvedValueOnce({ moduleChoice: 'ESM (import/export)' });

      await runInit({ rules: true, lang: 'ts' });

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining(
          'A `syntropylog.doctor.ts` file already exists. No changes were made.'
        )
      );
      expect(mockConsoleLog).not.toHaveBeenCalledWith(
        expect.stringContaining('Successfully created manifest')
      );
    });

    it('should log a generic error if file creation fails for other reasons', async () => {
      const genericError = new Error('Disk is full');
      mockFsWriteFile.mockRejectedValue(genericError);

      // Similar to the test above, we mock the response for the module prompt
      // as it's the only one that will be triggered.
      mockInquirerPrompt.mockResolvedValueOnce({ moduleChoice: 'CommonJS (require/module.exports)' });

      await runInit({ audit: true, lang: 'js' });

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create manifest file.'),
        genericError
      );
    });

    it('should detect typescript if it is a dev dependency in package.json', async () => {
      mockIsTTY.mockReturnValue(false);
      // No tsconfig.json, so fs.access will reject (the default mock behavior)
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({ devDependencies: { typescript: '^5.0.0' } })
      );

      await runInit({ rules: true });

      // Should correctly detect 'ts' without prompting
      expect(mockGetDoctorManifestTemplate).toHaveBeenCalledWith('ts', 'cjs');
    });
  });
});