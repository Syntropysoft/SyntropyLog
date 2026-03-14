# SyntropyLog — Análisis exhaustivo del código y plan de mejoras

Este documento resume una revisión exhaustiva del código de SyntropyLog y un plan de trabajo priorizado para abordar las oportunidades de mejora.

**Alcance:** `src/`, `tests/`, `benchmark/`, `syntropylog-native/`, configuración y build (Rollup, Vitest), API pública y exportación de tipos.

---

### Último paso completado / Siguiente paso

- **Último paso completado:**  
  **Fase 5** (CI y documentación): 5.1 — Job "Benchmark (native addon)" en ci.yaml: compila el addon, ejecuta el benchmark y comprueba "native addon (Rust): yes"; 5.2 — Sección "Documentation" en README con enlaces al plan de mejoras y a benchmarks.
- **Siguiente paso sugerido:**  
  **Fase 2, tarea 2.4** — Test de integración con addon nativo (opcional). Mantenimiento continuo.

---

## Parte 1 — Análisis por área

### 1.1 Rendimiento y hot path

| Hallazgo | Ubicación | Severidad | Notas |
|----------|-----------|-----------|--------|
| **Timestamp** | Logger, SerializationManager | Media | `Date.now()` por log está bien; el comentario en SerializationManager sugiere "numérico como Pino" — ya es numérico. Opcional: temporizador de alta resolución solo para métricas. |
| **util.format** | Logger.parseLogArgs | Baja | Solo se usa cuando hay argumentos de formato; el fast path (string único) lo evita. Se podría ofrecer un formateador más liviano para casos solo `%s` si hiciera falta. |
| **Asignación de objetos en hot path** | Logger._log | Media | El fast path evita construir el entry completo cuando `args.length === 1` y es string; cuando hay context/bindings, `Object.assign({}, context, this.bindings)` asigna. Valorar reutilización o merge perezoso solo al serializar. |
| **Lógica duplicada "hasExtra"** | Logger._log | Baja | El mismo bucle para context/bindings aparece dos veces (fast path y camino normal). Extraer a un helper pequeño para reducir duplicación y complejidad de ramas. |
| **Fallback del addon nativo** | SerializationManager | Baja | catch vacío en la ruta nativa; el fallo pasa al pipeline JS. No se registra el fallo del nativo (por diseño para evitar recursión). Opcional: callback configurable `onNativeError` para observabilidad. |
| **serialize() vs serializeDirect()** | SerializationManager | Info | Dos rutas (entry object nativo vs argumentos directos). Algo de duplicación al construir entry y llamar al nativo; podría reducirse con un helper interno "try native". |
| **Duración de pasos del pipeline** | SerializationPipeline | Baja | Cada paso usa `Date.now()` antes/después; aceptable. Para throughput muy alto, un único timing del pipeline completo podría bastar si no se requieren métricas por paso. |
| **HygieneStep** | pipeline/HygieneStep.ts | Baja | Mutación in-place para romper ciclos; evita copia completa. Bien. La profundidad de recursión = profundidad del objeto; ya protegida por maxDepth en otro lugar. |
| **MaskingEngine** | MaskingEngine.ts | Media | Aplanar → enmascarar → reconstruir es O(n). Timeout de regex (regexTimeoutMs) y `_isDefaultRule` para test sync evitan IPC. Perfilar p99/p999 bajo carga para ver si domina regex o reconstrucción. |

**Resumen:** El hot path ya está optimizado (serializeDirect, addon nativo, fast path de un solo string). Principales ganancias: reducir asignaciones en la ruta "hasExtra" y observabilidad opcional de fallos del nativo. La latencia de cola del masking es la principal oportunidad de benchmark (ver benchmark-report.md).

---

### 1.2 Arquitectura y API pública

