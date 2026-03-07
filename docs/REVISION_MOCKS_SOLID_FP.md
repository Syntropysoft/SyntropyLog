# Revisión: mocks — funciones puras, SOLID, guardas

Revisión en bloques de **BeaconRedisMock** aplicando guardas, helpers puros y menos duplicación.

---

## 1. BeaconRedisMock.ts

### Hecho
- **Guardas**: `_getValidEntry`: orden claro (no entry → null, expired → delete + null, wrong type → throw). `expire`: early return `if (!entry) return false`. `incrBy` / `hIncrBy`: `Number.isNaN` y throw temprano.
- **Puro**: `_serialize` ya era puro; añadido `_toKeyArray(keys)` estático puro para normalizar `string | string[]` → `string[]`.
- **Menos mutación directa en loops**: `del` y `exists` usan `_toKeyArray` + `filter().length`. `hDel` usa `filter` para contar borrados. `hSet`: rama string con early return; uso de `Object.hasOwn` donde aplica.
- **ILogger**: `updateConfig` corrige orden de argumentos a `(meta, message)`.

### Opcional (siguiente bloque)
- Extraer lógica de “clave expirada” a un helper que reciba `StoreEntry` y devuelva boolean (puro).
- `scan`: extraer el filtro por MATCH a una función pura `(key, pattern) => boolean`.

---

## Principios aplicados

| Principio        | Aplicación                                                                 |
|-----------------|----------------------------------------------------------------------------|
| Guard clauses   | Early return / throw al inicio de método; un solo nivel de anidación.     |
| Pure functions  | `_serialize`, `_toKeyArray`; helpers sin efectos.                         |
| SOLID (SRP)     | Responsabilidades concentradas por componente.                              |
| DRY             | Helpers reutilizables y un solo loop donde aplica.                          |
| Menos mutación  | Uso de `filter`/`length` y returns tempranos en lugar de contadores en loops. |

Los mocks siguen siendo wrappers de la interfaz original: la lógica extra es mínima y predecible (guardas + delegación).

---

## 2. TimeoutStep.ts

### Hecho
- **Pure**: `buildSuccessPayload` y `buildErrorPayload` son funciones puras (data + duración + estrategia/error → objeto).
- **Guardas**: `execute` intenta estrategia + cálculo; en catch solo construye payload de error. Constante `DEFAULT_TIMEOUT_MS`.
- **Estrategia única**: Solo se usa la estrategia `default`; `selectTimeoutStrategy` devuelve `timeoutStrategies.get('default') ?? null` (sin lookup por tipo de data).

---

## 3. SerializationPipeline.ts

### Hecho
- **selectTimeoutStrategy**: Obtiene solo `timeoutStrategies.get('default')`; guarda que lanza si no hay estrategia default.
- **Pure**: `buildSuccessResult` y `buildErrorResult` estáticos que construyen `SerializationResult` sin efectos.
- **Constantes**: `DEFAULT_SERIALIZER`, `UNKNOWN_STRATEGY`; `globalTimeout` con `??` 50.
- **Estrategia única**: Solo **DefaultTimeoutStrategy** (5000 ms). Eliminadas las estrategias por adaptador (Prisma, TypeORM, MySQL, PostgreSQL, SQL Server, Oracle).
