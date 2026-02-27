import { describe, it, expect } from 'vitest';
import { UniversalLogFormatter } from '../../../src/logger/formatters/UniversalLogFormatter';
import { LogEntry } from '../../../src/types';

describe('UniversalLogFormatter', () => {
    it('should map flat fields correctly', () => {
        const formatter = new UniversalLogFormatter({
            mapping: {
                msg: 'message',
                lvl: 'level'
            }
        });

        const entry: LogEntry = {
            level: 'info',
            message: 'test message',
            timestamp: '2023-10-27T10:00:00Z',
            bindings: {},
        };

        const result = formatter.format(entry);
        expect(result).toEqual({
            msg: 'test message',
            lvl: 'info'
        });
    });

    it('should resolve nested paths from bindings and metadata', () => {
        const formatter = new UniversalLogFormatter({
            mapping: {
                user_id: 'userId', // shorthand for bindings/metadata
                session: 'metadata.sessionId',
                tag: 'bindings.tags.0'
            }
        });

        const entry: LogEntry = {
            level: 'info',
            message: 'test',
            timestamp: '2023-10-27T10:00:00Z',
            bindings: {
                userId: 'u123',
                tags: ['important']
            },
            metadata: {
                sessionId: 's456'
            }
        };

        const result = formatter.format(entry);
        expect(result).toEqual({
            user_id: 'u123',
            session: 's456',
            tag: 'important'
        });
    });

    it('should support static values and fallbacks', () => {
        const formatter = new UniversalLogFormatter({
            mapping: {
                type: { value: 'LOG_EVENT' },
                trace: ['metadata.traceId', { value: 'none' }]
            }
        });

        const entry: LogEntry = {
            level: 'info',
            message: 'test',
            timestamp: '2023-10-27T10:00:00Z',
            bindings: {},
        };

        const result = formatter.format(entry);
        expect(result).toEqual({
            type: 'LOG_EVENT',
            trace: 'none'
        });
    });

    it('should include all context if includeAllIn is set', () => {
        const formatter = new UniversalLogFormatter({
            mapping: { m: 'message' },
            includeAllIn: 'full'
        });

        const entry: LogEntry = {
            level: 'info',
            message: 'hi',
            timestamp: '2023-10-27T10:00:00Z',
            bindings: { a: 1 },
            metadata: { b: 2 }
        };

        const result = formatter.format(entry);
        expect(result.m).toBe('hi');
        expect(result.full).toEqual({ a: 1, b: 2 });
    });
});