| Hallazgo | Ubicación | Severidad | Notas |
|----------|-----------|-----------|--------|
| **type-exports.ts desincronizado** | type-exports.ts vs index.ts | Alta | type-exports se usa por rollup-plugin-dts para .d.ts. **No** exporta: ColorfulConsoleTransport, AdapterTransport, UniversalAdapter, UniversalLogFormatter. Las declaraciones de tipos publicadas pueden no incluir estos. index.ts sí los exporta como valores. **Acción:** Alinear type-exports con index.ts (añadir exportaciones faltantes) o generar .d.ts desde index.ts + un único barrel de tipos. |
| **Dos APIs de mock** | testing/MockSyntropyLog.ts vs SyntropyLogMock.ts | Media | MockSyntropyLog (clase) se usa en tests, no en testing/index. SyntropyLogMock (factory) es la API pública de testing. Inconsistencia de naming (MockX vs XMock) y dos patrones pueden confundir a contribuidores. **Acción:** Documentar la API pública deseada (SyntropyLogMock) y deprecar o internalizar MockSyntropyLog; o unificar bajo un solo nombre. |
| **createTestHelper** | MockSyntropyLog.ts vs test-helper.ts | Baja | Dos implementaciones distintas; testing/index exporta la de test-helper. Asegurar que los tests que necesitan la otra estén migrados y eliminar o internalizar claramente el duplicado. |
| **Sin index en subpaquetes** | config/, serialization/, logger/transports/, sanitization/, masking/ | Baja | Los imports usan rutas directas (p. ej. config.validator, SerializationStep). No es un bug pero acopla a nombres de archivo. Opcional: añadir barrels index.ts para imports más limpios y refactors futuros. |
| **Estado de LifecycleManager** | LifecycleManager.ts | Baja | Máquina de estados (NOT_INITIALIZED → READY → SHUTDOWN, etc.) clara. init() y shutdown() evitan doble llamada. Bien. |
| **Routing del Logger** | Logger.ts | Baja | pendingRouting se limpia al entrar en _log (captureEffectiveTransports). Evita que una llamada consuma el override de otra. Correcto. |

**Resumen:** Primero corregir type-exports vs index.ts (corrección de tipos publicados). Luego aclarar la historia de mocks de testing y, opcionalmente, los barrel indexes.

---

### 1.3 Tipos e internal-types

| Hallazgo | Ubicación | Severidad | Notas |
|----------|-----------|-----------|--------|
| **types.ts reexporta internal-types** | types.ts | Corregido | types.ts ya no redefine LoggerOptions ni LogEntry; ambos se definen solo en internal-types (con LogLevel) y se reexportan desde types.ts. Ver [type-ownership.md](type-ownership.md). |
| **SerializationMetadata \| null** | SerializationManager | Corregido | Era `result.metadata.timeoutStrategy`; ya corregido a `result.metadata?.timeoutStrategy`. |
| **Tipo NativeAddon** | SerializationManager.ts | Baja | Definido inline; podría moverse a serialization/types o internal-types si se reutiliza. Opcional. |
| **LoggerOptions** | types vs config.schema | Baja | LoggerOptions aparece en types y en el schema de config. Asegurar una sola definición y reexport para evitar desvíos. |

**Resumen:** Los tipos están bien estructurados; el riesgo principal es el desvío entre types.ts e internal-types. type-exports.ts es la corrección crítica. **Hecho:** internal-types es la única fuente de verdad para LoggerOptions y LogEntry; types.ts solo reexporta. Documentado en `docs/type-ownership.md`.

---

### 1.4 Manejo de errores y resiliencia

**Principio:** No exponer datos sensibles bajo ningún concepto.

| Hallazgo | Ubicación | Severidad | Notas |
|----------|-----------|-----------|--------|
| **Catch silencioso en Logger._log** | Logger.ts | Por diseño | "El logging no debe lanzar." Los fallos se descartan. Bueno para resiliencia; no hay forma de observar fallos de transport/serialización. **Oportunidad:** Hook opcional configurable `onLogFailure?(error, entry)` para depuración/monitoreo. |
| **Catch silencioso en SerializationManager** | SerializationManager.ts | Por diseño | Fallo de carga del addon nativo o de serialize nativo: fallback a pipeline JS, sin log. Evita recursión. Opcional: mismo onLogFailure o un onSerializationFallback dedicado. |
| **Catch silencioso en MaskingEngine** | MaskingEngine.ts | Baja | Timeout de regex o error devuelve valor por defecto seguro. No debería devolver datos (pueden ser sensibles); solo reportar el error. |
| **HygieneStep** | HygieneStep.ts | Baja | Varios catch para convertir errores a string de forma segura; evita lanzar. Bien. Informar siempre sobre errores. |
| **init/shutdown de LifecycleManager** | LifecycleManager.ts | Bien | Pone estado ERROR en excepción; en init hace log y relanza. shutdown captura y registra. Claro. |
| **Validación de config** | config.validator.ts | Bien | ConfigValidationError con array de issues. parseConfig lanza con config inválida. Si existe un error en la configuración, no debería levantarse la aplicación. |
| **Errores de flush/log de transports** | LoggerFactory, UniversalAdapter | Media | flush().catch y errores de transport.log van a console.error. Valorar encaminar a un único manejador de errores opcional desde config. |

