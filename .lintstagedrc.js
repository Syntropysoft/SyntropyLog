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
    // 2. Lint and fix auto-correctable issues. `--max-warnings=0` so a warning that is
    //    *not* auto-fixable blocks the commit instead of riding along unnoticed.
    'eslint --fix --max-warnings=0',
    // 3. Run tests related to the changed files.
    // `--run` exits after the run; `--bail 1` stops at first failure; `--no-cache` avoids stale test code.
    'vitest related --run --bail 1 --no-cache',
  ],
};