# Revisión: mocks — funciones puras, SOLID, guardas

Revisión en bloques de **BeaconRedisMock**, **MockBrokerAdapter** y **MockHttpClient** aplicando guardas, helpers puros y menos duplicación.

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

## 2. MockBrokerAdapter.ts

### Hecho
- **Guardas centralizadas**: `guardReject(method)` async: si hay timeout → delay y throw; si hay error configurado → throw; si no, resuelve. `connect`, `disconnect`, `publish`, `subscribe` delegan en `guardReject('connect' | …)`.
- **createMock**: guarda única `if (this.spyFn == null) throw new Error(SPY_REQUIRED_MESSAGE)`; mensaje corto en constante.

### Opcional
- Si se quiere evitar mutar `this.errors`/`this.timeouts` desde fuera, se pueden exponer solo `setError`/`setTimeout` y mantener el estado interno encapsulado (ya es así).

---

## 3. MockHttpClient.ts

### Hecho
- **Respuesta por defecto**: constante pura `DEFAULT_RESPONSE`; se usa `{ ...DEFAULT_RESPONSE }` en todos los sitios que devolvían el mismo objeto.
- **Guardas**: `createMock`: `if (this.spyFn == null) throw new Error(SPY_REQUIRED_MESSAGE)`.
- **DRY**: `updateMethodImplementations()` pasa a un único loop sobre `METHOD_IMPLS` (array de `{ method, key, buildReq }`). Cada método HTTP se configura llamando a `this.request(buildReq(args))`.
- **setResponse / setError / setTimeout**: uso de ternario o early return para “si method coincide → respuesta/error, si no → DEFAULT_RESPONSE”.

### Opcional
- Lógica de “timeout para este método” podría extraerse a un helper similar a `guardReject` en MockBrokerAdapter si se añade más comportamiento.

---

## Principios aplicados

| Principio        | Aplicación                                                                 |
|-----------------|----------------------------------------------------------------------------|
| Guard clauses   | Early return / throw al inicio de método; un solo nivel de anidación.     |
| Pure functions  | `_serialize`, `_toKeyArray`, `DEFAULT_RESPONSE`; helpers sin efectos.     |
| SOLID (SRP)     | `guardReject` y `METHOD_IMPLS` concentran una responsabilidad cada uno.    |
| DRY             | Un solo `guardReject` en broker; un solo loop en `updateMethodImplementations`. |
| Menos mutación  | Uso de `filter`/`length` y returns tempranos en lugar de contadores en loops. |

Los mocks siguen siendo wrappers de la interfaz original: la lógica extra es mínima y predecible (guardas + delegación).