**Resumen:** La resiliencia es prioritaria (no lanzar desde log). Partimos de la base de que jamás podemos exponer datos sensibles. Añadir hooks opcionales (onLogFailure, onSerializationFallback) mejoraría la observabilidad sin cambiar el comportamiento por defecto.

---

### 1.5 Testing

| Hallazgo | Ubicación | Severidad | Notas |
|----------|-----------|-----------|--------|
| **SerializationManager** | tests/serialization/SerializationManager.test.ts | Bien | Tests unitarios; nativo forzado a off (nativeChecked = true) para pipeline predecible. |
| **SerializationPipeline** | tests/serialization/SerializationPipeline.test.ts | Bien | Múltiples escenarios. |
| **Pasos del pipeline** | HygieneStep, SanitizationStep, TimeoutStep, SerializationStep | Bien | Cada uno tiene tests dedicados. |
| **Logger** | tests/logger/Logger.test.ts | Bien | Mock de SerializationManager, MaskingEngine; prueba routing y niveles. |
| **LoggerFactory** | tests/logger/LoggerFactory.test.ts | Bien | Mock de SerializationManager. |
| **Sin test de integración del addon nativo** | test_integration/ | Media | Existen tests de integración; confirmar que uno ejercite la ruta del addon nativo (p. ej. con masking) cuando el addon está presente. |
| **Consistencia de mocks** | MockSerializationManager, mock pipeline | Baja | Algunos tests hacen (manager as any).nativeChecked = true. Documentar este patrón para tests "solo JS". |
| **Benchmark como sanity check** | benchmark/index.bench.ts | Bien | Imprime "native addon: yes/no". Podría conectarse a CI para fallar si se espera addon pero no se carga (opcional). |
| **Benchmark de memoria (Pino 0 B)** | benchmark/index.bench.ts | Corregido | Sin `--expose-gc` no se llama a gc() entre tareas, la línea base era incorrecta; Pino mostraba 0 B (delta negativo reclampado). Corregido: se muestra "0 (noise)" cuando se reclampa y se recomienda `pnpm run bench:memory`; con bench:memory Pino muestra ~17 MB / ~181 bytes/op. |

**Resumen:** La cobertura unitaria y de pipeline es sólida. Bug de medición del benchmark de memoria (Pino 0 B) corregido. Añadir o documentar un test de integración que asegure la ruta nativa cuando el addon está disponible; opcional comprobación en CI del addon en el entorno del benchmark.

---

### 1.6 Seguridad (sanitización y enmascarado)

| Hallazgo | Ubicación | Severidad | Notas |
|----------|-----------|-----------|--------|
| **DataSanitizer** | serialization/utils/DataSanitizer.ts | Bien | Caracteres de control, longitud máx., patrones de redacción. Usado en el pipeline. |
| **SanitizationStep** | pipeline/SanitizationStep.ts | Bien | Integra sanitización en el pipeline. |
| **MaskingEngine** | MaskingEngine.ts | Bien | Reglas por defecto para credit_card, SSN, etc.; timeout de regex para evitar ReDoS. _isDefaultRule usa test sync. |
| **Ruta nativa** | SerializationManager | Bien | El addon Rust hace sanitización + masking; no hay doble sanitización cuando se usa nativo. |
| **Sanitización de config** | utils/sanitizeConfig.ts | Bien | Quita undefined; se usa antes de pasar config a componentes. |

**Resumen:** No hay huecos críticos. Tener en cuenta timeouts de regex y manejo de reglas por defecto al añadir reglas nuevas. **Según el análisis inicial no hay oportunidad de mejora ni tareas derivadas para 1.6.**

