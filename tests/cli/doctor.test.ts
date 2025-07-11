/**
 * FILE: tests/cli/doctor.test.ts
 * DESCRIPTION: Unit tests for the doctor command engine (doctor.ts).
 */


import {
  describe,
  it,
  expect,
  vi,
  afterEach,
  beforeEach,
} from 'vitest';
import path from 'path';
import { ZodError } from 'zod';

vi.mock('fs');
vi.mock('js-yaml');

vi.mock('../../src/config.schema', () => ({
  syntropyLogConfigSchema: {
    parse: vi.fn(),
  },
}));

vi.mock('../../src/cli/checks', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/cli/checks')>();
  return {
    ...original, // Keep original types and non-function exports
    runAllChecks: vi.fn(),
    coreRules: [
      { id: 'core-rule', description: 'A core rule', check: () => [] },
    ],
  };
});

// =================================================================
// 2. Imports DESPUÉS de los mocks.
// =================================================================
import fs from 'fs';
import yaml from 'js-yaml';
import { syntropyLogConfigSchema } from '../../src/config.schema';
import { runAllChecks, coreRules } from '../../src/cli/checks';
import { runDoctor } from '../../src/cli/doctor';

// =================================================================
// 3. Constantes y referencias tipadas a los mocks.
// =================================================================
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockYamlLoad = vi.mocked(yaml.load);
const mockSchemaParse = vi.mocked(syntropyLogConfigSchema.parse);
const mockRunAllChecks = vi.mocked(runAllChecks);

const MOCK_CWD = '/mock/project/root';
const MOCK_MANIFEST_PATH = path.resolve(MOCK_CWD, 'syntropylog.doctor.ts');
const MOCK_CONFIG_PATH = 'config.yaml';
const MOCK_VALID_CONFIG = { logger: { level: 'info', serializerTimeoutMs: 100 } };

