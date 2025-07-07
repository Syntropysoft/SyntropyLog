/*
=============================================================================
ARCHIVO 6: src/cli/doctor.ts (MODIFICADO - EL MOTOR)
-----------------------------------------------------------------------------
DESCRIPTION (en-US):
The doctor is refactored to be a reusable engine. It now dynamically loads
a local rule manifest (`beaconlog.doctor.ts`) if it exists, or falls back to
the core rules. It returns a boolean for success/failure, allowing it to be
called by `audit`.
=============================================================================
*/
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import chalk from 'chalk';
import { ZodError } from 'zod';
// We assume config.schema is in the parent directory, adjust if necessary
import { beaconLogConfigSchema } from '../config.schema';
import { runAllChecks, CheckResult, DiagnosticRule, coreRules } from './checks';

interface DoctorOptions {
  configPath: string;
  rules?: DiagnosticRule[];
  isAuditJob?: boolean;
}

async function loadRules(): Promise<DiagnosticRule[]> {
  const manifestPath = path.resolve(process.cwd(), 'beaconlog.doctor.ts');
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

export async function runDoctor(options: DoctorOptions): Promise<boolean> {
  const { configPath, rules, isAuditJob = false } = options;
  if (!isAuditJob) {
    console.log(
      chalk.cyan.bold(`🩺 Running beaconlog doctor on: ${configPath}\n`)
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
    validatedConfig = beaconLogConfigSchema.parse(configData);
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