---

### 1.7 Mantenibilidad y calidad de código

| Hallazgo | Ubicación | Severidad | Notas |
|----------|-----------|-----------|--------|
| **JSDoc** | Mayoría de src/ | Bien | Clases y métodos clave documentados. |
| **Comentarios en español** | SerializationManager, pipeline, otros | Corregido | Todos los comentarios en código pasaron a inglés. |
| **Números mágicos** | SerializationManager, pipeline, masking, etc. | Corregido | Centralizado en `src/constants.ts`: `DEFAULT_VALUES` (serializerTimeoutMs, pipelineOperationTimeoutMs, regexTimeoutMs, maxDepth, maxStringLength, etc.). Exportado en index y type-exports. |
| **Archivos largos** | MaskingEngine.ts, SerializationManager.ts | Baja | ~500 y ~430 líneas. Siguen siendo legibles; plantear división solo si crecen (p. ej. MaskingEngine: reglas vs aplicación). |
| **Ruido en root** | test_debug.ts, script.sh | Baja | Valorar mover o eliminar si no hacen falta; reduce ruido para nuevos contribuidores. |
| **Lint** | ESLint, Prettier | Bien | Configurado; lint-staged en pre-commit. |

**Resumen:** El código es mantenible. **Hecho (1.7):** Comentarios en inglés; constantes en `DEFAULT_VALUES` (constants.ts), sin números mágicos.

---

### 1.8 Build, bundle y dependencias

| Hallazgo | Ubicación | Severidad | Notas |
|----------|-----------|-----------|--------|
| **Externals** | rollup.config.mjs | Bien | syntropylog-native y deps externos; shim createRequire para ESM. |
| **Dependencia opcional** | package.json | Bien | syntropylog-native opcional; require en runtime en try/catch. |
| **Entrada type-exports** | rollup-plugin-dts | Corregido | type-exports.ts es la entrada para generar dist/index.d.ts; debe incluir todas las exportaciones de index.ts. Alineado en 1.2; convención documentada en type-ownership.md (sección type-exports / build 1.8). |
| **Workspace** | pnpm-workspace | Bien | syntropylog-native, examples, modules/@syntropylog/types. Confirmar que modules/ exista si se referencia. |

**Resumen:** El build es correcto. La completitud de las declaraciones de tipos se asegura manteniendo type-exports.ts alineado con index.ts; documentado en type-ownership.md.

---

## Parte 2 — Lista priorizada de mejoras

### P0 — Crítico (correctitud / contrato) ✅

1. **Alinear type-exports.ts con index.ts** — *Hecho (Fase 1.1 / 1.2).* type-exports incluye ColorfulConsoleTransport, AdapterTransport, UniversalAdapter, UniversalLogFormatter, SerializationManager, ISerializer, SerializationComplexity, DEFAULT_VALUES, etc. Test de regresión en `tests/type-exports.test.ts`: "P0: index exports ⊆ type-exports" asegura que todo export de index esté en type-exports.

### P1 — Alto impacto (rendimiento / UX / observabilidad)

2. **Reducir latencia de cola (p99/p999) en "objeto complejo + masking"**  
   Perfilar MaskingEngine y la ruta de serialización bajo carga; optimizar aplicación de regex o reconstrucción; valorar caché o reglas más simples para formas comunes (ver benchmark-report.md). *Pendiente: ver Fase 3 (3.1, 3.2).*

3. **Hooks opcionales de error / fallback** — *Hecho.*  
   - `onLogFailure?(error, entry)` en config (llamado desde Logger._log).  
   - `onSerializationFallback?(reason)` cuando falla el addon nativo y se usa el pipeline JS (SerializationManager).  
   - Además: onTransportError, onStepError, masking.onMaskingError, UniversalAdapter.onError. Documentado en README y config schema.

4. **Unificar API de mocks de testing** — *Hecho.*  
   SyntropyLogMock documentado como API pública en docs/testing-mocks.md; MockSyntropyLog marcado como uso interno/deprecado para nuevos tests; createTestHelper como entrada única recomendada.

### P2 — Impacto medio (mantenibilidad / claridad)

