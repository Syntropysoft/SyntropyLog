#!/usr/bin/env node
/*
=============================================================================
FILE 2: src/cli/cli.ts (New)
-----------------------------------------------------------------------------
DESCRIPTION:
This is the main entry point for your Command Line Interface (CLI). Its sole
responsibility is to define the command structure and options using `yargs`.
The `#!/usr/bin/env node` line at the top is CRUCIAL. It's called a "shebang"
and it tells the operating system that this file should be executed using Node.js.
=============================================================================
*/
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runDoctor } from './doctor';
import { runAudit } from './audit';
import { runInit } from './init';
import chalk from 'chalk';

yargs(hideBin(process.argv))
  .scriptName(chalk.cyan('beaconlog'))
  // --- INIT COMMAND ---
  .command(
    'init',
    'Initializes a configuration file for beaconlog.',
    (yargs) => {
      return yargs
        .option('rules', {
          type: 'boolean',
          description: 'Generate a `beaconlog.doctor.ts` rule manifest file.',
        })
        .option('audit', {
          type: 'boolean',
          description: 'Generate a `beaconlog.audit.ts` audit plan file.',
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
  // --- DOCTOR COMMAND ---
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
  // --- AUDIT COMMAND ---
  .command(
    'audit',
    'Runs a full audit based on the `beaconlog.audit.ts` manifest file.',
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
  .demandCommand(
    1,
    'You must provide a command. Try "init", "doctor", or "audit".'
  )
  .help()
  .alias('h', 'help')
  .strict()
  .parse();