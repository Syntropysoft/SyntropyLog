/**
 * @file examples/AuditAdapterExample.ts
 * @description Demonstrates how to use the new AdapterTransport for auditing with a custom adapter.
 */
import { syntropyLog } from '../src/SyntropyLog';
import { ILogTransportAdapter } from '../src/logger/transports/adapter.types';
import { AdapterTransport } from '../src/logger/transports/AdapterTransport';
import { LogEntry } from '../src/types';

/**
 * Mock of a pg-style pool (no ORM). At minimum we mock pool.query for INSERT.
 */
function createMockPool() {
  return {
    async query(
      text: string,
      values?: unknown[]
    ): Promise<{ rowCount: number }> {
      console.log(
        '[POOL] query:',
        text.substring(0, 60) + (text.length > 60 ? '...' : '')
      );
      if (values?.length) console.log('[POOL] values:', values);
      return { rowCount: 1 };
    },
    async end(): Promise<void> {
      console.log('[POOL] end()');
    },
  };
}

/**
 * Persistence adapter that uses pool.query (raw SQL, no ORM).
 */
class PostgresAuditAdapter implements ILogTransportAdapter {
  constructor(
    private pool: {
      query: (
        text: string,
        values?: unknown[]
      ) => Promise<{ rowCount: number }>;
      end?: () => Promise<void>;
    }
  ) {}

  public async log(entry: LogEntry): Promise<void> {
    console.log('--- [PERSISTENCE ADAPTER] Writing to Postgres ---');
    const sql = `INSERT INTO audit_logs (timestamp, service, message, level) VALUES ($1, $2, $3, $4)`;
    const values = [entry.timestamp, entry.service, entry.message, entry.level];
    await this.pool.query(sql, values);
    console.log('--- [PERSISTENCE ADAPTER] Write complete ---');
  }

  public async flush(): Promise<void> {
    console.log('[PERSISTENCE ADAPTER] Flushing buffers...');
  }

  public async shutdown(): Promise<void> {
    console.log('[PERSISTENCE ADAPTER] Shutting down connection pool...');
    if (this.pool.end) await this.pool.end();
  }
}

async function runExample() {
  // 1. Mock pool (pg-style); in production use: import { Pool } from 'pg'; const pool = new Pool(...)
  const pool = createMockPool();
  const postgresAdapter = new PostgresAuditAdapter(pool);
  const auditTransport = new AdapterTransport({
    adapter: postgresAdapter,
    name: 'PostgresAuditTransport',
  });

  // 2. Initialize SyntropyLog with category mapping (wait for ready before getLogger)
  await new Promise<void>((resolve, reject) => {
    syntropyLog.on('ready', () => resolve());
    syntropyLog.on('error', (err) => reject(err));
    syntropyLog.init({
      logger: {
        serviceName: 'order-service',
        level: 'warn', // High level for standard logs
        serializerTimeoutMs: 100,
        transports: {
          // default uses standard console for dev
          default: [],
          // audit logs use our new Postgres adapter
          audit: [auditTransport],
        },
      },
    });
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
