import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdapterTransport } from '../../../src/logger/transports/AdapterTransport';
import { ILogTransportAdapter } from '../../../src/logger/transports/adapter.types';
import { LogEntry } from '../../../src/types';

describe('AdapterTransport', () => {
    let mockAdapter: ILogTransportAdapter;
    let transport: AdapterTransport;

    beforeEach(() => {
        mockAdapter = {
            log: vi.fn().mockResolvedValue(undefined),
            flush: vi.fn().mockResolvedValue(undefined),
            shutdown: vi.fn().mockResolvedValue(undefined),
        };

        transport = new AdapterTransport({
            adapter: mockAdapter,
            level: 'info',
        });
    });

    it('should delegate log entry to adapter when level is enabled', async () => {
        const entry: LogEntry = {
            level: 'info',
            message: 'test message',
            timestamp: new Date().toISOString(),
        };

        await transport.log(entry);

        expect(mockAdapter.log).toHaveBeenCalledWith(entry);
    });

    it('should not delegate log entry to adapter when level is disabled', async () => {
        const entry: LogEntry = {
            level: 'debug',
            message: 'test message',
            timestamp: new Date().toISOString(),
        };

        await transport.log(entry);

        expect(mockAdapter.log).not.toHaveBeenCalled();
    });

    it('should delegate flush to adapter', async () => {
        await transport.flush();
        expect(mockAdapter.flush).toHaveBeenCalled();
    });

    it('should delegate shutdown to adapter', async () => {
        await transport.shutdown();
        expect(mockAdapter.shutdown).toHaveBeenCalled();
    });

    it('should throw if no adapter is provided', () => {
        expect(() => new AdapterTransport({} as any)).toThrow('AdapterTransport requires a valid adapter implementation.');
    });
});
