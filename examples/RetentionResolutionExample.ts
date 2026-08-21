/**
 * @file examples/RetentionResolutionExample.ts
 * @description Resolving a retention policy OUTSIDE the logging pipeline.
 *
 * Run: npx tsx examples/RetentionResolutionExample.ts
 *
 * The case: an audit journal (BCRA A7724 §9.1 — six-year retention) written by two
 * paths into the same table.
 *
 *   1. technical path — `logger.withRetention(name).audit(...)`, the framework tags the
 *      entry and the transport persists it.
 *   2. domain path    — `recordTrace(event)` writes straight to the database. No logger
 *      is involved, yet the row must carry the very policy it was filed under.
 *
 * Resolving the rule later from a mutable catalog table does not satisfy the regulation:
 * a record written in 2026 and read in 2030 would report the 2030 policy. It has to land
 * in a column, at write time, on both paths — hence `getRetentionPolicy(name)`.
 */
import { syntropyLog } from '../src/SyntropyLog';
import {
  defineRetentionPolicies,
  RetentionPolicyNotFoundError,
} from '../src/index';
import { ILogTransportAdapter } from '../src/logger/transports/adapter.types';
import { AdapterTransport } from '../src/logger/transports/AdapterTransport';
import { CompactConsoleTransport } from '../src/logger/transports/CompactConsoleTransport';
import { LogEntry } from '../src/types';

/** The registry — declared once, `defineRetentionPolicies` keeps the names literal. */
const retentionPolicies = defineRetentionPolicies({
  OPERACIONES: { years: 6, standard: 'BCRA A7724 9.1', tier: 'cold' },
  CONFIG: { years: 10, standard: 'BCRA A7724 9.3' },
});

type PolicyName = keyof typeof retentionPolicies;

/** Stands in for the audit table both paths write into. */
const auditTable: Record<string, unknown>[] = [];

/** Technical path: the transport that persists what the framework tagged. */
class AuditJournalAdapter implements ILogTransportAdapter {
  public async log(entry: LogEntry): Promise<void> {
    auditTable.push({
      via: 'logger',
      at: entry.timestamp,
      message: entry.message,
      retention: entry.retention, // the class name — a string, always
      retention_until: entry.retentionUntil, // the window, materialized by the framework
    });
  }
}

/** Domain path: no logger anywhere in this function. */
async function recordTrace(event: {
  at: string;
  action: string;
  policy: PolicyName;
}) {
  // The same registry the framework resolves against — one source, one answer. The rules go
  // in the row because the catalog is mutable and this row must still say, in 2032, which
  // revision it was filed under.
  const at = new Date(event.at);
  const policy = syntropyLog.getRetentionPolicy(event.policy);
  const until = syntropyLog.getRetentionUntil(event.policy, at);

  auditTable.push({
    via: 'domain',
    at: event.at,
    action: event.action,
    retention: event.policy, // same class name as the logger path
    retention_until: until?.toISOString(), // same computation, leap day included
    retention_rules: policy, // the rule as filed
  });
}

async function main() {
  await syntropyLog.init({
    logger: {
      serviceName: 'echeq-service',
      level: 'warn', // keeps the console quiet; audit bypasses the level
      transports: {
        default: [new CompactConsoleTransport()],
        audit: [
          new AdapterTransport({
            adapter: new AuditJournalAdapter(),
            name: 'AuditJournal',
          }),
        ],
      },
    },
    retentionPolicies,
    // The class name and the window always travel. The rules are opt-in: turn them on when the
    // consumer is out of process and cannot resolve a name against the registry.
    retention: { version: 'E6-1' },
  });

  // ── 1. Technical path — the record IS the log entry.
  await syntropyLog
    .getLogger('audit')
    .withRetention('OPERACIONES')
    .audit('eCheq emitido');

  // ── 2. Domain path — the framework never sees this write.
  await recordTrace({
    at: '2026-08-20T12:00:00.000Z',
    action: 'echeq.emitido',
    policy: 'OPERACIONES',
  });

  console.log('--- audit table ---');
  console.dir(auditTable, { depth: null });

  // Both rows carry the same class, because both resolved against the same frozen registry —
  // one declared in init(), not two that can drift. The windows differ only because the two
  // events happened at different times, which is the point of materializing the date.
  const [tagged, persisted] = auditTable;
  console.log(
    '\nsame class on both paths:',
    tagged.retention === persisted.retention
  );

  // ── 3. Listing the registry — diagnostics, or seeding a catalog table.
  console.log(
    '\nregistered policies:',
    Object.keys(syntropyLog.getRetentionPolicies())
  );

  // ── 4. A miss is loud. A compliance column that silently lands NULL is worse
  //       than a failure at the call site — same error as the fluent path.
  try {
    syntropyLog.getRetentionPolicy('OPERACIONES_'); // typo
  } catch (err) {
    const e = err as RetentionPolicyNotFoundError;
    console.log('\nunknown policy ->', e.name, '| available:', e.available);
  }

  await syntropyLog.shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
