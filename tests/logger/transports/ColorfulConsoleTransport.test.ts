import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stripVTControlCharacters } from 'node:util';
import { ColorfulConsoleTransport } from '../../../src/logger/transports/ColorfulConsoleTransport';
import { LogEntry } from '../../../src/types';

describe('ColorfulConsoleTransport', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-11-10T15:00:00.000Z'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const baseEntry = (
    level: LogEntry['level'],
    message: string,
    service?: string
  ): LogEntry => ({
    level,
    message,
    service: service ?? 'test-service',
    timestamp: new Date().toISOString(),
  });

  /** Strip VT/ANSI codes so assertions match visible content (Node built-in, robust). */
  const stripAnsi = (s: string): string => stripVTControlCharacters(s);

  it('should log a simple message with level and timestamp in output', async () => {
    const transport = new ColorfulConsoleTransport({ level: 'info' });
    const entry = baseEntry('info', 'Application started.');

    await transport.log(entry);

    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain('INFO');
    expect(output).toContain('(test-service)');
    expect(output).toContain('Application started.');
    expect(output).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('should use console.error for error and fatal levels', async () => {
    const transport = new ColorfulConsoleTransport({ level: 'error' });
    await transport.log(baseEntry('error', 'Something broke.'));
    await transport.log(baseEntry('fatal', 'Unrecoverable.'));

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('ERROR');
    expect(consoleErrorSpy.mock.calls[1][0]).toContain('FATAL');
  });

  it('should use console.warn for warn level', async () => {
    const transport = new ColorfulConsoleTransport({ level: 'warn' });
    await transport.log(baseEntry('warn', 'Deprecation warning.'));

    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    expect(consoleWarnSpy.mock.calls[0][0]).toContain('WARN');
  });

  it('should include metadata on a second line with key=value format', async () => {
    const transport = new ColorfulConsoleTransport({ level: 'debug' });
    const entry: LogEntry = {
      ...baseEntry('debug', 'Processing.'),
      userId: 42,
      action: 'create',
    };

    await transport.log(entry);

    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const raw =
      typeof consoleLogSpy.mock.calls[0][0] === 'string'
        ? consoleLogSpy.mock.calls[0][0]
        : String(consoleLogSpy.mock.calls[0][0]);
    const plain = stripVTControlCharacters(raw);
    expect(plain).not.toMatch(/\x1b\[/); // assert we stripped ANSI
    expect(plain).toContain('Processing.');
    expect(plain).toContain('userId=');
    expect(plain).toContain('42');
    expect(plain).toContain('action=');
    expect(plain).toContain('create');
  });

  it('should not log when level is silent or below transport level', async () => {
    const transport = new ColorfulConsoleTransport({ level: 'info' });
    await transport.log(baseEntry('silent', 'Never shown.'));
    await transport.log(baseEntry('debug', 'Below info.'));

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should handle entry without service', async () => {
    const transport = new ColorfulConsoleTransport({ level: 'info' });
    const entry = baseEntry('info', 'No service.');
    delete (entry as Partial<LogEntry>).service;

    await transport.log(entry);

    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain('No service.');
    expect(output).not.toContain('()');
  });
});
