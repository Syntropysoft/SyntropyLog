import { describe, it, expect, afterEach } from 'vitest';
import { getOptionalChalk } from '../../../src/logger/transports/optionalChalk';

describe('optionalChalk', () => {
  const originalStdout = process.stdout;

  afterEach(() => {
    Object.defineProperty(process, 'stdout', {
      value: originalStdout,
      configurable: true,
    });
  });

  it('should return a chainable, ANSI-escaping function when disableColors false and TTY', () => {
    Object.defineProperty(process, 'stdout', {
      value: { isTTY: true },
      configurable: true,
    });
    const chalk = getOptionalChalk(false);

    expect(chalk('test')).toBe('test'); // No colors when called with no chain
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

  it('should return an identity chain when disableColors is true', () => {
    Object.defineProperty(process, 'stdout', {
      value: { isTTY: true },
      configurable: true,
    });
    const chalk = getOptionalChalk(true);

    expect(chalk.red('test')).toBe('test');
    expect(chalk.bold.white('test')).toBe('test');
  });

  it('should return an identity chain when disableColors false but stdout is not TTY', () => {
    Object.defineProperty(process, 'stdout', {
      value: { isTTY: false },
      configurable: true,
    });
    const chalk = getOptionalChalk(false);

    expect(chalk.red('test')).toBe('test');
    expect(chalk.bgRed.blue('test')).toBe('test');
  });
});
