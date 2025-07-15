/**
 * FILE: tests/logger/transports/PrettyConsoleTransport.test.ts
 * DESCRIPTION: Unit tests for the PrettyConsoleTransport class.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrettyConsoleTransport } from '../../../src/logger/transports/PrettyConsoleTransport';
import { LogEntry } from '../../../src/types';

describe('PrettyConsoleTransport', () => {
  let consoleLogSpy: vi.SpyInstance;
  let consoleWarnSpy: vi.SpyInstance;
  let consoleErrorSpy: vi.SpyInstance;

  beforeEach(() => {
    // Spy on console methods to capture output
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Use fake timers for consistent timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-11-10T15:00:00.000Z'));
  });

  afterEach(() => {
    // Restore mocks and timers
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const getBaseLogEntry = (level: LogEntry['level'], msg: string): LogEntry => ({
    level,
    msg,
    service: 'pretty-app',
    timestamp: new Date().toISOString(),
  });

  it('should log a simple message in the correct pretty format', async () => {
    const transport = new PrettyConsoleTransport({ level: 'info' });
    const logEntry = getBaseLogEntry('info', 'Application is running.');

    await transport.log(logEntry);

    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = consoleLogSpy.mock.calls[0][0];

    // Check for the main log line, ignoring color codes
    expect(output).toContain(new Date(logEntry.timestamp).toLocaleTimeString());
    expect(output).toContain('[INFO]');
    expect(output).toContain('(pretty-app)');
    expect(output).toContain(': Application is running.');
    // Ensure metadata is not present when not provided
    expect(output).not.toContain('\n{');
  });

  it('should format and include metadata on a new line, pretty-printed', async () => {
    const transport = new PrettyConsoleTransport({ level: 'debug' });
    const logEntry: LogEntry = {
      ...getBaseLogEntry('debug', 'Processing user request.'),
      userId: 42,
      request: {
        method: 'POST',
        url: '/api/users',
      },
    };

    await transport.log(logEntry);

    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = consoleLogSpy.mock.calls[0][0];

    // Check main line
    expect(output).toContain('[DEBUG]');
    expect(output).toContain(': Processing user request.');

    // Check metadata, which should be pretty-printed JSON
    const expectedMeta = JSON.stringify(
      {
        userId: 42,
        request: {
          method: 'POST',
          url: '/api/users',
        },
      },
      null,
      2
    );

    // The output from the transport will have ANSI color codes from chalk.
    // To make the test assertion reliable, we can strip the color codes
    // before checking for containment. This verifies content and structure
    // without being brittle due to styling.
    const ansiRegex =
      // eslint-disable-next-line no-control-regex
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    const strippedOutput = output.replace(ansiRegex, '');

    expect(strippedOutput).toContain(`\n${expectedMeta}`);
  });

  it('should use console.error for "error" and "fatal" levels', async () => {
    const transport = new PrettyConsoleTransport({ level: 'error' });
    const errorEntry = getBaseLogEntry('error', 'Database query failed.');
    const fatalEntry = getBaseLogEntry('fatal', 'Service is shutting down.');

    await transport.log(errorEntry);
    await transport.log(fatalEntry);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
    expect(consoleErrorSpy.mock.calls[1][0]).toContain('[FATAL]');
  });

  it('should use console.warn for "warn" level', async () => {
    const transport = new PrettyConsoleTransport({ level: 'warn' });
    const warnEntry = getBaseLogEntry('warn', 'Configuration value is deprecated.');

    await transport.log(warnEntry);

    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    expect(consoleWarnSpy.mock.calls[0][0]).toContain('[WARN]');
  });

  it('should not log anything for the "silent" level', async () => {
    const transport = new PrettyConsoleTransport({ level: 'info' }); // Level 'info' will not log 'silent'
    const logEntry = getBaseLogEntry('silent', 'This should not appear.');

    await transport.log(logEntry);

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});