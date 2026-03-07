import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UniversalAdapter } from '../../../src/logger/adapters/UniversalAdapter';

describe('UniversalAdapter', () => {
  let executor: (data: unknown) => Promise<void> | void;

  beforeEach(() => {
    executor = vi.fn().mockResolvedValue(undefined);
  });

  it('should throw if options.executor is not a function', () => {
    expect(() => new UniversalAdapter({ executor: undefined as any })).toThrow(
      'UniversalAdapter requires an executor function.'
    );
    expect(() => new UniversalAdapter({ executor: null as any })).toThrow(
      'UniversalAdapter requires an executor function.'
    );
    expect(
      () => new UniversalAdapter({ executor: 'not a function' as any })
    ).toThrow('UniversalAdapter requires an executor function.');
  });

  it('should accept a valid executor and call it with data on log()', async () => {
    const adapter = new UniversalAdapter({ executor });
    const data = {
      level: 'info',
      message: 'test',
      timestamp: new Date().toISOString(),
    };

    await adapter.log(data);

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith(data);
  });

  it('should support sync executor', async () => {
    const syncExecutor = vi.fn();
    const adapter = new UniversalAdapter({ executor: syncExecutor });
    const data = { msg: 'sync' };

    await adapter.log(data);

    expect(syncExecutor).toHaveBeenCalledWith(data);
  });

  it('should not rethrow when executor throws (Silent Observer)', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    executor = vi.fn().mockRejectedValue(new Error('Executor failed'));

    const adapter = new UniversalAdapter({ executor });

    await expect(adapter.log({})).resolves.not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'UniversalAdapter execution failed: Executor failed'
      )
    );

    consoleErrorSpy.mockRestore();
  });

  it('should log non-Error rejection as string', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    executor = vi.fn().mockRejectedValue('string error');

    const adapter = new UniversalAdapter({ executor });

    await adapter.log({});

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('UniversalAdapter execution failed: string error')
    );

    consoleErrorSpy.mockRestore();
  });
});
