import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { createSyntropyLog } from '../../src/index';
import { fastifyCorrelationHook } from '../../src/middleware/fastify';
import type {
  FastifyRequestLike,
  FastifyReplyLike,
} from '../../src/middleware/fastify';
import type { ISyntropyLog } from '../../src/index';

function mockReply(): FastifyReplyLike & { __headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const rawEmitter = new EventEmitter();
  return {
    header: (name, value) => {
      headers[name] = String(value);
      return undefined;
    },
    raw: rawEmitter,
    __headers: headers,
  } as FastifyReplyLike & { __headers: Record<string, string> } & {
    raw: EventEmitter;
  };
}

function rawOf(reply: FastifyReplyLike): EventEmitter {
  return reply.raw as unknown as EventEmitter;
}

describe('fastifyCorrelationHook', () => {
  let sl: ISyntropyLog;

  beforeEach(async () => {
    sl = createSyntropyLog();
    await sl.init({
      logger: { serviceName: 'fastify-mw-test', level: 'info' },
    });
  });

  afterEach(async () => {
    if (sl.getState() === 'READY') await sl.shutdown();
  });

  it('resolves the correlation ID into the SyntropyLog context before done() runs', async () => {
    const hook = fastifyCorrelationHook({ syntropyLog: sl });
    const request: FastifyRequestLike = {
      headers: { 'x-correlation-id': 'trc-fastify' },
    };
    const reply = mockReply();

    let capturedId: string | undefined;
    const done = vi.fn(() => {
      capturedId = sl.getContextManager().getCorrelationId();
    });

    hook(request, reply, done);
    // Let the microtask queue drain.
    await new Promise((r) => setImmediate(r));
    rawOf(reply).emit('finish');

    expect(done).toHaveBeenCalledOnce();
    expect(capturedId).toBe('trc-fastify');
  });

  it('echoes the resolved ID into the default response headers via reply.header', async () => {
    const hook = fastifyCorrelationHook({ syntropyLog: sl });
    const request: FastifyRequestLike = {
      headers: { 'x-trace-id': 'trc-fastify-headers' },
    };
    const reply = mockReply();
    const done = vi.fn();

    hook(request, reply, done);
    await new Promise((r) => setImmediate(r));
    rawOf(reply).emit('finish');

    expect(reply.__headers['X-Trace-Id']).toBe('trc-fastify-headers');
    expect(reply.__headers['X-Correlation-ID']).toBe('trc-fastify-headers');
    expect(reply.__headers['X-Request-ID']).toBe('trc-fastify-headers');
  });

  it('skips echoing when responseHeaders is empty', async () => {
    const hook = fastifyCorrelationHook({
      syntropyLog: sl,
      responseHeaders: [],
    });
    const request: FastifyRequestLike = {
      headers: { 'x-trace-id': 'no-echo' },
    };
    const reply = mockReply();
    const done = vi.fn();

    hook(request, reply, done);
    await new Promise((r) => setImmediate(r));
    rawOf(reply).emit('finish');

    expect(reply.__headers).toEqual({});
  });

  it('generates a fallback ID when no header is present', async () => {
    const hook = fastifyCorrelationHook({ syntropyLog: sl });
    const request: FastifyRequestLike = { headers: {} };
    const reply = mockReply();

    let capturedId: string | undefined;
    const done = vi.fn(() => {
      capturedId = sl.getContextManager().getCorrelationId();
    });

    hook(request, reply, done);
    await new Promise((r) => setImmediate(r));
    rawOf(reply).emit('finish');

    expect(capturedId).toMatch(/^trc_\d+_[a-z0-9]+$/);
  });

  it('resolves traceparent when explicit headers are absent', async () => {
    const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const hook = fastifyCorrelationHook({ syntropyLog: sl });
    const request: FastifyRequestLike = { headers: { traceparent: tp } };
    const reply = mockReply();

    let capturedId: string | undefined;
    const done = vi.fn(() => {
      capturedId = sl.getContextManager().getCorrelationId();
    });

    hook(request, reply, done);
    await new Promise((r) => setImmediate(r));
    rawOf(reply).emit('finish');

    expect(capturedId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('forwards an Error to done() when the context layer fails', async () => {
    const broken: ISyntropyLog = {
      ...sl,
      getContextManager: () => {
        throw new Error('fastify-boom');
      },
    } as unknown as ISyntropyLog;

    const hook = fastifyCorrelationHook({ syntropyLog: broken });
    const request: FastifyRequestLike = { headers: {} };
    const reply = mockReply();
    const done = vi.fn();

    hook(request, reply, done);
    await new Promise((r) => setImmediate(r));

    expect(done).toHaveBeenCalledOnce();
    expect(done.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((done.mock.calls[0][0] as Error).message).toBe('fastify-boom');
  });
});
