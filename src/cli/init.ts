/*
=============================================================================
ARCHIVO 3: src/cli/init.ts (NUEVO - LÓGICA DE INICIALIZACIÓN)
-----------------------------------------------------------------------------
DESCRIPTION (en-US):
Contains the logic for the `init` command. It detects the project environment,
asks the user questions if necessary (using `inquirer`), and generates the
appropriate rule manifest file (`beaconlog.doctor.ts`) from a template.
=============================================================================
*/

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { getDoctorManifestTemplate, getAuditPlanTemplate } from './templates';

interface ProjectInfo {
  isTypeScript: boolean;
  isESM: boolean;
}

interface InitOptions {
  rules?: boolean;
  audit?: boolean;
  lang?: string;
  module?: string;
}

/**
 * Detects project settings by inspecting `tsconfig.json` and `package.json`.
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
    // It's okay if package.json doesn't exist.
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
 * Main function for the `init` command.
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