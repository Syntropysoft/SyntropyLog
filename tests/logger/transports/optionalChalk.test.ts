import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getOptionalChalk } from '../../../src/logger/transports/optionalChalk';

describe('optionalChalk', () => {
  const originalEnv = process.env;
  const originalStdout = process.stdout;

  beforeEach(() => {
    // Reset module cache to ensure getOptionalChalk evaluates conditions again
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear the cache by tricking the module or by resetting imports
    // Since getOptionalChalk caches its result, we mock it or reset its cache
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, 'stdout', {
      value: originalStdout,
      configurable: true,
    });
  });

  it('should return a chainable, ANSI-escaping function when TTY and no NO_COLOR', async () => {
    // Simulate TTY
    Object.defineProperty(process, 'stdout', {
      value: { isTTY: true },
      configurable: true,
    });
    delete process.env.NO_COLOR;

    // Reset module to clear cache
    const { getOptionalChalk } =
      await import('../../../src/logger/transports/optionalChalk');
    const chalk = getOptionalChalk();

    expect(chalk('test')).toBe('test'); // No colors
    expect(chalk.red('test')).toBe('\x1b[31mtest\x1b[0m');
    expect(chalk.bgRed('test')).toBe('\x1b[41mtest\x1b[0m');
    expect(chalk.bold.white('test')).toBe('\x1b[1;37mtest\x1b[0m');
    expect(chalk.yellow('test')).toBe('\x1b[33mtest\x1b[0m');
    expect(chalk.cyan('test')).toBe('\x1b[36mtest\x1b[0m');
    expect(chalk.green('test')).toBe('\x1b[32mtest\x1b[0m');
    expect(chalk.gray('test')).toBe('\x1b[90mtest\x1b[0m');
    expect(chalk.magenta('test')).toBe('\x1b[35mtest\x1b[0m');
    expect(chalk.blue('test')).toBe('\x1b[34mtest\x1b[0m');
    expect(chalk.bgWhite('test')).toBe('\x1b[47mtest\x1b[0m');
    expect(chalk.dim('test')).toBe('\x1b[2mtest\x1b[0m');
  });

  it('should return an identity chain when NO_COLOR is set', async () => {
    Object.defineProperty(process, 'stdout', {
      value: { isTTY: true },
      configurable: true,
    });
    process.env.NO_COLOR = '1';

    // Must append a unique query to bypass node module cache for the test
    const { getOptionalChalk } =
      await import('../../../src/logger/transports/optionalChalk?no_color=1');
    const chalk = getOptionalChalk();

    expect(chalk.red('test')).toBe('test');
    expect(chalk.bold.white('test')).toBe('test');
  });

  it('should return an identity chain when stdout is not TTY', async () => {
    Object.defineProperty(process, 'stdout', {
      value: { isTTY: false },
      configurable: true,
    });
    delete process.env.NO_COLOR;

    const { getOptionalChalk } =
      await import('../../../src/logger/transports/optionalChalk?not_tty=1');
    const chalk = getOptionalChalk();

    expect(chalk.red('test')).toBe('test');
    expect(chalk.bgRed.blue('test')).toBe('test');
  });
});
