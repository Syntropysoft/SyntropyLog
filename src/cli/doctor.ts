/*
 * @file src/cli/doctor.ts
 * @description The engine for the `doctor` command. It can be used standalone
 * or as part of a larger `audit` job. It loads a configuration file, validates it,
 * and runs a set of diagnostic rules against it.
 */
import fs from 'fs'; // Using sync fs for CLI simplicity, async is not critical here.
import path from 'path';
import yaml from 'js-yaml';
import chalk from 'chalk';
import { ZodError } from 'zod';
import { syntropyLogConfigSchema } from '../config.schema';
import { runAllChecks, CheckResult, DiagnosticRule, coreRules } from './checks';

/**
 * @interface DoctorOptions
 * @description Defines the options for running the doctor engine.
 */
interface DoctorOptions {
  /** The path to the configuration file to analyze. */
  configPath: string;
  /**
   * An optional array of rules to execute. If provided, these rules are used
   * instead of loading from a manifest file. This is used by the `audit` command.
   */
  rules?: DiagnosticRule[];
  /**
   * A flag indicating if the doctor is being run as part of an audit.
   * If true, it suppresses some console output and prevents `process.exit`.
   */
  isAuditJob?: boolean;
}

/**
 * Dynamically loads the `syntropylog.doctor.ts` rule manifest from the current
 * working directory. If the file doesn't exist, it falls back to the `coreRules`.
 * @returns {Promise<DiagnosticRule[]>} A promise that resolves to the array of rules.
 */
async function loadRules(): Promise<DiagnosticRule[]> {
  const manifestPath = path.resolve(process.cwd(), 'syntropylog.doctor.ts');
  try {
    // Bust the cache to always get the freshest version of the rules
    const manifestModule = await import(`${manifestPath}?t=${Date.now()}`);
    console.log(chalk.blue('ℹ️  Loaded local rule manifest.'));
    return manifestModule.default;
  } catch {
    console.log(
      chalk.blue('ℹ️  No local rule manifest found, using core rules.')
    );
    return coreRules;
  }
}

/**
 * The main engine for the doctor command. It reads and validates a config file,
 * runs diagnostic checks, prints the results, and returns a boolean indicating
 * whether the check passed (i.e., no errors were found).
 * @param {DoctorOptions} options - The options for the doctor run.
 * @returns {Promise<boolean>} A promise that resolves to `true` if there are no
 * 'ERROR' level results, and `false` otherwise.
 */
export async function runDoctor(options: DoctorOptions): Promise<boolean> {
  const { configPath, rules, isAuditJob = false } = options;
  if (!isAuditJob) {
    console.log(
      chalk.cyan.bold(`🩺 Running syntropylog doctor on: ${configPath}\n`)
    );
  }

  let fileContent: string;
  try {
    const fullPath = path.resolve(process.cwd(), configPath);
    fileContent = fs.readFileSync(fullPath, 'utf8');
  } catch (error) {
    console.error(
      chalk.red.bold(`❌ Error: Could not read file at "${configPath}".`)
    );
    console.error(chalk.gray((error as Error).message));
    if (!isAuditJob) process.exit(1);
    return false;
  }

  const configData = yaml.load(fileContent);

  let validatedConfig;
  try {
    validatedConfig = syntropyLogConfigSchema.parse(configData);
    console.log(
      chalk.green(`✅ Config structure for "${configPath}" is valid.`)
    );
  } catch (error) {
    if (error instanceof ZodError) {
      console.error(chalk.red.bold(`❌ Validation error in "${configPath}":`));
      error.errors.forEach((e) => {
        const fieldPath = chalk.yellow(e.path.join('.'));
        console.error(`   - In field ${fieldPath}: ${e.message}`);
      });
    } else {
      console.error(
        chalk.red.bold(
          `❌ Unexpected error during validation of "${configPath}":`
        ),
        error
      );
    }
    if (!isAuditJob) process.exit(1);
    return false;
  }

  // If rules are passed directly (from an audit job), use them. Otherwise, load them.
  const rulesToRun = rules ?? (await loadRules());
  const results = runAllChecks(validatedConfig, rulesToRun);

  if (results.length === 0) {
    if (!isAuditJob) console.log(chalk.green.bold('\n✨ No issues found.'));
    else console.log(chalk.green('✨ No issues found for this job.'));
    return true;
  }

  results.forEach(printResult);

  const errorCount = results.filter((r) => r.level === 'ERROR').length;
  if (errorCount > 0) {
    if (!isAuditJob) {
      console.log(
        chalk.red.bold(
          '\nErrors were found. It is highly recommended to fix them before deploying.'
        )
      );
      process.exit(1);
    }
    return false;
  }

  return true;
}

/**
 * A helper function to print a single check result to the console with
 * appropriate colors and formatting based on its severity level.
 * @param {CheckResult} result - The check result to print.
 */
function printResult(result: CheckResult): void {
  const { level, title, message, recommendation } = result;
  let coloredTitle: string;
  switch (level) {
    case 'ERROR':
      coloredTitle = chalk.bgRed.white.bold(` ${level} `);
      break;
    case 'WARN':
      coloredTitle = chalk.bgYellow.black.bold(` ${level} `);
      break;
    case 'INFO':
      coloredTitle = chalk.bgBlue.white.bold(` ${level} `);
      break;
  }
  console.log(`${coloredTitle} ${chalk.bold(title)}`);
  console.log(`   ${chalk.gray('└─')} ${message}`);
  if (recommendation) {
    console.log(`   ${chalk.cyan('💡')} ${chalk.cyan(recommendation)}`);
  }
  console.log('');
}