5. **Centralizar timeouts por defecto y constantes de config**  
   Un solo lugar para timeout del serializador, del pipeline y de regex de masking (p. ej. defaults de config o archivo de constantes).

6. **Estabilidad del benchmark de memoria** *(hecho)*  
   Pino mostraba 0 B porque sin `--expose-gc` no se llama a gc() entre tareas; los deltas negativos se reclampaban a 0. Corregido: se reporta "0 (noise)" cuando se reclampa y se recomienda `pnpm run bench:memory`; con bench:memory las cifras son estables (ver benchmark-report.md).

7. **Extraer "hasExtra" y reducir asignaciones en Logger._log**  
   Helper para "tiene context o bindings"; valorar evitar Object.assign cuando ambos están vacíos (ya hecho en parte en el fast path).

8. **Test de integración para el addon nativo**  
   Un test que, cuando syntropylog-native esté disponible, haga log con masking y compruebe que el serializador es 'native' o equivalente.

9. **Opcional: barrel indexes**  
   config/index.ts, serialization/index.ts, logger/transports/index.ts para imports más limpios (opcional, baja prioridad).

### P3 — Prioridad baja (pulido)

10. **Idioma de comentarios**  
   Preferir inglés en comentarios de código para consistencia (mantener español en docs si se desea).

11. **Limpieza del root**  
    Mover o eliminar test_debug.ts, script.sh si no se usan.

12. **CI: comprobación opcional del addon en benchmark**  
    En CI, ejecutar el benchmark y fallar si se espera addon (p. ej. variable de entorno) pero "native addon: no".

13. **Tipo NativeAddon**  
    Mover a serialization/types o internal-types si se reutiliza en otro sitio.

---

## Parte 3 — Plan de trabajo

### Fase 1 — Crítico y ganancias rápidas (1–2 días)

| # | Tarea | Responsable | Hecho |
|---|-------|-------------|--------|
| 1.1 | Añadir exportaciones faltantes en type-exports.ts (ColorfulConsoleTransport, AdapterTransport, UniversalAdapter, UniversalLogFormatter, SerializationManager, ISerializer, SerializationComplexity) | — | [x] |
| 1.2 | Regenerar dist y comprobar que .d.ts contiene todas las exportaciones públicas | — | [x] |
| 1.2b | Aclarar historia de mocks: documentar API pública (SyntropyLogMock) vs MockSyntropyLog (interno) | — | [x] → ver docs/testing-mocks.md |
| 1.3 | Centralizar timeouts por defecto (serializer, pipeline, masking) en un único módulo de constantes o config-defaults | — | [ ] |
| 1.4 | Benchmark de memoria: corregir medición Pino 0 B (mostrar "0 (noise)" cuando se reclampa, recomendar bench:memory) | — | [x] |

**Criterios de salida:** Los tipos publicados coinciden con index.ts; no hay errores de tipos en consumidores; los timeouts por defecto definidos en un solo lugar. El benchmark de memoria reporta correctamente el ruido y recomienda bench:memory para cifras estables.

---

### Fase 2 — Observabilidad y testing (2–3 días)

| # | Tarea | Responsable | Hecho |
|---|-------|-------------|--------|
| 2.1 | Añadir opcional `onLogFailure?(error, entry)` a SyntropyLogConfig y llamarlo desde el catch de Logger._log | — | [x] |
| 2.2 | Añadir opcional `onSerializationFallback?()` (u onNativeError) en config y llamarlo desde SerializationManager al hacer fallback a JS | — | [x] |
| 2.3 | Documentar ambos hooks en README y en el schema de config | — | [x] |
| 2.4 | Añadir test de integración: con addon nativo, log con masking y comprobar ruta nativa (p. ej. serializer 'native') | — | [ ] |
| 2.5 | Documentar testing: SyntropyLogMock como API pública; MockSyntropyLog como interno/deprecado; createTestHelper desde test-helper.ts | — | [x] → docs/testing-mocks.md |

**Criterios de salida:** Hooks opcionales disponibles y documentados; un test garantiza la ruta nativa cuando el addon está presente; API de testing documentada.

---

### Fase 3 — Rendimiento y hot path del Logger (2–3 días)

