/**
 * @file .lintstagedrc.js
 * @description Configuration for lint-staged.
 * It runs commands on files staged for commit.
 */
module.exports = {
  // For all TypeScript files, run Prettier, ESLint, and Vitest.
  // The commands run sequentially.
  '*.ts': [
    'prettier --write', // 1. Format the code.
    'eslint --fix', // 2. Lint and fix auto-correctable issues.
    // 3. Run tests related to the changed files.
    // `--run` ensures Vitest exits after the test run.
    'vitest related --run --bail',
  ],
};