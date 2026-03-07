# Oportunidades de mejora — SyntropyLog

Documento generado a partir de una revisión del código para usar como backlog o como base para issues en GitHub.

---

## 1. Consistencia de idioma (prioridad alta) ✅ Hecho (v0.9.2)

Implementado en v0.9.2:

El proyecto está documentado en inglés (README, JSDoc, mensajes de usuario), pero hay comentarios y mensajes de error en español en el pipeline de serialización.

| Ubicación | Actual | Sugerencia |
|-----------|--------|------------|
| `src/serialization/SerializationPipeline.ts` | `Timeout en etapa '${step.name}' (> ${globalTimeout}ms)` | `Timeout in step '${step.name}' (> ${globalTimeout}ms)` |
| `src/serialization/SerializationPipeline.ts` | Comentarios "Ejecutar pasos", "Carrera de mates", "Seleccionar estrategia..." | Traducir a inglés |
| `src/serialization/pipeline/TimeoutStep.ts` | `'Error en timeout'` | `'Timeout error'` |
| `src/serialization/pipeline/TimeoutStep.ts` | Comentarios "Seleccionar estrategia...", "Calcular timeout..." | Traducir a inglés |

**Beneficio:** Consistencia para contribuidores y usuarios que esperan mensajes en inglés; mejor experiencia en entornos internacionales.

---

## 2. ~~TODO pendiente: `BeaconRedis.multi()`~~ ✅ Hecho (v0.9.2)

Implementado en v0.9.2:

- `RedisCommandExecutor.multi()` devuelve la transacción nativa del cliente.
- `BeaconRedis.multi()` devuelve una `BeaconRedisTransaction` que envuelve la transacción nativa; todos los comandos encolables están delegados y `exec()` / `discard()` pasan por `_executeCommand` (logging, timing, errores).
- `executeScript` dentro de una transacción no está soportado y lanza un error claro.
- Tests añadidos: transacción retornada por `multi()`, instrumentación de `exec()` y `discard()`.

---

## 3. Tipado y uso de `as any`

En `SerializationPipeline.ts`, al construir el resultado se usa `(currentData as any)` para `serializer`, `serializationComplexity`, etc. (aprox. líneas 98, 106-107, 112-113).

**Sugerencia:** Definir un tipo (por ejemplo `SerializableDataWithMeta`) que extienda `SerializableData` con campos opcionales como `serializer`, `serializationComplexity`, y usarlo en lugar de `as any`. Así se mantiene type-safety y se documenta la forma del dato en ese punto del pipeline.

---

## 4. Tests y cobertura

- Hay buena cobertura de tests unitarios (README indica ~84.64%).
- `BeaconRedis.multi()` está cubierto (se espera que lance).
- Los tests de integración viven en `test_integration/`.

**Posibles mejoras:**

- Añadir tests que fuercen timeout en el pipeline (pasos lentos) para validar mensajes de error y que no se pierdan datos críticos.
- Revisar si hay ramas de `LifecycleManager` (por ejemplo init con/sin HTTP, con/sin brokers) sin cubrir.

---

## 5. Documentación y DX

- README y docs en `docs/` están muy completos.
- **Sugerencia:** En la sección de Redis del README (o en una guía de Redis), mencionar que `multi()` no está implementado en el cliente real y que para transacciones en tests se use `BeaconRedisMock`.

---

## 6. Seguridad y mantenimiento (ya abordados recientemente)

Por el CHANGELOG (0.9.1, 0.8.13):

- Código ofuscado eliminado en el módulo Redis.
- `executeScript` refactorizado para evitar falsos positivos de "eval" en scanners.

**Sugerencia:** Mantener esta línea en futuros cambios (evitar patrones que puedan disparar alertas de seguridad sin necesidad).

---

## 7. Resumen de acciones sugeridas

| # | Acción | Esfuerzo | Impacto |
|---|--------|----------|---------|
| 1 | Unificar mensajes y comentarios a inglés en serialization pipeline y TimeoutStep | Bajo | Consistencia, profesionalismo |
| 2 | Decidir e implementar o documentar `BeaconRedis.multi()` | Medio/Alto | Completitud de API Redis |
| 3 | Reemplazar `as any` por tipos explícitos en `SerializationPipeline` | Bajo | Type-safety, mantenibilidad |
| 4 | Tests de timeout en pipeline y revisión de cobertura de LifecycleManager | Medio | Confiabilidad |
| 5 | Documentar limitación de `multi()` en README o guía Redis | Bajo | DX |

Si querés, el siguiente paso puede ser implementar el punto 1 (mensajes y comentarios en inglés) o el 3 (tipado en el pipeline); ambos son cambios acotados y de bajo riesgo.
