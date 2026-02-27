/**
 * @file examples/AuditAdapterExample.ts
 * @description Demonstrates how to use the new AdapterTransport for auditing with a custom adapter.
 */
import { syntropyLog } from '../src/SyntropyLog';
import { ILogTransportAdapter } from '../src/logger/transports/adapter.types';
import { AdapterTransport } from '../src/logger/transports/AdapterTransport';
import { LogEntry } from '../src/types';

/**
 * A mock persistence adapter (e.g., simulating Postgres or an API endpoint)
 */
class PostgresAuditAdapter implements ILogTransportAdapter {
    public async log(entry: LogEntry): Promise<void> {
        console.log('--- [PERSISTENCE ADAPTER] Writing to Postgres ---');
        console.log(`[AUDIT] ${entry.timestamp} - ${entry.service}: ${entry.message}`);
        // Here you would do: await this.db.insert(entry);
        console.log('--- [PERSISTENCE ADAPTER] Write complete ---');
    }

    public async flush(): Promise<void> {
        console.log('[PERSISTENCE ADAPTER] Flushing buffers...');
    }

    public async shutdown(): Promise<void> {
        console.log('[PERSISTENCE ADAPTER] Shutting down connection pool...');
    }
}

async function runExample() {
    // 1. Create the adapter and the transport
    const postgresAdapter = new PostgresAuditAdapter();
    const auditTransport = new AdapterTransport({
        adapter: postgresAdapter,
        name: 'PostgresAuditTransport',
    });

    // 2. Initialize SyntropyLog with category mapping
    await (syntropyLog.init as any)({
        logger: {
            serviceName: 'order-service',
            level: 'warn', // High level for standard logs
            transports: {
                // default uses standard console for dev
                default: [],
                // audit logs use our new Postgres adapter
                audit: [auditTransport],
            },
        },
    });

    const logger = syntropyLog.getLogger('order-service');
    const auditLogger = syntropyLog.getLogger('audit');

    // 3. This will be ignored because level is 'warn'
    console.log('\nLogging an INFO message (should be suppressed)...');
    await logger.info('User viewed their cart');

    // 4. This will pass because it's an AUDIT log (bypasses level checks)
    console.log('\nLogging an AUDIT message (should be persisted)...');
    await auditLogger.audit('User completed checkout', {
        orderId: 'ORD-123',
        amount: 99.99,
    });

    // 5. Graceful shutdown
    console.log('\nShutting down...');
    await syntropyLog.shutdown();
}

runExample().catch(console.error);
