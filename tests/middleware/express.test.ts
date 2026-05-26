import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { createSyntropyLog } from '../../src/index';
import { correlationIdMiddleware } from '../../src/middleware/express';
import type {
  ExpressRequestLike,
  ExpressResponseLike,
} from '../../src/middleware/express';
import type { ISyntropyLog } from '../../src/index';

/** Mock Response with EventEmitter semantics for finish/close. */
function mockResponse(): ExpressResponseLike & EventEmitter {
  const emitter = new EventEmitter() as EventEmitter & ExpressResponseLike;
  const headers: Record<string, string> = {};
  emitter.setHeader = (name: string, value: string) => {
    headers[name] = value;
    return undefined;
  };
  // Track the set headers for assertions
  (emitter as unknown as { __headers: Record<string, string> }).__headers =
    headers;
  return emitter;
}

function getSetHeaders(res: ExpressResponseLike): Record<string, string> {
  return (res as unknown as { __headers: Record<string, string> }).__headers;
}

describe('correlationIdMiddleware (Express)', () => {
  let sl: ISyntropyLog;

  beforeEach(async () => {
    sl = createSyntropyLog();
    await sl.init({ logger: { serviceName: 'mw-test', level: 'info' } });
  });

  afterEach(async () => {
    if (sl.getState() === 'READY') await sl.shutdown();
  });

  it('resolves the correlation ID and sets it in the SyntropyLog context', async () => {
    const middleware = correlationIdMiddleware({ syntropyLog: sl });
    const req: ExpressRequestLike = {
      headers: { 'x-correlation-id': 'trc-abc' },
    };
    const res = mockResponse();
    let capturedId: string | undefined;
    const next = vi.fn(() => {
      capturedId = sl.getContextManager().getCorrelationId();
    });

    const done = middleware(req, res, next);
    // Hand off to event loop, then close the response.
    setImmediate(() => res.emit('finish'));
    await done;

    expect(next).toHaveBeenCalledOnce();
    expect(capturedId).toBe('trc-abc');
  });

  it('echoes the resolved ID onto the default response headers', async () => {
    const middleware = correlationIdMiddleware({ syntropyLog: sl });
    const req: ExpressRequestLike = { headers: { 'x-trace-id': 'trc-xyz' } };
    const res = mockResponse();
    const next = vi.fn();

    const done = middleware(req, res, next);
    setImmediate(() => res.emit('finish'));
    await done;

    const headers = getSetHeaders(res);
    expect(headers['X-Trace-Id']).toBe('trc-xyz');
    expect(headers['X-Correlation-ID']).toBe('trc-xyz');
    expect(headers['X-Request-ID']).toBe('trc-xyz');
  });

  it('skips echoing when responseHeaders is empty', async () => {
    const middleware = correlationIdMiddleware({
      syntropyLog: sl,
      responseHeaders: [],
    });
    const req: ExpressRequestLike = {
      headers: { 'x-trace-id': 'trc-no-echo' },
    };
    const res = mockResponse();
    const next = vi.fn();

    const done = middleware(req, res, next);
    setImmediate(() => res.emit('finish'));
    await done;

    expect(getSetHeaders(res)).toEqual({});
  });

  it('generates a fallback ID when no header is present', async () => {
    const middleware = correlationIdMiddleware({ syntropyLog: sl });
    const req: ExpressRequestLike = { headers: {} };
    const res = mockResponse();
    let capturedId: string | undefined;
    const next = vi.fn(() => {
      capturedId = sl.getContextManager().getCorrelationId();
    });

    const done = middleware(req, res, next);
    setImmediate(() => res.emit('finish'));
    await done;

    expect(capturedId).toMatch(/^trc_\d+_[a-z0-9]+$/);
  });

  it('honors a custom generator', async () => {
    const middleware = correlationIdMiddleware({
      syntropyLog: sl,
      generateCorrelationId: () => 'my-uuid',
    });
    const req: ExpressRequestLike = { headers: {} };
    const res = mockResponse();
    let capturedId: string | undefined;
    const next = vi.fn(() => {
      capturedId = sl.getContextManager().getCorrelationId();
    });

    const done = middleware(req, res, next);
    setImmediate(() => res.emit('finish'));
    await done;

    expect(capturedId).toBe('my-uuid');
  });

  it('keeps the ALS scope alive for both finish and close events', async () => {
    const middlewareFinish = correlationIdMiddleware({ syntropyLog: sl });
    const middlewareClose = correlationIdMiddleware({ syntropyLog: sl });

    const reqA: ExpressRequestLike = { headers: { 'x-trace-id': 'trc-a' } };
    const reqB: ExpressRequestLike = { headers: { 'x-trace-id': 'trc-b' } };
    const resA = mockResponse();
    const resB = mockResponse();

    const promA = middlewareFinish(reqA, resA, () => undefined);
    const promB = middlewareClose(reqB, resB, () => undefined);

    setImmediate(() => {
      resA.emit('finish');
      resB.emit('close');
    });

    await Promise.all([promA, promB]);
    // No assertion needed — the test passes if both promises resolve.
  });

  it('forwards errors thrown inside the scope to Express next()', async () => {
    // Simulate a failure by passing a broken contextManager via a custom SL instance.
    const broken: ISyntropyLog = {
      ...sl,
      getContextManager: () => {
        throw new Error('boom');
      },
    } as unknown as ISyntropyLog;

    const middleware = correlationIdMiddleware({ syntropyLog: broken });
    const req: ExpressRequestLike = { headers: {} };
    const res = mockResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((next.mock.calls[0][0] as Error).message).toBe('boom');
  });

  it('uses the global singleton when no syntropyLog option is given', async () => {
    const { syntropyLog: globalSL } = await import('../../src/index');
    if (globalSL.getState() !== 'READY') {
      await globalSL.init({
        logger: { serviceName: 'global-test', level: 'info' },
      });
    }
    const middleware = correlationIdMiddleware();
    const req: ExpressRequestLike = {
      headers: { 'x-trace-id': 'trc-singleton' },
    };
    const res = mockResponse();
    let capturedId: string | undefined;
    const next = vi.fn(() => {
      capturedId = globalSL.getContextManager().getCorrelationId();
    });

    const done = middleware(req, res, next);
    setImmediate(() => res.emit('finish'));
    await done;

    expect(capturedId).toBe('trc-singleton');
    await globalSL.shutdown();
    // Reset for next test.
    const { SyntropyLog } = await import('../../src/index');
    SyntropyLog.resetInstance();
  });
});
