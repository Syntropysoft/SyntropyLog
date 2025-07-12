/*
 * @file src/cli/init.ts
 * @description Contains the logic for the `init` command. It detects the project
 * environment, prompts the user for details if necessary, and generates the
 * appropriate manifest file(s) from a template.
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { getDoctorManifestTemplate, getAuditPlanTemplate } from './templates';

/**
 * @interface ProjectInfo
 * @description Holds detected information about the user's project environment.
 */
interface ProjectInfo {
  /** Whether the project is likely a TypeScript project. */
  isTypeScript: boolean;
  /** Whether the project is configured to use ES Modules. */
  isESM: boolean;
}

/**
 * @interface InitOptions
 * @description Defines the command-line options passed to the `runInit` function.
 */
interface InitOptions {
  /** If true, generate the `syntropylog.doctor.ts` file. */
  rules?: boolean;
  /** If true, generate the `syntropylog.audit.ts` file. */
  audit?: boolean;
  /** The language specified via CLI flag (e.g., 'ts' or 'js'). */
  lang?: string;
  /** The module system specified via CLI flag (e.g., 'esm' or 'cjs'). */
  module?: string;
}

/**
 * Detects project settings by inspecting `tsconfig.json` and `package.json`.
 * @returns {Promise<ProjectInfo>} A promise that resolves with the detected project information.
 */
async function detectProjectInfo(): Promise<ProjectInfo> {
  const CWD = process.cwd();
  const tsConfigPath = path.resolve(CWD, 'tsconfig.json');
  const pkgPath = path.resolve(CWD, 'package.json');

  let pkgContent: {
    type?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } = {};

  try {
    const pkgFile = await fs.readFile(pkgPath, 'utf-8');
    pkgContent = JSON.parse(pkgFile);
  } catch {
    // It's okay if package.json doesn't exist, we'll just have less info.
  }

  const isESM = pkgContent.type === 'module';

  let isTypeScript = false;
  try {
    await fs.access(tsConfigPath);
    isTypeScript = true;
  } catch {
    isTypeScript =
      !!pkgContent.dependencies?.typescript ||
      !!pkgContent.devDependencies?.typescript;
  }

  return { isTypeScript, isESM };
}

/**
 * Asks the user for project details if they cannot be detected or overridden.
 * It uses `inquirer` for an interactive prompt, but only if the process is a TTY.
 * @param {InitOptions} options - The CLI options provided by the user.
 * @param {ProjectInfo} detected - The automatically detected project information.
 * @returns {Promise<{ language: 'ts' | 'js'; moduleSystem: 'esm' | 'cjs' }>} The resolved
 * language and module system.
 */
async function promptForDetails(
  options: InitOptions,
  detected: ProjectInfo
): Promise<{ language: 'ts' | 'js'; moduleSystem: 'esm' | 'cjs' }> {
  let language = options.lang;
  let moduleSystem = options.module;
  const isInteractive = process.stdout.isTTY;

  if (!language) {
    if (isInteractive) {
      const { langChoice } = await inquirer.prompt([
        {
          type: 'list',
          name: 'langChoice',
          message: 'Which language does your project use?',
          choices: ['TypeScript', 'JavaScript'],
          default: detected.isTypeScript ? 'TypeScript' : 'JavaScript',
        },
      ]);
      language = langChoice === 'TypeScript' ? 'ts' : 'js';
    } else {
      language = detected.isTypeScript ? 'ts' : 'js';
    }
  }

  if (!moduleSystem) {
    if (isInteractive) {
      const { moduleChoice } = await inquirer.prompt([
        {
          type: 'list',
          name: 'moduleChoice',
          message: 'Which module system do you use?',
          choices: ['ESM (import/export)', 'CommonJS (require/module.exports)'],
          default: detected.isESM
            ? 'ESM (import/export)'
            : 'CommonJS (require/module.exports)',
        },
      ]);
      moduleSystem = moduleChoice.startsWith('ESM') ? 'esm' : 'cjs';
    } else {
      moduleSystem = detected.isESM ? 'esm' : 'cjs';
    }
  }

  return {
    language: language as 'ts' | 'js',
    moduleSystem: moduleSystem as 'esm' | 'cjs',
  };
}

/**
 * The main execution function for the `init` command.
 * It orchestrates project detection, user prompting (if needed), and manifest
 * file generation based on the provided options.
 * @param {InitOptions} options - The command-line options for the init process.
 */
export async function runInit(options: InitOptions): Promise<void> {
  const detected = await detectProjectInfo();
  const { language, moduleSystem } = await promptForDetails(options, detected);

  const fileExtension =
    language === 'ts' ? 'ts' : moduleSystem === 'esm' ? 'mjs' : 'js';
  let manifestFileName = '';
  let template = '';

  if (options.rules) {
    manifestFileName = `syntropylog.doctor.${fileExtension}`;
    template = getDoctorManifestTemplate(language, moduleSystem);
    console.log(
      chalk.cyan.bold('Initializing syntropylog doctor rule manifest...')
    );
  } else if (options.audit) {
    manifestFileName = `syntropylog.audit.${fileExtension}`;
    template = getAuditPlanTemplate(language, moduleSystem);
    console.log(chalk.cyan.bold('Initializing syntropylog audit plan...'));
  }

  const manifestPath = path.resolve(process.cwd(), manifestFileName);

  try {
    await fs.writeFile(manifestPath, template, { flag: 'wx' });
    console.log(
      chalk.green(`✅ Successfully created manifest at: ${manifestPath}`)
    );
    console.log(
      chalk.cyan("   You can now customize it to define your project's rules.")
    );
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any).code === 'EEXIST') {
      console.error(
        chalk.yellow(
          `⚠️ A \`${manifestFileName}\` file already exists. No changes were made.`
        )
      );
    } else {
      console.error(chalk.red(`❌ Failed to create manifest file.`), error);
    }
  }
}
