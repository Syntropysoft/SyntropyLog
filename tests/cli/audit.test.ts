import { describe, it, expect, vi, beforeEach, afterEach, SpyInstance } from 'vitest';
import path from 'path';
import { runAudit } from '../../src/cli/audit';
import * as doctor from '../../src/cli/doctor';

// Mock the doctor module completely
vi.mock('../../src/cli/doctor');

// Define a predictable path for the manifest. This path will be mocked for dynamic imports.
const MOCK_CWD = '/mock/project/root';
const AUDIT_FILE_NAME = 'syntropylog.audit.ts';
const MANIFEST_PATH = path.resolve(MOCK_CWD, AUDIT_FILE_NAME);

describe('CLI: runAudit', () => {
  let consoleLogSpy: SpyInstance<any[], any>;
  let consoleErrorSpy: SpyInstance<any[], any>;
  let processExitSpy: SpyInstance<[code?: string | number | null | undefined], never>;

  const mockJobs = [
    { name: 'Production Job', configFile: 'config.prod.json', rules: [{ id: 'rule1' }] },
    { name: 'Staging Job', configFile: 'config.stage.json', rules: [{ id: 'rule2' }] },
  ];

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Spy on console and process methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: string | number | null | undefined) => never);
    
    // Mock process.cwd() to control the manifest path resolution
    vi.spyOn(process, 'cwd').mockReturnValue(MOCK_CWD);
  });

  afterEach(() => {
    // Restore original implementations to avoid test pollution
    vi.restoreAllMocks();
  });

  it('should run all jobs successfully and not exit with an error code', async () => {
    // Arrange: Mock a valid manifest and a successful doctor run
    vi.doMock(MANIFEST_PATH, () => ({ default: mockJobs }));
    vi.mocked(doctor.runDoctor).mockResolvedValue(true);

    // Act
    await runAudit();

    // Assert
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Starting SyntropyLog Audit'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Found and loaded audit manifest: ${MANIFEST_PATH}`));
    expect(doctor.runDoctor).toHaveBeenCalledTimes(2);
    expect(doctor.runDoctor).toHaveBeenCalledWith({
      configPath: mockJobs[0].configFile,
      rules: mockJobs[0].rules,
      isAuditJob: true,
    });
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Audit finished successfully. All jobs passed!'));
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('should exit with code 1 if any job fails', async () => {
    // Arrange: Mock one successful and one failed job
    vi.doMock(MANIFEST_PATH, () => ({ default: mockJobs }));
    vi.mocked(doctor.runDoctor)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    // Act
    await runAudit();

    // Assert
    expect(doctor.runDoctor).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Audit finished with 1 job(s) containing errors.'));
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should exit with code 1 if manifest is not found', async () => {
    // Arrange: Mock the import to throw a module-not-found error
    const error = new Error('Module not found');
    (error as any).code = 'ERR_MODULE_NOT_FOUND';
    vi.doMock(MANIFEST_PATH, () => { throw error; });

    // Act
    await runAudit();

    // Assert
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Could not load the audit manifest file at "${MANIFEST_PATH}"`));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Please create a `syntropylog.audit.ts` file'));
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should exit with code 1 if manifest default export is not an array', async () => {
    // Arrange: Mock a manifest with an invalid export
    vi.doMock(MANIFEST_PATH, () => ({ default: { not: 'an array' } }));

    // Act
    await runAudit();

    // Assert
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`The default export of ${AUDIT_FILE_NAME} must be an array of audit jobs.`));
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should exit with code 1 for a generic manifest load error and log the error message', async () => {
    // Arrange: Mock a module that throws an error when its default export is accessed.
    // This simulates a malformed module and tests the generic error path in the catch block,
    // which is more reliable than trying to make the import() itself throw a generic error.
    const genericError = new Error('Invalid module structure');
    vi.doMock(MANIFEST_PATH, () => ({
      get default() {
        throw genericError;
      },
    }));

    // Act
    await runAudit();

    // Assert
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Could not load the audit manifest file at "${MANIFEST_PATH}"`));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(genericError.message));
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});