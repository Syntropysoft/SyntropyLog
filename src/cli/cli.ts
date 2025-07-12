#!/usr/bin/env node
/**
 * @file src/cli/cli.ts
 * @description This is the main entry point for the Command Line Interface (CLI).
 * It uses `yargs` to define the command structure, options, and handlers.
 * The `#!/usr/bin/env node` shebang at the top is crucial, as it tells the
 * operating system to execute this file using Node.js.
 */
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runDoctor } from './doctor';
import { runAudit } from './audit';
import { runInit } from './init';
import chalk from 'chalk';

yargs(hideBin(process.argv))
  // Set the script name for help messages.
  .scriptName(chalk.cyan('syntropylog'))
  // Prevent yargs from calling `process.exit()` on failures, which is crucial for testing.
  .exitProcess(false)
  // Use English for built-in messages.
  .locale('en')
  /**
   * @command init
   * @description Initializes a configuration file for the doctor or audit commands.
   */
  .command(
    'init',
    'Initializes a configuration file for syntropylog.',
    // Builder function to define command-specific options.
    (yargs) => {
      return yargs
        .option('rules', {
          type: 'boolean',
          default: false,
          description: 'Generate a `syntropylog.doctor.ts` rule manifest file.',
        })
        .option('audit', {
          type: 'boolean',
          default: false,
          description: 'Generate a `syntropylog.audit.ts` audit plan file.',
        })
        .option('lang', {
          describe: 'Specify the language for the generated file (ts or js)',
          type: 'string',
          choices: ['ts', 'js'],
        })
        .option('module', {
          describe: 'Specify the module system (esm or cjs)',
          type: 'string',
          choices: ['esm', 'cjs'],
        })
        .check((argv) => {
          if (!argv.rules && !argv.audit) {
            throw new Error(
              'You must specify a file to generate. Use --rules or --audit.'
            );
          }
          return true;
        });
    },
    // Handler function that executes when the command is run.
    async (argv) => {
      try {
        await runInit(argv);
      } catch (error) {
        console.error(chalk.bgRed.white('\n UNEXPECTED ERROR '));
        console.error(error);
        process.exit(1);
      }
    }
  )
  /**
   * @command doctor <configPath>
   * @description Analyzes a single configuration file for issues.
   * It uses a local `syntropylog.doctor.ts` manifest if present, or falls back to core rules.
   */
  .command(
    'doctor <configPath>',
    'Analyzes a single configuration file using default or a local manifest.',
    (yargs) => {
      return yargs.positional('configPath', {
        describe: 'Path to the configuration file to analyze',
        type: 'string',
        demandOption: true,
      });
    },
    async (argv) => {
      try {
        await runDoctor({ configPath: argv.configPath as string });
      } catch (error) {
        console.error(chalk.bgRed.white('\n UNEXPECTED ERROR '), error);
        process.exit(1);
      }
    }
  )
  /**
   * @command audit
   * @description Runs a comprehensive audit across multiple configuration files
   * based on the `syntropylog.audit.ts` manifest.
   */
  .command(
    'audit',
    'Runs a full audit based on the `syntropylog.audit.ts` manifest file.',
    (yargs) => yargs,
    async () => {
      try {
        await runAudit();
      } catch (error) {
        console.error(chalk.bgRed.white('\n UNEXPECTED ERROR '), error);
        process.exit(1);
      }
    }
  )
  // Require at least one command to be specified.
  .demandCommand(
    1,
    'You must provide a command. Try "init", "doctor", or "audit".'
  )
  // Enable the --help option.
  .help()
  // Create a -h alias for --help.
  .alias('h', 'help')
  // Be strict about unknown commands or options.
  .strict()
  // Trigger the parsing of arguments and execution of the command.
  .parse();
