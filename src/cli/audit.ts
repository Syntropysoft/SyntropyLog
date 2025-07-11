/*
 * @file src/cli/audit.ts
 * @description Contains the logic for the `audit` command. It finds and executes the
 * `syntropylog.audit.ts` manifest, running `runDoctor` for each defined job.
 */
import path from 'path';
import chalk from 'chalk';
import { runDoctor } from './doctor';
import { DiagnosticRule } from './checks';

/**
 * @interface AuditJob
 * @description Defines the structure for a single audit task within an audit plan.
 */
interface AuditJob {
  /** A descriptive name for the audit job (e.g., "Production Config Check"). */
  name: string;
  /** The path to the configuration file to be analyzed for this job. */
  configFile: string;
  /** The array of diagnostic rules to run against the configuration file. */
  rules: DiagnosticRule[];
}

const AUDIT_FILE_NAME = 'syntropylog.audit.ts';

/**
 * Executes the main audit process. It loads the `syntropylog.audit.ts` file,
 * iterates through each defined job, and runs the `runDoctor` engine for it.
 * Logs progress and results to the console and exits with a non-zero status code if any job fails.
 */
export async function runAudit(): Promise<void> {
  console.log(chalk.cyan.bold('🚀 Starting SyntropyLog Audit...'));

  const manifestPath = path.resolve(process.cwd(), AUDIT_FILE_NAME);
  let auditJobs: AuditJob[];

  try {
    // We add a timestamp to the import path to bypass Node's module cache,
    // ensuring we always load the latest version of the user's manifest.
    const manifestModule = await import(`${manifestPath}?t=${Date.now()}`);
    auditJobs = manifestModule.default;
    if (!Array.isArray(auditJobs)) {
      throw new Error(
        `The default export of ${AUDIT_FILE_NAME} must be an array of audit jobs.`
      );
    }
    console.log(
      chalk.green(`✅ Found and loaded audit manifest: ${manifestPath}`)
    );
  } catch (error) {
    console.error(
      chalk.red.bold(
        `❌ Error: Could not load the audit manifest file at "${manifestPath}".`
      )
    );
    console.error(
      chalk.gray(
        'Please create a `syntropylog.audit.ts` file or run `npx syntropylog init --audit` to generate one.'
      )
    );
    if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') {
      console.error(chalk.gray((error as Error).message));
    }
    process.exit(1);
    return; // Exit the function to prevent further execution in test environments
  }

  let totalErrors = 0;

  for (const job of auditJobs) {
    console.log(
      chalk.yellow.bold(`\n--- Running Audit Job: "${job.name}" ---`)
    );
    const jobPassed = await runDoctor({
      configPath: job.configFile,
      rules: job.rules,
      isAuditJob: true,
    });

    if (!jobPassed) {
      totalErrors++;
    }
  }

  if (totalErrors > 0) {
    console.error(
      chalk.bgRed.white.bold(
        `\n🚨 Audit finished with ${totalErrors} job(s) containing errors.`
      )
    );
    process.exit(1);
  } else {
    console.log(
      chalk.bgGreen.black.bold(
        '\n✅ Audit finished successfully. All jobs passed!'
      )
    );
  }
}