describe('runDoctor', () => {
  let mockExit: vi.SpyInstance;
  let mockConsoleLog: vi.SpyInstance;
  let mockConsoleError: vi.SpyInstance;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock `process.cwd()` para controlar la resolución de rutas.
    vi.spyOn(process, 'cwd').mockReturnValue(MOCK_CWD);

    mockExit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as (code?: number) => never);
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Configuración por defecto para el "happy path" en cada test.
    mockReadFileSync.mockReturnValue('logger:\n  level: info');
    mockYamlLoad.mockReturnValue(MOCK_VALID_CONFIG);
    mockSchemaParse.mockReturnValue(MOCK_VALID_CONFIG);
    mockRunAllChecks.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks(); // Restaura process.cwd() y otros spies.
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  // ... your tests
  it('should return true and log success when config is valid and has no issues', async () => {
    const result = await runDoctor({ configPath: MOCK_CONFIG_PATH });

    expect(result).toBe(true);
    expect(mockReadFileSync).toHaveBeenCalledWith(
      path.resolve(MOCK_CWD, MOCK_CONFIG_PATH),
      'utf8'
    );
    expect(mockSchemaParse).toHaveBeenCalledWith(MOCK_VALID_CONFIG);
    expect(mockRunAllChecks).toHaveBeenCalledWith(MOCK_VALID_CONFIG, coreRules);
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('✅ Config structure for "config.yaml" is valid.')
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('✨ No issues found.')
    );
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should return false and call process.exit(1) if errors are found', async () => {
    const errorResult = [{ level: 'ERROR', title: 'Big Problem' }];
    mockRunAllChecks.mockReturnValue(errorResult);

    await runDoctor({ configPath: MOCK_CONFIG_PATH });

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('ERROR')
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('Big Problem')
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should return false but NOT call process.exit if errors are found in audit mode', async () => {
    const errorResult = [{ level: 'ERROR', title: 'Big Problem' }];
    mockRunAllChecks.mockReturnValue(errorResult);

    const result = await runDoctor({
      configPath: MOCK_CONFIG_PATH,
      isAuditJob: true,
    });

    expect(result).toBe(false);
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should exit if config file cannot be read', async () => {
    const readError = new Error('File not found');
    mockReadFileSync.mockImplementation(() => {
      throw readError;
    });

    await runDoctor({ configPath: 'nonexistent.yaml' });

    // Check for specific, ordered error messages to ensure clear user feedback.
    expect(mockConsoleError).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('Could not read file')
    );
    expect(mockConsoleError).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(readError.message)
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it.skip('should exit on Zod validation error', async () => {
    const zodError = new ZodError([
      { path: ['logger', 'level'], message: 'Invalid level', code: 'custom' },
    ]);
    mockSchemaParse.mockImplementation(() => {
      throw zodError;
    });

    await runDoctor({ configPath: MOCK_CONFIG_PATH });

    // The error logging is now more specific, with a title and then the details.
    // We should test each call to console.error to ensure the format is correct.
    expect(mockConsoleError).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`Validation error in "${MOCK_CONFIG_PATH}"`)
    );
    expect(mockConsoleError).toHaveBeenNthCalledWith(
      2,
      // The output is indented and includes the field path and message.
      expect.stringContaining('In field logger.level: Invalid level')
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it.skip('should return false on Zod error in audit mode without exiting', async () => {
    const zodError = new ZodError([
      { path: ['logger', 'level'], message: 'Invalid level', code: 'custom' },
    ]);
    mockSchemaParse.mockImplementation(() => {
      throw zodError;
    });

    const result = await runDoctor({
      configPath: MOCK_CONFIG_PATH,
      isAuditJob: true,
    });

    expect(result).toBe(false);
    expect(mockExit).not.toHaveBeenCalled();
    // Verify that the detailed error was logged, even in audit mode.
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining(`Validation error in "${MOCK_CONFIG_PATH}"`)
    );
    expect(mockConsoleError).toHaveBeenCalledWith(
      // Check for the specific error message for the invalid field.
      expect.stringContaining('In field logger.level: Invalid level')
    );
  });

  it('should use provided rules instead of loading them', async () => {
    const customRules = [
      { id: 'custom-rule', description: 'A custom rule', check: () => [] },
    ];

    await runDoctor({ configPath: MOCK_CONFIG_PATH, rules: customRules });

    expect(mockRunAllChecks).toHaveBeenCalledWith(
      MOCK_VALID_CONFIG,
      customRules
    );
    // Check that it didn't try to load rules
    expect(mockConsoleLog).not.toHaveBeenCalledWith(
      expect.stringContaining('Loaded local rule manifest')
    );
    expect(mockConsoleLog).not.toHaveBeenCalledWith(
      expect.stringContaining('using core rules')
    );
  });

  // This test relies on the dynamic import in `loadRules` failing, which is the default
  // behavior in Vitest when the module isn't explicitly mocked.
  it('should fall back to core rules when no local manifest is found', async () => {
    await runDoctor({ configPath: MOCK_CONFIG_PATH });

    expect(mockRunAllChecks).toHaveBeenCalledWith(MOCK_VALID_CONFIG, coreRules);
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('No local rule manifest found, using core rules.')
    );
  });

  // To test loading a local manifest, we can use vi.doMock for a specific test
  it('should load rules from a local manifest if it exists', async () => {
    const localRules = [
      { id: 'local-rule', description: 'A local rule', check: () => [] },
    ];

    // Para que el mock del import dinámico sea fiable, necesitamos que el path
    // sea predecible. Controlamos `Date.now()` para asegurarnos de que el timestamp
    // en el test coincida con el que se usará en `runDoctor`.
    const FAKE_TIMESTAMP = 1234567890;
    vi.spyOn(Date, 'now').mockReturnValue(FAKE_TIMESTAMP);

    const manifestImportPath = `${MOCK_MANIFEST_PATH}?t=${FAKE_TIMESTAMP}`;

    // Usamos vi.doMock para un mock dinámico que solo afecta a este test.
    // Es crucial usar `vi.doMock` y no `vi.mock` para evitar el hoisting.
    vi.doMock(manifestImportPath, () => ({ default: localRules }), { virtual: true });

    await runDoctor({ configPath: MOCK_CONFIG_PATH });

    expect(mockRunAllChecks).toHaveBeenCalledWith(
      MOCK_VALID_CONFIG, localRules
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('Loaded local rule manifest.')
    );

    // No es necesario llamar a vi.unmock(manifestImportPath) aquí.
    // El mock creado con `vi.doMock` es temporal y no se "filtrará" a otros tests.
    // De hecho, `vi.unmock` también es "hoisted" (elevado) por Vitest, lo que causa
    // el ReferenceError porque `manifestImportPath` no existe al inicio del archivo.
  });
});
