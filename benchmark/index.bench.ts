import { run, bench, baseline, group } from 'mitata';
import { syntropyLog as sl, ConsoleTransport, SyntropyLogConfig } from '../src';
import { LogRetentionRules } from '../src/types';
import pino from 'pino';
import winston from 'winston';
import fs from 'fs';

// 1. Setup - We use a dev/null stream to measure logic overhead without I/O bottlenecks
const devNull = fs.createWriteStream(process.platform === 'win32' ? '\\\\.\\nul' : '/dev/null');

// SyntropyLog Setup - Singleton is already managed, we just configure it
// To be fair, we need to bypass the default ConsoleTransport which uses stdout
// We'll create a simple Transport that writes to devNull.
// Must handle both: object (JS pipeline) and pre-serialized string (ruta nativa), else double stringify.
class BenchTransport extends ConsoleTransport {
    public override log(entry: unknown): void {
        const logString = (typeof entry === 'string' ? entry : JSON.stringify(entry)) + '\n';
        devNull.write(logString);
    }
}

const benchTransport = new BenchTransport();

await sl.init({
    logger: {
        level: 'info',
        transports: [benchTransport],
    },
} as SyntropyLogConfig);

const slLogger = sl.getLogger('bench');

// Reproducibility: report if Rust addon is used (same resolution as SerializationManager)
const nativeAddonInUse =
  typeof (sl as unknown as { isNativeAddonInUse?: () => boolean }).isNativeAddonInUse === 'function'
    ? (sl as unknown as { isNativeAddonInUse: () => boolean }).isNativeAddonInUse()
    : false;
console.log('SyntropyLog native addon (Rust):', nativeAddonInUse ? 'yes' : 'no');
if (!nativeAddonInUse) {
  console.log('Tip: build addon (cd syntropylog-native && pnpm run build). Both CJS and ESM use createRequire so addon should load when in node_modules.');
}

// Pino Setup
const pinoLogger = pino({ level: 'info' }, devNull);

// Winston Setup
const winstonLogger = winston.createLogger({
    level: 'info',
    transports: [
        new winston.transports.Stream({ stream: devNull })
    ]
});

const ITERATIONS = 5_000_000;

// Objeto complejo reutilizado en throughput (masking) y en medición de memoria
const complexObj = {
    user: {
        id: 123,
        email: 'secret@example.com',
        name: 'John Doe',
        nested: { token: 'very-secret-token', active: true },
    },
    meta: { reqId: 'abc-123', ua: 'Mozilla/5.0...' },
};

group(`Logging Throughput (${ITERATIONS.toLocaleString()} iterations)`, () => {
    bench('console.log (baseline)', () => {
        devNull.write('Hello Bench\n');
    });

    bench('SyntropyLog (JSON)', () => {
        slLogger.info('Hello Bench');
    });

    bench('Pino', () => {
        pinoLogger.info('Hello Bench');
    });

    bench('Winston', () => {
        winstonLogger.info('Hello Bench');
    });
});

group('Complex Object (same payload, fair comparison)', () => {
    // SyntropyLog como baseline para que salga primero en el summary (referencia de comparación)
    baseline('SyntropyLog (with masking)', () => {
        slLogger.info('User action', complexObj);
    });
    bench('Pino (complex object)', () => {
        pinoLogger.info(complexObj, 'User action');
    });
    bench('Winston (complex object)', () => {
        winstonLogger.info('User action', complexObj);
    });
});

// Fluent API: withRetention acepta JSON complejo (anidado); se serializa igual que el resto del entry
const complexRetention = {
    ttl: 86400,
    maxSize: 100_000,
    policy: { region: 'eu', buckets: ['audit', 'compliance'], tiers: { hot: 7, cold: 90 } },
    tags: ['pii', 'audit'],
};

// Measures: one child logger creation (withRetention) + one log per iteration
group('Fluent API (withRetention + complex JSON)', () => {
    bench('SyntropyLog (withRetention complex)', () => {
        slLogger.withRetention(complexRetention as LogRetentionRules).info('Audit event');
    });
});

// Mitata internamente guarda todo en nanosegundos; el reporter muestra ns o µs según magnitud,
// lo que mezcla unidades en la misma tabla. Ejecutamos run() y luego imprimimos una tabla
// unificada en µs para comparaciones correctas.
const report = await run({
    avg: true,
    json: false,
    colors: true,
    min_max: true,
    percentiles: true,
});

// Tabla unificada: todos los tiempos en microsegundos (1 µs = 1000 ns)
function nsToUs(ns: number): string {
    const us = ns / 1e3;
    return us >= 1000 ? us.toLocaleString('en-US', { maximumFractionDigits: 0 }) : us.toFixed(2);
}

