# Known Issues — code-level bugs to fix

Tracking notes for confirmed bugs in the **library code** (not docs). Each entry is written
so it can be pasted straight into a GitHub issue (`Syntropysoft/SyntropyLog`).

These were surfaced by an end-to-end distributed example (5 services: NestJS + Fastify +
Express + worker, Redis + Kafka, React dashboard) — `syntropylog-examples/22-distributed-orders-kafka`.
A trivial single-process example never exercises the native-addon path or the `syntropylog/nestjs`
subpath the way a real multi-service app does, which is exactly why these only showed up here.

The **documentation** has already been corrected to steer users onto the safe patterns
(README NestJS + masking sections, `docs/masking.md`, `docs/context.md`, `docs/migration-from-pino.md`).
**This file tracks the underlying code fixes that still need to happen.**

Affected version: **1.2.0**. Status: **open** (docs worked around, code unfixed).

---

## Issue 1 — `syntropylog/nestjs` bundles its own SyntropyLog singleton (dual-singleton)

**Labels:** `bug`, `nestjs`, `build/bundling`
**Severity:** high — the documented "no-arg" setup throws at startup in any real app.

### Describe the bug
The `syntropylog/nestjs` subpath ships its **own copy** of the core SyntropyLog singleton,
separate from the instance you get via `import { syntropyLog } from 'syntropylog'`. So when you
`syntropyLog.init(...)` the main singleton and then wire NestJS with the **no-argument** forms
(`new SyntropyNestLoggerService()` / `SyntropyLogModule.forRoot()`), Nest's logger talks to a
**different, uninitialized** instance and throws `Logger Factory not available` at startup
(it can cascade into a stack overflow as Nest retries logging the failure).

### To Reproduce
```ts
// main.ts
import { NestFactory } from '@nestjs/core';
import { syntropyLog } from 'syntropylog';
import { SyntropyNestLoggerService } from 'syntropylog/nestjs';
import { AppModule } from './app.module';

await syntropyLog.init({ logger: { serviceName: 'orders' } }); // initializes the MAIN singleton

const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
  logger: new SyntropyNestLoggerService(),   // ← no arg: resolves the subpath's OWN singleton
});
await app.listen(3000);
// → runtime error: "Logger Factory not available"
```
`@Module({ imports: [SyntropyLogModule.forRoot()] })` (no arg) fails the same way.

### Expected behavior
`import { syntropyLog } from 'syntropylog'` and the singleton referenced inside
`syntropylog/nestjs` should be **the same module instance**, so initializing one initializes
the other. The no-arg convenience forms should "just work" after a single `init()`.

### Actual behavior
Two distinct singleton instances exist in the process. Initializing the main one leaves the
nestjs one uninitialized → `Logger Factory not available`. Passing the instance explicitly
(`new SyntropyNestLoggerService(syntropyLog)`, `forRoot({ syntropyLog })`) also trips a
**duplicate bundled type** clash (`TS2322`) because the subpath re-declares the core types,
forcing an `as never` cast.

### Root cause
The Rollup build for the `syntropylog/nestjs` entry **bundles the core module** (including the
singleton state and its types) instead of treating `syntropylog` as an external import shared
at runtime. Two bundled copies → two singletons → two type declarations.

### Proposed fix
In `rollup.config.mjs`, mark the main package entry (`syntropylog`) as **external** for the
`nestjs` subpath build so it resolves to the same runtime instance (and the same `.d.ts`),
instead of inlining a second copy. Verify after the fix that:
- `Object.is` identity holds: the instance inside `syntropylog/nestjs` === `import { syntropyLog }`.
- `new SyntropyNestLoggerService(syntropyLog)` and `forRoot({ syntropyLog })` type-check with no cast.
- the no-arg forms work after a single `init()`.

