/**
 * FILE: tests/logger/transports/ConsoleTransport.test.ts
 * DESCRIPTION: Unit tests for the ConsoleTransport class.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConsoleTransport } from '../../../src/logger/transports/ConsoleTransport';
import { LogEntry } from '../../../src/types';

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

  it('should log an info entry as a JSON string to console.log', async () => {
    const transport = new ConsoleTransport();
    const logEntry = createLogEntry('info', 'Server started.');

    await transport.log(logEntry);

    expect(consoleLogSpy).toHaveBeenCalledOnce();
    expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(logEntry));
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should log a warn entry as a JSON string to console.warn', async () => {
    const transport = new ConsoleTransport();
    const logEntry = createLogEntry('warn', 'Disk space is low.');

    await transport.log(logEntry);

    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    expect(consoleWarnSpy).toHaveBeenCalledWith(JSON.stringify(logEntry));
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should log an error entry as a JSON string to console.error', async () => {
    const transport = new ConsoleTransport();
    const logEntry = createLogEntry('error', 'Database connection failed.');

    await transport.log(logEntry);

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith(JSON.stringify(logEntry));
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should log a fatal entry as a JSON string to console.error', async () => {
    const transport = new ConsoleTransport();
    const logEntry = createLogEntry('fatal', 'Critical system failure.');

    await transport.log(logEntry);

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith(JSON.stringify(logEntry));
  });

  it('should log a debug entry as a JSON string to console.log', async () => {
    const transport = new ConsoleTransport();
    const logEntry = createLogEntry('debug', 'Debugging info.');

    await transport.log(logEntry);

    expect(consoleLogSpy).toHaveBeenCalledOnce();
    expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(logEntry));
  });

  it('should log a silent entry to console.log based on the switch default', async () => {
    const transport = new ConsoleTransport();
    const logEntry = createLogEntry('silent', 'This should be logged by default.');

    await transport.log(logEntry);

    expect(consoleLogSpy).toHaveBeenCalledOnce();
    expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(logEntry));
  });
});