| # | Tarea | Responsable | Hecho |
|---|-------|-------------|--------|
| 3.1 | Perfilar MaskingEngine bajo carga (p99/p999); identificar coste de regex vs reconstrucción | — | [x] → benchmark "MaskingEngine only" en index.bench.ts; percentiles ya en tabla |
| 3.2 | Optimizar hot path del masking (p. ej. caché de regex compilados, menos asignaciones en flatten/reconstruct) | — | [x] → regex ya cacheado (_compiledPattern en addRule y reglas por defecto); MaskingEngine no usa flatten/reconstruct separado (aplica en lugar) |
| 3.3 | Extraer helper "hasExtra" (context/bindings) en Logger y usarlo en fast path y camino normal; evitar lógica duplicada | — | [x] → `hasContextOrBindings(context, bindings)` en Logger.ts |
| 3.4 | Valorar reducir asignaciones al fusionar context + bindings + metadata (p. ej. pasar piezas al serializador en lugar de un único objeto fusionado) | — | [x] → Valorado: ya se evita Object.assign cuando !hasExtra; reducir más implicaría cambiar API del serializador (no hecho) |

**Criterios de salida:** El benchmark muestra p99/p999 mejorados en "objeto complejo + masking"; el hot path del Logger tiene menos duplicación y menos asignaciones donde se ha medido.

---

### Fase 4 — Limpieza y pulido (1–2 días)

| # | Tarea | Responsable | Hecho |
|---|-------|-------------|--------|
| 4.1 | Unificar API de mocks: migrar tests de MockSyntropyLog a SyntropyLogMock (o al revés) y deprecar el otro | — | [x] → MockSyntropyLog @deprecated; tests siguen probando la clase; API recomendada SyntropyLogMock + createTestHelper |
| 4.2 | Un único createTestHelper; eliminar o internalizar el duplicado | — | [x] → Eliminado createTestHelper de MockSyntropyLog.ts; único createTestHelper en test-helper.ts |
| 4.3 | Preferir inglés en comentarios nuevos o modificados en el código | — | [x] → Comentarios en Logger, Transport, SpyTransport, UniversalAdapter, adapter.types en inglés |
| 4.4 | Mover o eliminar test_debug.ts, script.sh del root si no se usan | — | [x] → Movidos a scripts/debug-log.ts y scripts/clean.sh |
| 4.5 | Opcional: archivos index barrel para config, serialization, logger/transports | — | [ ] |

**Criterios de salida:** Una sola API de mocks; un solo test helper; menos ruido en root; barrels opcionales si se acuerda.

---

### Fase 5 — CI y documentación (opcional, 1 día)

| # | Tarea | Responsable | Hecho |
|---|-------|-------------|--------|
| 5.1 | CI: job opcional que ejecute el benchmark y compruebe "native addon: yes" cuando el addon esté compilado | — | [x] → Job `benchmark-native-addon` en ci.yaml |
| 5.2 | Añadir "Plan de mejoras" y "Informe de benchmarks" al README (enlaces a docs/) | — | [x] → Sección "Documentation" con enlaces al plan y a benchmarks |

**Publicación npm con addon Rust:** El workflow `release.yml` compila el addon nativo en Linux, Windows y macOS, une los `.node` en `syntropylog-native/` y luego ejecuta changeset publish. Así, al publicar desde GitHub, el paquete `syntropylog-native` en npm incluye binarios para todas las plataformas y los usuarios que instalen `syntropylog` obtienen el addon Rust de forma transparente. Para que se publique el addon, el changeset de la release debe incluir `syntropylog-native` (p. ej. `pnpm changeset` y elegir ambos paquetes cuando corresponda).

---

## Resumen

- **Crítico:** Corregir type-exports para que el .d.ts publicado coincida con la API pública.  
- **Alto valor:** Hooks opcionales de fallo/fallback, optimización de latencia de cola del masking y una única API de mocks de testing documentada.  
- **Continuo:** Centralizar defaults, reducir asignaciones y duplicación en el hot path, añadir un test de integración de la ruta nativa y pequeñas limpiezas.

El código está en buen estado: ciclo de vida claro, logging resiliente (no lanza) y hot path rápido con addon nativo. El plan anterior se centra en corrección de tipos, observabilidad, rendimiento (masking) y mantenibilidad sin romper el contrato actual.