### Current workaround (documented)
Don't use the subpath's no-arg forms. Write a **local** `LoggerService` that wraps the main
singleton — this is the production pattern in `echeq-sandbox-nestjs`:
```ts
// syntropy-nest-logger.service.ts (local, in your app)
import { LoggerService } from '@nestjs/common';
import { syntropyLog } from 'syntropylog';

export class SyntropyNestLoggerService implements LoggerService {
  private readonly log = syntropyLog.getLogger('nest');
  log(m: any, ctx?: string)   { this.log.info({ ctx }, String(m)); }
  error(m: any, t?: string, ctx?: string) { this.log.error({ ctx, trace: t }, String(m)); }
  warn(m: any, ctx?: string)  { this.log.warn({ ctx }, String(m)); }
  debug(m: any, ctx?: string) { this.log.debug({ ctx }, String(m)); }
  verbose(m: any, ctx?: string){ this.log.trace({ ctx }, String(m)); }
}
```
Services log via `syntropyLog.getLogger(name).withSource('ClassName')` — no `@InjectLogger`,
no `SyntropyLogModule`. See README → NestJS section.

---

## Issue 2 — native masking engine ignores default rules spread back in via `getDefaultMaskingRules()`

**Labels:** `bug`, `masking`, `native-addon`, `security`
**Severity:** high — silent PII leak under the **default** engine.

### Describe the bug
The README claims **byte-for-byte parity** between the native Rust addon (the default engine)
and the JS fallback. It does **not** hold for this case: if you disable the built-in defaults
and re-add them by spreading `getDefaultMaskingRules()` into `rules`, the **native addon does
not apply those spread-in rules**, so PII is logged **in clear**. The pure-JS fallback masks
correctly — so the bug is invisible unless you happen to run with the native addon (which is
the default), making it an easy-to-miss production PII leak.

### To Reproduce
```js
const { syntropyLog, getDefaultMaskingRules, ConsoleTransport } = require('syntropylog');

await syntropyLog.init({
  logger: { serviceName: 'repro', level: 'info', transports: [new ConsoleTransport()] },
  masking: {
    enableDefaultRules: false,                 // turn built-ins off...
    maskChar: '*',
    rules: [ ...getDefaultMaskingRules() ],     // ...and re-add them by spreading
  },
});

syntropyLog.getLogger().info(
  { email: 'a@b.com', cardNumber: '4111 1111 1111 1234', cvv: '123' },
  'pii',
);
```
- Native addon (default): `cardNumber` printed **unmasked** ❌
- Same config + `disableNativeAddon: true` (forces JS): `cardNumber` masked ✅
- `enableDefaultRules: true` (no spread): masked under **both** engines ✅

### Expected behavior
Either parity holds (the native engine applies the exact rule set it's handed, including rules
that originated from `getDefaultMaskingRules()`), **or** the spread-back-in pattern fails loudly
(throws / `onSerializationFallback`) instead of silently leaking. Whatever rule array the JS
engine masks on, the native engine must mask on the same array.

### Root cause (suspected)
The native addon is configured from the **default-rules flag**, not purely from the resolved
`rules` array. With `enableDefaultRules: false`, the addon is told "no defaults" and the
spread-in default rules don't survive the JS→native rule marshaling — they're recognized only
by the JS engine. So the two engines run on **different effective rule sets**.

### Proposed fix
Drive the native engine from the **same fully-resolved rule list** the JS engine uses (after
applying `enableDefaultRules` + spreads + custom rules), so identity of rule sets — not the
flag — determines behavior. Add a parity fixture asserting that
`{ enableDefaultRules: false, rules: [...getDefaultMaskingRules()] }` produces identical output
in both engines (currently it does not).

### Current workaround (documented)
Use `enableDefaultRules: true` and **append** custom rules on top — never
`enableDefaultRules: false` + spread. README masking section + `docs/masking.md` now warn
against the spread pattern explicitly.

---

_Last updated: 2026-06-20. Reproductions run against syntropylog@1.2.0 on Node 20._
