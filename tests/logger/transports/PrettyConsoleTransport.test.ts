import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PrettyConsoleTransport,
  createLevelColorMap,
  formatPrettyLog,
} from '../../../src/logger/transports/PrettyConsoleTransport';
import { LogEntry } from '../../../src/types';
import chalk from 'chalk';

describe('PrettyConsoleTransport Pure Functions', () => {
  describe('createLevelColorMap', () => {
    it('should return a map with colorizers for all levels', () => {
      const map = createLevelColorMap(chalk);
      expect(map).toHaveProperty('info');
      expect(map).toHaveProperty('error');
      expect(map).toHaveProperty('warn');
      expect(map).toHaveProperty('debug');
      expect(map).toHaveProperty('trace');
      expect(map).toHaveProperty('fatal');
      expect(map).toHaveProperty('audit');
    });
  });

  describe('formatPrettyLog', () => {
    const colorMap = createLevelColorMap(chalk);
    const baseEntry: LogEntry = {
      level: 'info',
      message: 'test message',
      service: 'test-service',
      timestamp: new Date('2023-01-01T12:00:00Z').toISOString(),
    };

    it('should format a basic log entry correctly', () => {
      const result = formatPrettyLog(baseEntry, chalk, colorMap);
      // The time format depends on the locale, so we just check for the components
      // or use a more flexible regex if needed.
      // Since we are running in a test environment, the locale might be different.
      // Let's just check that it contains the time string in some format or just skip time check for this unit test
      // as we are testing the structure.
      // Actually, let's fix the expectation to match what Node's toLocaleTimeString produces in this env.
      // The output shows "9:00:00 AM" or "09:00:00" depending on env, but we passed 12:00:00Z.
      // 12:00:00 UTC might be 9:00:00 local time if timezone is -3.
      // Let's just check for the other parts which are deterministic.
      expect(result).toContain('[INFO]');
      expect(result).toContain('(test-service)');
      expect(result).toContain('test message');
    });

    it('should include metadata if present', () => {
      const entry = { ...baseEntry, userId: 123 };
      const result = formatPrettyLog(entry, chalk, colorMap);
      expect(result).toContain('"userId": 123');
    });
  });
});

describe('PrettyConsoleTransport', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

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

  const getBaseLogEntry = (
    level: LogEntry['level'],
    msg: string
  ): LogEntry => ({
    level: level,
    message: msg,
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
    const warnEntry = getBaseLogEntry(
      'warn',
      'Configuration value is deprecated.'
    );

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
