import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyntropyLog } from '../../src/SyntropyLog';
import { SpyTransport } from '../../src/logger/transports/SpyTransport';

describe('Audit Routing and Level Bypassing', () => {
    let syntropyLog: SyntropyLog;
    let defaultSpy: SpyTransport;
    let auditSpy: SpyTransport;

    beforeEach(() => {
        syntropyLog = SyntropyLog.getInstance();
        syntropyLog._resetForTesting();
        defaultSpy = new SpyTransport();
        auditSpy = new SpyTransport();
    });

    it('should route audit logs to dedicated transports', async () => {
        await (syntropyLog.init as any)({
            logger: {
                level: 'info',
                serializerTimeoutMs: 50,
                transports: {
                    default: [defaultSpy],
                    audit: [auditSpy],
                },
            },
        });

        const logger = syntropyLog.getLogger('my-service');
        const auditLogger = syntropyLog.getLogger('audit');

        await logger.info('standard log');
        await auditLogger.audit('critical audit log');

        expect((defaultSpy as any).entries).toHaveLength(2); // 1 from framework init, 1 from standard log
        expect((defaultSpy as any).entries[0].message).toContain('initialized successfully');
        expect((defaultSpy as any).entries[1].message).toBe('standard log');

        expect((auditSpy as any).entries).toHaveLength(1);
        expect((auditSpy as any).entries[0].message).toBe('critical audit log');
        expect((auditSpy as any).entries[0].level).toBe('audit');
    });

    it('should bypass lower global log levels for audit logs', async () => {
        await (syntropyLog.init as any)({
            logger: {
                level: 'error', // High global level
                serializerTimeoutMs: 50,
                transports: {
                    default: [defaultSpy],
                    audit: [auditSpy],
                },
            },
        });

        const logger = syntropyLog.getLogger('my-service');
        const auditLogger = syntropyLog.getLogger('audit');

        await logger.info('this should be ignored');
        await auditLogger.audit('this should be captured');

        expect((defaultSpy as any).entries).toHaveLength(0); // framework init log suppressed by error level

        expect((auditSpy as any).entries).toHaveLength(1);
        expect((auditSpy as any).entries[0].message).toBe('this should be captured');
    });

    it('should allow audit logs from any logger if level is sufficient', async () => {
        // Note: audit level is 70, which is higher than fatal (60)
        await (syntropyLog.init as any)({
            logger: {
                level: 'fatal',
                serializerTimeoutMs: 50,
                transports: [auditSpy], // All loggers share this one for this test
            },
        });

        const logger = syntropyLog.getLogger('any-service');
        await logger.audit('audit from any logger');

        expect((auditSpy as any).entries).toHaveLength(1); // init log suppressed by FATAL level, only audit remains
        expect((auditSpy as any).entries[0].message).toBe('audit from any logger');
    });
});
