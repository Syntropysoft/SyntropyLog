/**
 * FILE: tests/logger/transports/ConsoleTransport.test.ts
 * DESCRIPTION: Unit tests for the ConsoleTransport class.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConsoleTransport } from '../../../src/logger/transports/ConsoleTransport';
import { LogEntry } from '../../../src/types';
import { LogFormatter } from '../../../src/logger/transports/formatters/LogFormatter';

describe('ConsoleTransport', () => {
  let consoleLogSpy: vi.SpyInstance;
  let consoleWarnSpy: vi.SpyInstance;
  let consoleErrorSpy: vi.SpyInstance;

  beforeEach(() => {
    // Spy on console methods to capture output and prevent polluting the test runner's console.
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original console methods after each test.
    vi.restoreAllMocks();
  });

  const createLogEntry = (
    level: LogEntry['level'],
    msg: string,
    meta: Record<string, any> = {}
  ): LogEntry => ({
    level,
    msg,
    service: 'json-app',
    timestamp: '2023-01-01T12:00:00.000Z',
    ...meta,
  });

  it('should log a simple entry as a JSON string', async () => {
    const transport = new ConsoleTransport({ level: 'info' });
    const logEntry = createLogEntry('info', 'Service started');

    await transport.log(logEntry);
    expect(consoleLogSpy).toHaveBeenCalledOnce();
    expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(logEntry));
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should use a custom formatter if provided', async () => {
    // The mock formatter should return an OBJECT, not a JSON string.
    // The transport is responsible for the final serialization.
    const mockFormatter = {
      format: vi.fn((entry: LogEntry) => ({ ...entry, formatted: true })),
    };
    const transport = new ConsoleTransport({
      level: 'info',
      formatter: mockFormatter,
    });
    const logEntry = createLogEntry('info', 'Formatted log');

    await transport.log(logEntry);

    expect(mockFormatter.format).toHaveBeenCalledWith(logEntry);
    expect(consoleLogSpy).toHaveBeenCalledOnce();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      JSON.stringify({ ...logEntry, formatted: true }),
    );
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should use console.error for "error" and "fatal" levels', async () => {
    const transport = new ConsoleTransport({ level: 'error' }); // Corrected level
    const errorEntry = createLogEntry('error', 'Critical failure');
    const fatalEntry = createLogEntry('fatal', 'System shutdown');

    await transport.log(errorEntry);
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith(JSON.stringify(errorEntry));

    await transport.log(fatalEntry);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(JSON.stringify(fatalEntry));
  });

  it('should use console.warn for the "warn" level', async () => {
    const transport = new ConsoleTransport({ level: 'warn' });
    const warnEntry = createLogEntry('warn', 'Deprecated API used');

    await transport.log(warnEntry);
    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    expect(consoleWarnSpy).toHaveBeenCalledWith(JSON.stringify(warnEntry));
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should not log anything for the "silent" level', async () => {
    const transport = new ConsoleTransport({ level: 'info' });
    const logEntry = createLogEntry('silent', 'This should not be logged.');

    await transport.log(logEntry);

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});