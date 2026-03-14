# Testing: mocks y API pública

Este documento aclara qué usar al testear código que depende de SyntropyLog y cómo están organizados los mocks.

---

## API pública de testing (recomendada)

**Entrada:** `syntropylog/testing` o `syntropylog/testing/mock`.

**Usar:** **SyntropyLogMock** — factory y helpers para reemplazar el singleton y los servicios en tests.

| Export | Uso |
|--------|-----|
| `createSyntropyLogMock(spyFn?)` | Crea un mock del facade SyntropyLog con getLogger, getSerializer, etc. |
| `createMockLogger()` | Logger mock con métodos (info, warn, error, …) espiables. |
| `createMockContextManager()` | Context manager mock. |
| `createMockSerializationManager()` | Serialization manager mock. |
| `getMockLogger()` / `getMockContextManager()` / `getMockSerializationManager()` | Acceso a las instancias mock actuales (singleton de test). |
| `resetSyntropyLogMocks()` | Reinicia los mocks; llamar en `beforeEach` para estado limpio. |
| `createTestHelper(spyFn?)` | Helper que combina `createSyntropyLogMock` y `resetSyntropyLogMocks` en beforeEach. |
| `createServiceWithMock(ServiceClass, spyFn?)` | Crea una instancia del servicio inyectando el mock de SyntropyLog. |

**Ejemplo:**

```ts
import {
  createSyntropyLogMock,
  resetSyntropyLogMocks,
  getMockLogger,
} from 'syntropylog/testing';

beforeEach(() => {
  resetSyntropyLogMocks();
  createSyntropyLogMock();
});

it('should log when service runs', () => {
  const logger = getMockLogger();
  // ... ejecutar código que usa syntropyLog.getLogger('x') ...
  expect(logger.info).toHaveBeenCalledWith('expected message');
});
```

---

## MockSyntropyLog (clase, uso interno — preferir SyntropyLogMock)

En el código existe también **MockSyntropyLog** (clase en `src/testing/MockSyntropyLog.ts`). Es un mock **agnóstico del framework de test**: no depende de Vitest/Jest, solo de la interfaz del facade.

- **No está exportado** desde `syntropylog/testing` (el index público solo exporta SyntropyLogMock y los helpers de test-helper).
- **Uso interno / deprecado para nuevos tests:** para tests nuevos se recomienda usar **SyntropyLogMock** y `createSyntropyLogMock()` desde `syntropylog/testing`. MockSyntropyLog se mantiene para tests que ya lo usan o para casos que requieran un mock sin dependencia del runner.
- Se usa en `tests/testing/MockSyntropyLog.test.ts` para tests de la propia clase.
- Si necesitáis un mock sin dependencia de Vitest, podéis importarlo desde la ruta fuente (`src/testing/MockSyntropyLog`); para la mayoría de los tests conviene usar **SyntropyLogMock** y `createSyntropyLogMock()`.

---

## Resumen

| Necesidad | Usar |
|-----------|------|
| Mockear SyntropyLog en tests (Vitest/Jest, etc.) | **SyntropyLogMock**: `createSyntropyLogMock()`, `resetSyntropyLogMocks()`, `getMockLogger()`, etc. desde `syntropylog/testing`. |
| Helper de setup (beforeEach + mock) | `createTestHelper` y/o `createServiceWithMock` desde `syntropylog/testing`. |
| Mock sin dependencia del runner de tests | Clase `MockSyntropyLog` desde `src/testing/MockSyntropyLog` (uso interno o avanzado). |

La **API pública recomendada** es la de **SyntropyLogMock**; el **createTestHelper** que se debe usar es el de `test-helper.ts`, exportado en `syntropylog/testing`.
