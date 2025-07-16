import { describe, it, expect, vi, beforeEach, afterEach, SpyInstance } from 'vitest';
import { CompactConsoleTransport } from '../../../src/logger/transports/CompactConsoleTransport';
import { LogEntry } from '../../../src/types';

describe('CompactConsoleTransport', () => {
  let consoleLogSpy: SpyInstance;
  let consoleWarnSpy: SpyInstance;
  let consoleErrorSpy: SpyInstance;

  beforeEach(() => {
    // Spy on console methods to capture output
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Use fake timers for consistent timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-11-10T14:45:00.500Z'));
  });

  afterEach(() => {
    // Restore mocks and timers
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const getBaseLogEntry = (level: LogEntry['level'], msg: string): LogEntry => ({
    level: level,
    message: msg,
    service: 'compact-app',
    timestamp: new Date().toISOString(),
  });

  it('should log a simple message in the correct compact format', async () => {
    const transport = new CompactConsoleTransport({ level: 'info' });
    const logEntry = getBaseLogEntry('info', 'Server is running.');

    await transport.log(logEntry);

    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = consoleLogSpy.mock.calls[0][0];

    // Check for the main log line, ignoring color codes
    expect(output).toContain(new Date(logEntry.timestamp).toLocaleTimeString());
    expect(output).toContain('[INFO]');
    expect(output).toContain('(compact-app)');
    expect(output).toContain(': Server is running.');
    // Ensure metadata line is not present
    expect(output).not.toContain('└─');
  });

  it('should format and include metadata on a new line', async () => {
    const transport = new CompactConsoleTransport({ level: 'debug' });
    const logEntry: LogEntry = {
      ...getBaseLogEntry('debug', 'Processing request.'),
      context: { correlationId: 'xyz-987' },
      userId: 123,
      payload: { data: 'value' },
    };

    await transport.log(logEntry);

    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = consoleLogSpy.mock.calls[0][0];

    // Check main line
    expect(output).toContain('[DEBUG]');
    expect(output).toContain(': Processing request.');

    // Check metadata line
    const metaLine = output.split('\n')[1];
    expect(metaLine).toContain('└─');
    // Check for keys and values separately to make the test resilient to chalk coloring,
    // which can break up the full "key=value" string.
    expect(metaLine).toContain('context');
    expect(metaLine).toContain('{"correlationId":"xyz-987"}');
    expect(metaLine).toContain('userId');
    expect(metaLine).toContain('123');
    expect(metaLine).toContain('payload');
    expect(metaLine).toContain('{"data":"value"}');
  });

  it('should use console.error for "error" and "fatal" levels', async () => {
    const transport = new CompactConsoleTransport({ level: 'error' });
    const errorEntry = getBaseLogEntry('error', 'Failed to connect to DB.');
    const fatalEntry = getBaseLogEntry('fatal', 'Unrecoverable error.');

    await transport.log(errorEntry);
    await transport.log(fatalEntry);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
    expect(consoleErrorSpy.mock.calls[1][0]).toContain('[FATAL]');
  });

  it('should use console.warn for "warn" level', async () => {
    const transport = new CompactConsoleTransport({ level: 'warn' });
    const warnEntry = getBaseLogEntry('warn', 'API rate limit approaching.');

    await transport.log(warnEntry);

    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    expect(consoleWarnSpy.mock.calls[0][0]).toContain('[WARN]');
  });

  it('should not log anything for the "silent" level', async () => {
    const transport = new CompactConsoleTransport({ level: 'info' });
    const logEntry = getBaseLogEntry('silent', 'This should be ignored.');

    await transport.log(logEntry);

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});