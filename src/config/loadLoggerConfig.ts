import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { LoggerOptions } from '../types';

/**
 * Defines the options for customizing the logger configuration loading behavior.
 */
export interface LoggerConfigLoaderOptions {
  /**
   * Explicit absolute path to the configuration file.
   * If provided, this takes highest precedence.
   */
  configPath?: string;
  /**
   * The explicit environment name used to determine the environment-specific
   * suffix for the config file name (e.g., 'production').
   */
  environment?: string;
  /**
   * The directory where the configuration files are located.
   * @default './config'
   */
  configDir?: string;
  /**
   * The base name for the configuration file (e.g., 'logger' results in 'logger.yaml'
   * or 'logger-production.yaml').
   * @default 'logger'
   */
  defaultBase?: string;
}

/**
 * Loads logger configuration from a YAML file.
 * The function determines the file path with the following priority:
 * 1. The explicit path provided in `opts.configPath`.
 * 2. The environment-specific path (e.g., `{configDir}/{defaultBase}-{environment}.yaml`).
 * 3. The default base path (e.g., `{configDir}/{defaultBase}.yaml`).
 *
 * It does NOT read environment variables directly; all state must be passed via `opts`.
 * If no file is found, it returns an empty object, making the config file optional.
 * @param opts - Options to customize the loading behavior.
 * @returns A partial `LoggerOptions` object, or an empty object if no file is found.
 * @throws An error if a config file is found but fails to be read or parsed.
 */
export function loadLoggerConfig(
  opts?: LoggerConfigLoaderOptions
): Partial<LoggerOptions> {
  const {
    configPath: explicitConfigPath,
    environment,
    configDir = './config',
    defaultBase = 'logger',
  } = opts || {};

  // 1. Check for the direct explicit path.
  let configPath: string | undefined;
  if (explicitConfigPath && fs.existsSync(explicitConfigPath)) {
    configPath = explicitConfigPath;
  }

  // 2. If not found, check for an explicit environment-specific file.
  if (!configPath && environment) {
    const envSpecificPath = path.join(
      configDir,
      `${defaultBase}-${environment}.yaml`
    );
    if (fs.existsSync(envSpecificPath)) {
      configPath = envSpecificPath;
    }
  }

  // 3. If still not found, check for the default base file.
  if (!configPath) {
    const defaultPath = path.join(configDir, `${defaultBase}.yaml`);
    if (fs.existsSync(defaultPath)) {
      configPath = defaultPath;
    }
  }

  // If no configuration file was found after all checks, return an empty object.
  if (!configPath) {
    return {};
  }

  try {
    // Load and parse the YAML file.
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const yamlConfig = yaml.load(fileContents) as Record<
      string,
      unknown
    > | null;

    // If the YAML has the config under a 'logger' key, extract it.
    // Otherwise, assume the root object is the configuration.
    return yamlConfig?.logger || yamlConfig || {};
  } catch (error: unknown) {
    throw new Error(
      `[BeaconLog] Failed to load or parse config file at ${configPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
