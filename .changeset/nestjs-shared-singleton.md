---
"syntropylog": minor
---

**NestJS subpath dual-singleton fixed (startup crash).** The `syntropylog/nestjs` build inlined its own copy of the core module, so it carried a **second, separate** SyntropyLog singleton. Calling `syntropyLog.init()` on the main instance left the nestjs one uninitialized, and the documented no-argument setup — `new SyntropyNestLoggerService()` / `SyntropyLogModule.forRoot()` — threw `Logger Factory not available` at startup in any real app. The duplicate core also produced two unrelated copies of the nominal types (`Transport` et al.), so passing the main singleton explicitly (`forRoot({ syntropyLog })`) tripped `TS2322` and forced an `as never` cast.

Fixed by treating the core package (`syntropylog`) as **external** in the nestjs build: the subpath now `require('syntropylog')`s the one shared runtime singleton and references the same types. The nestjs bundle dropped from ~172 KB (full duplicate core) to ~13 KB. The no-arg forms work after a single `init()`, and `forRoot({ syntropyLog })` / `new SyntropyNestLoggerService(syntropyLog)` type-check with no cast. `ILogger` is now also re-exported from the package entry (additive — it was already public via the type surface).
