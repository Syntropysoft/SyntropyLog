# NestJS

Initialize SyntropyLog **once** at bootstrap, then route Nest's own logs through it with a thin
`LoggerService` that wraps the main singleton — the production pattern. `@nestjs/*`, `reflect-metadata`,
and `rxjs` are needed only in Nest apps.

```typescript
// syntropy-nest-logger.service.ts — a Nest LoggerService backed by the main singleton
import { LoggerService } from '@nestjs/common';
import { syntropyLog } from 'syntropylog';

export class SyntropyNestLoggerService implements LoggerService {
  private ctx(p: unknown[]) { return (p.find((x) => typeof x === 'string') as string) ?? 'nest'; }
  log(m: unknown, ...p: unknown[])     { syntropyLog.getLogger('nest').info({ nestContext: this.ctx(p) }, String(m)); }
  error(m: unknown, ...p: unknown[])   { syntropyLog.getLogger('nest').error({ nestContext: this.ctx(p) }, String(m)); }
  warn(m: unknown, ...p: unknown[])    { syntropyLog.getLogger('nest').warn({ nestContext: this.ctx(p) }, String(m)); }
  debug(m: unknown, ...p: unknown[])   { syntropyLog.getLogger('nest').debug({ nestContext: this.ctx(p) }, String(m)); }
  verbose(m: unknown, ...p: unknown[]) { syntropyLog.getLogger('nest').trace({ nestContext: this.ctx(p) }, String(m)); }
}

// main.ts — init BEFORE create, then attach the logger
import { syntropyLog } from 'syntropylog';
await syntropyLog.init({ logger: { serviceName: 'my-app', level: 'info' } });
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,                          // hold early logs until the logger is attached
  logger: new SyntropyNestLoggerService(),   // Nest's own logs now flow through SyntropyLog
});

// any.service.ts — bind the class name as `source`, no DI plumbing needed
@Injectable()
export class PaymentService {
  private readonly log = syntropyLog.getLogger('payments').withSource('PaymentService');
  charge() { this.log.info({ amount: 1500 }, 'Charging'); } // entry includes source: 'PaymentService'
}
```

> **The packaged `syntropylog/nestjs` subpath** (`SyntropyLogModule`, `SyntropyNestLoggerService`,
> `@InjectLogger`) shares the **one** runtime singleton you `init()` — no bundled second copy. Initialize
> once, then `SyntropyLogModule.forRoot({ syntropyLog })` wires the module to that instance (passing it
> explicitly stays the recommended form for multi-instance / test setups). `@InjectLogger()` resolves its
> logger **lazily**, on first use — so a provider can be constructed *before* `init()` has run (init inside
> a lifecycle hook, or after `NestFactory.create()`) without throwing `Logger Factory not available` at
> bootstrap. The hand-rolled `LoggerService` above remains a fine minimal alternative.

