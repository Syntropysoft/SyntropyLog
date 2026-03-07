# PR description (copy into your Pull Request)

---

## Breaking changes

- **Config**: `syntropyLog.init()` no longer accepts `http` or `brokers`; the core only manages Redis.
- **API**: `SyntropyLog.getHttp()` and `SyntropyLog.getBroker()` have been removed. Callers must obtain HTTP/broker clients from their own app or from `syntropylog/http` / `syntropylog/brokers` directly.

## Migration

- **If you used `getHttp()` or `getBroker()`**: Migrate to whatever your app uses to expose those clients (e.g. dependency injection, or instantiating from `syntropylog/http` / `syntropylog/brokers`).
- **If you passed `http` or `brokers` in `init()`**: Remove those options; the core no longer uses them.

## Context for reviewers (High Risk)

This PR is marked **High Risk** because it removes public config/API surface and changes logger transport selection and Redis transaction behavior. To mitigate:

- **Tests**: Unit and integration tests cover the new flows; pre-commit runs lint, tests, and build.
- **Breaking changes and migration** are documented in `CHANGELOG.md` (section [0.9.2], including the Migration subsection) so existing integrations can plan the upgrade.

---
