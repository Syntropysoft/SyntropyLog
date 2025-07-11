/**
 * FILE: tests/config/loadLoggerConfig.test.ts
 * DESCRIPTION: Unit tests for the logger configuration loader.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { loadLoggerConfig } from '../../src/config/loadLoggerConfig';

// Mock the 'fs' module to control file system interactions
vi.mock('fs');
// Mock 'js-yaml' to prevent mock pollution from other test files (e.g., doctor.test.ts)
// and to gain explicit control over its behavior for our test cases.
vi.mock('js-yaml');

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockYamlLoad = vi.mocked(yaml.load);

describe('loadLoggerConfig', () => {
  // Store original environment variables to restore after each test
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset mocks and environment to ensure test isolation
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should return an empty object if no config file is found', () => {
    // Unset NODE_ENV for this test to ensure we only check the default path
    delete process.env.NODE_ENV;

    mockExistsSync.mockReturnValue(false);
    const config = loadLoggerConfig();

    expect(config).toEqual({});
    // Verify it checked the default path
    expect(mockExistsSync).toHaveBeenCalledWith(path.join('./config', 'logger.yaml'));
  });

  it('should load from the path specified by configPathEnvVar if set (highest priority)', () => {
    const customPath = '/etc/my-app/special-config.yaml';
    process.env.LOGGER_CONFIG = customPath;
    const yamlContent = 'level: debug';
    const expectedConfig = { level: 'debug' };

    // Mock only the specific path that should be checked
    mockExistsSync.mockImplementation((p) => p === customPath);
    mockReadFileSync.mockReturnValue(yamlContent);
    mockYamlLoad.mockReturnValue(expectedConfig);

    const config = loadLoggerConfig();

    expect(mockExistsSync).toHaveBeenCalledWith(customPath);
    expect(mockReadFileSync).toHaveBeenCalledWith(customPath, 'utf8');
    expect(config).toEqual(expectedConfig);
  });

  it('should load from an environment-specific file if fallbackEnvVar is set', () => {
    process.env.NODE_ENV = 'production';
    const expectedPath = path.join('./config', 'logger-production.yaml');
    const yamlContent = 'level: info';
    const expectedConfig = { level: 'info' };

    mockExistsSync.mockImplementation((p) => p === expectedPath);
    mockReadFileSync.mockReturnValue(yamlContent);
    mockYamlLoad.mockReturnValue(expectedConfig);

    const config = loadLoggerConfig();

    expect(mockExistsSync).toHaveBeenCalledWith(expectedPath);
    expect(mockReadFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');
    expect(config).toEqual(expectedConfig);
  });

  it('should load from the default file if no env vars are set', () => {
    // Unset NODE_ENV to ensure we test the true default path, not the one
    // modified by the test runner (which sets NODE_ENV='test').
    delete process.env.NODE_ENV;
    const expectedPath = path.join('./config', 'logger.yaml');
    const yamlContent = 'level: warn';
    const expectedConfig = { level: 'warn' };

    mockExistsSync.mockImplementation((p) => p === expectedPath);
    mockReadFileSync.mockReturnValue(yamlContent);
    mockYamlLoad.mockReturnValue(expectedConfig);

    const config = loadLoggerConfig();

    expect(mockExistsSync).toHaveBeenCalledWith(expectedPath);
    expect(mockReadFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');
    expect(config).toEqual(expectedConfig);
  });

  it('should respect custom options for directories, names, and env vars', () => {
    process.env.MY_APP_ENV = 'staging';
    const opts = {
      configPathEnvVar: 'MY_CONFIG_PATH',
      fallbackEnvVar: 'MY_APP_ENV',
      configDir: '/opt/app/settings',
      defaultBase: 'app-config',
    };
    const expectedPath = path.join(opts.configDir, 'app-config-staging.yaml');
    const yamlContent = 'level: trace';
    const expectedConfig = { level: 'trace' };

    mockExistsSync.mockImplementation((p) => p === expectedPath);
    mockReadFileSync.mockReturnValue(yamlContent);
    mockYamlLoad.mockReturnValue(expectedConfig);

    const config = loadLoggerConfig(opts);

    expect(mockExistsSync).toHaveBeenCalledWith(expectedPath);
    expect(config).toEqual(expectedConfig);
  });

  it('should extract config from a top-level "logger" key in the YAML', () => {
    const expectedPath = path.join('./config', 'logger.yaml');
    const loggerSettings = { level: 'error', serializerTimeoutMs: 50 };
    // Since yaml.dump is also mocked, we use a simple string for the content.
    const yamlContent = 'logger:\n  level: error\n  serializerTimeoutMs: 50';
    const yamlObject = { logger: loggerSettings };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(yamlContent);
    mockYamlLoad.mockReturnValue(yamlObject);

    const config = loadLoggerConfig();

    expect(config).toEqual(loggerSettings);
  });

  it('should return the root object if no "logger" key exists', () => {
    const expectedPath = path.join('./config', 'logger.yaml');
    const rootSettings = { level: 'fatal' };
    const yamlContent = 'level: fatal';

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(yamlContent);
    mockYamlLoad.mockReturnValue(rootSettings);

    const config = loadLoggerConfig();

    expect(config).toEqual(rootSettings);
  });

  it('should throw a detailed error if the config file is invalid YAML', () => {
    // Unset NODE_ENV para asegurar que probamos la ruta por defecto, no la
    // modificada por el runner de tests (que establece NODE_ENV='test').
    delete process.env.NODE_ENV;
    const expectedPath = path.join('./config', 'logger.yaml');
    const invalidYaml = 'level: debug\n  bad-indent';

    mockExistsSync.mockImplementation((p) => p === expectedPath);
    mockReadFileSync.mockReturnValue(invalidYaml);

    // Simulate the behavior of the real js-yaml library, which throws on parse error.
    mockYamlLoad.mockImplementation(() => {
      throw new Error('Simulated YAML Parse Error');
    });

    // Use `toThrowError` to check if the error message *contains* our expected text.
    // This is necessary because our function appends the original error message.
    expect(() => loadLoggerConfig()).toThrowError(
      `[BeaconLog] Failed to load or parse config file at ${expectedPath}`
    );
  });
});