const benchList = report.benchmarks.filter((b) => b.stats && !b.error);
if (benchList.length > 0) {
    const w = Math.max(32, ...benchList.map((b) => b.name.length));
    console.log('\n--- All times in µs (same unit for correct comparison) ---');
    console.log(
        'benchmark'.padEnd(w, ' ') +
            '  avg (µs)   (min … max) (µs)     p75      p99     p999'
    );
    console.log('-'.repeat(w + 60));
    for (const b of benchList) {
        const s = b.stats!;
        const avg = nsToUs(s.avg);
        const min = nsToUs(s.min);
        const max = nsToUs(s.max);
        const p75 = nsToUs(s.p75);
        const p99 = nsToUs(s.p99);
        const p999 = nsToUs(s.p999);
        console.log(
            b.name.padEnd(w, ' ') +
                `  ${avg.padStart(9)}   (${min} … ${max})  ${p75.padStart(8)} ${p99.padStart(8)} ${p999.padStart(8)}`
        );
    }

    // Summary verificado: mismo cálculo que mitata pero mostrando avg en ns para comprobar unidades.
    const groupNames = Array.from(new Set(benchList.map((b) => b.group).filter(Boolean))) as string[];
    for (const groupName of groupNames) {
        const inGroup = benchList.filter((b) => b.group === groupName).sort((a, b) => a.stats!.avg - b.stats!.avg);
        if (inGroup.length < 2) continue;
        const baseline = inGroup[0];
        const baselineAvgNs = baseline.stats!.avg;
        console.log(`\n--- Summary for "${groupName}" (all avg in ns, ratio = other/baseline) ---`);
        console.log(`  ${baseline.name}: avg = ${Math.round(baselineAvgNs).toLocaleString()} ns (baseline)`);
        for (let i = 1; i < inGroup.length; i++) {
            const b = inGroup[i];
            const avgNs = b.stats!.avg;
            const ratio = avgNs / baselineAvgNs;
            console.log(`  ${b.name}: avg = ${Math.round(avgNs).toLocaleString()} ns → ${ratio.toFixed(2)}x slower than baseline`);
        }
    }
}

// --- Consumo de memoria (heap delta por N iteraciones) ---
const MEMORY_ITERATIONS = 100_000;
const gc = typeof globalThis.gc === 'function' ? globalThis.gc : null;

function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${bytes} B`;
}

interface MemoryTask {
    name: string;
    fn: () => void;
}

const memoryTasks: MemoryTask[] = [
    { name: 'console.log (baseline)', fn: () => devNull.write('Hello Bench\n') },
    { name: 'SyntropyLog (JSON)', fn: () => slLogger.info('Hello Bench') },
    { name: 'Pino', fn: () => pinoLogger.info('Hello Bench') },
    { name: 'Winston', fn: () => winstonLogger.info('Hello Bench') },
    { name: 'SyntropyLog (with masking)', fn: () => slLogger.info('User action', complexObj) },
    { name: 'Pino (complex object)', fn: () => pinoLogger.info(complexObj, 'User action') },
    { name: 'Winston (complex object)', fn: () => winstonLogger.info('User action', complexObj) },
    { name: 'SyntropyLog (withRetention complex)', 
      fn: () => slLogger.withRetention(complexRetention as LogRetentionRules).info('Audit event') },
];

console.log('\n--- Memory consumption ---');
if (!gc) {
    console.log('Tip: run with node --expose-gc for stable results (negative deltas = GC noise).\n');
}

const results: { name: string; heapDelta: number; bytesPerOp: number }[] = [];
for (const task of memoryTasks) {
    if (gc) gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < MEMORY_ITERATIONS; i++) task.fn();
    const after = process.memoryUsage().heapUsed;
    let heapDelta = after - before;
    if (heapDelta < 0) heapDelta = 0;
    results.push({
        name: task.name,
        heapDelta,
        bytesPerOp: heapDelta / MEMORY_ITERATIONS,
    });
}

const maxNameLen = Math.max(...results.map((r) => r.name.length));
console.log(`${'benchmark'.padEnd(maxNameLen)}  heap delta (${MEMORY_ITERATIONS.toLocaleString()} iter)  bytes/op`);
console.log('-'.repeat(maxNameLen + 50));
for (const r of results) {
    console.log(`${r.name.padEnd(maxNameLen)}  ${formatBytes(r.heapDelta).padStart(12)}  ${r.bytesPerOp.toFixed(2)}`);
}
console.log('\n(Memory: from repo root run `pnpm run bench:memory` for reliable deltas; otherwise values can be noisy or 0.)');
