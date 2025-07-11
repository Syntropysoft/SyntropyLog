/**
 * FILE: tests/logger/transports/ClassicConsoleTransport.test.ts
 * DESCRIPTION: Unit tests for the ClassicConsoleTransport class.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClassicConsoleTransport } from '../../../src/logger/transports/ClassicConsoleTransport';
import { LogEntry } from '../../../src/types';

describe('ClassicConsoleTransport', () => {
  let consoleLogSpy: vi.SpyInstance;
  let consoleWarnSpy: vi.SpyInstance;
  let consoleErrorSpy: vi.SpyInstance;

  beforeEach(() => {
    // Spy on console methods to capture output without polluting the test runner's console
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Use fake timers to generate a predictable timestamp for consistent test results
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-10-27T10:30:00.123Z'));
  });

  afterEach(() => {
    // Restore original console methods and timers after each test
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const getBaseLogEntry = (level: LogEntry['level'], msg: string): LogEntry => ({
    level,
    msg,
    service: 'test-app',
    timestamp: new Date().toISOString(),
  });

  // Helper to format a date into 'YYYY-MM-DD HH:mm:ss' in the local timezone,
  // matching the transport's likely output format. This makes the test
  // independent of the environment's timezone.
  const formatToLocalTime = (date: Date) => {
    const pad = (num: number) => num.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  it('should log a simple info message in the correct classic format', async () => {
    const transport = new ClassicConsoleTransport();
    const logEntry = getBaseLogEntry('info', 'Application started successfully.');

    await transport.log(logEntry);

    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = consoleLogSpy.mock.calls[0][0];

    // Check for all parts of the classic format, ignoring color codes
    const expectedTimestamp = formatToLocalTime(new Date(logEntry.timestamp));
    expect(output).toContain(expectedTimestamp);
    expect(output).toContain('INFO '); // Note the padding
    expect(output).toContain('[test-app]');
    expect(output).toContain(':: Application started successfully.');
    // Ensure metadata part is not present when no metadata is provided
    expect(output).not.toContain('[]');
  });

  it('should include context and other metadata in the log output', async () => {
    const transport = new ClassicConsoleTransport();
    const logEntry: LogEntry = {
      ...getBaseLogEntry('warn', 'User authentication failed.'),
      context: { correlationId: 'abc-123' },
      userId: 42,
      reason: 'Invalid credentials',
    };

    await transport.log(logEntry);

    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    const output = consoleWarnSpy.mock.calls[0][0];

    expect(output).toContain('WARN ');
    // Check for the metadata block with stringified values
    expect(output).toContain('[correlationId="abc-123" userId=42 reason="Invalid credentials"]');
    expect(output).toContain(':: User authentication failed.');
  });

  it('should use console.error for "error" and "fatal" levels', async () => {
    const transport = new ClassicConsoleTransport();
    const errorEntry = getBaseLogEntry('error', 'Database connection failed.');
    const fatalEntry = getBaseLogEntry('fatal', 'Critical system failure.');

    await transport.log(errorEntry);
    await transport.log(fatalEntry);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('ERROR');
    expect(consoleErrorSpy.mock.calls[1][0]).toContain('FATAL');
  });

  it('should not log anything for the "silent" level', async () => {
    const transport = new ClassicConsoleTransport();
    const logEntry = getBaseLogEntry('silent', 'This should not be logged.');

    await transport.log(logEntry);

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should handle entries with a missing service name gracefully', async () => {
    const transport = new ClassicConsoleTransport();
    const logEntry: LogEntry = {
      level: 'debug',
      msg: 'A debug message.',
      service: undefined as any, // Test the undefined case
      timestamp: new Date().toISOString(),
    };

    await transport.log(logEntry);

    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = consoleLogSpy.mock.calls[0][0];

    // The template literal should render `[undefined]`
    expect(output).toContain('[undefined]');
    expect(output).toContain(':: A debug message.');
  });

  it('should correctly pad log levels of different lengths', async () => {
    const transport = new ClassicConsoleTransport();
    await transport.log(getBaseLogEntry('error', ''));
    await transport.log(getBaseLogEntry('trace', ''));

    const errorOutput = consoleErrorSpy.mock.calls[0][0];
    const traceOutput = consoleLogSpy.mock.calls[0][0];

    // Both levels should be padded to 5 characters
    expect(errorOutput).toContain('ERROR');
    expect(traceOutput).toContain('TRACE');
  });
});