import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { LoggerOptions } from '../logger/Logger';

/**
 * Defines the options for customizing the logger configuration loading behavior.
 */
export interface LoggerConfigLoaderOptions {
  /**
   * The name of the environment variable that can hold the full path to the config file.
   * If this variable is set, its value is used directly, taking highest precedence.
   * @default 'LOGGER_CONFIG'
   */
  configPathEnvVar?: string;
  /**
   * The name of the environment variable used to determine the environment-specific
   * suffix for the config file name (e.g., 'NODE_ENV' with a value of 'production').
   * @default 'NODE_ENV'
   */
  fallbackEnvVar?: string;
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
 * 1. The path from the environment variable specified by `configPathEnvVar`.
 * 2. A constructed path: `{configDir}/{defaultBase}-{fallbackEnv}.yaml`.
 * 3. A default path: `{configDir}/{defaultBase}.yaml`.
 *
 * If no file is found, it returns an empty object, making the config file optional.
 * @param opts - Options to customize the loading behavior.
 * @returns A partial `LoggerOptions` object, or an empty object if no file is found.
 * @throws An error if a config file is found but fails to be read or parsed.
 */
export function loadLoggerConfig(opts?: LoggerConfigLoaderOptions): Partial<LoggerOptions> {
  const {
    configPathEnvVar = 'LOGGER_CONFIG',
    fallbackEnvVar = 'NODE_ENV',
    configDir = './config',
    defaultBase = 'logger',
  } = opts || {};

  // Determine the config file name based on environment variables.
  const configFile =
    process.env[configPathEnvVar] ||
    `${defaultBase}${process.env[fallbackEnvVar] ? '-' + process.env[fallbackEnvVar] : ''}.yaml`;

  const configPath = path.join(configDir, configFile);

  if (!fs.existsSync(configPath)) {
    // It's more flexible not to throw an error if the file doesn't exist.
    // The library can then fall back to its default values, making the
    // configuration file optional.
    return {};
  }

  try {
    // Load and parse the YAML file.
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const yamlConfig = yaml.load(fileContents) as Record<string, any> | null;

    // If the YAML has the config under a 'logger' key, extract it.
    // Otherwise, assume the root object is the configuration.
    return yamlConfig?.logger || yamlConfig || {};
  } catch (error: any) {
    throw new Error(`[BeaconLog] Failed to load or parse config file at ${configPath}: ${error.message}`);
  }
}
