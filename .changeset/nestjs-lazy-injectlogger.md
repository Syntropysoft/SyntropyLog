---
"syntropylog": patch
---

fix(nestjs): resolve `@InjectLogger()` loggers lazily

The `@InjectLogger()` transient provider resolved its underlying logger at DI/injection time, so a consumer constructed before `syntropyLog.init()` had run threw `Logger Factory not available` at bootstrap (a common NestJS ordering — init inside a lifecycle hook, or after `NestFactory.create()`). It now returns a lazily-resolved `ILogger` that fetches the logger on first use and memoizes it, matching the already-lazy `SyntropyNestLoggerService`. Additive and non-breaking; the class-name `source` binding is preserved.
