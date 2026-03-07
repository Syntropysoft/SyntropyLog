# Análisis: Timeouts en el pipeline de serialización

Documento de análisis para revisar cómo se usan los timeouts (config vs. estrategias) y si el código de `selectTimeoutStrategy` / estrategias por tipo de dato sigue teniendo sentido.

---

## 1. Dónde está el timeout que **sí** limita la ejecución

El único lugar que **corta** la ejecución por tiempo es el loop del pipeline en `SerializationPipeline.process()`:

```ts
// SerializationPipeline.ts, ~línea 55-79
const globalTimeout = context?.serializationContext?.timeoutMs || 50;

for (const step of this.steps) {
  const stepExecution = step.execute(currentData, context);
  const timeoutPromise = new Promise<SerializableData>((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout in step '${step.name}' (> ${globalTimeout}ms)`)), globalTimeout);
  });
  currentData = await Promise.race([stepExecution, timeoutPromise]);
}
```

- **Origen del valor:** `context.serializationContext.timeoutMs` (si no viene, se usa **50 ms**).
- **Efecto:** Cada step (serialization, hygiene, sanitization, timeout) tiene como máximo `globalTimeout` ms; si se pasa, se rechaza la promesa y el pipeline devuelve `success: false` con el error.
- **Conclusión:** Cualquier serializador (o step) corre dentro de este límite; el que “manda” es este `globalTimeout`.

---

## 2. De dónde sale `serializationContext` y si lleva `timeoutMs`

Flujo actual:

1. **Config de la app:** `logger.serializerTimeoutMs` (en `config.schema.ts`, default **50**).
2. **LifecycleManager** crea `SerializationManager` con:
   - `timeoutMs: this.config.logger?.serializerTimeoutMs`
   → queda en `SerializationManager.config.timeoutMs`.
3. **LoggerFactory** también crea un `SerializationManager` con:
   - `timeoutMs: config.logger?.serializerTimeoutMs`
   → mismo valor en `SerializationManager.config.timeoutMs`.
4. Cuando el **Logger** hace un log, llama a:
   ```ts
   this.dependencies.serializationManager.serialize(logEntry, {
     depth: 0,
     maxDepth: 10,
     sensitiveFields: [],
     sanitize: true,
   });
   ```
   Ese segundo argumento es el `context` (SerializationContextConfig). **No incluye `timeoutMs`**.
5. **SerializationManager.serialize()** arma el contexto del pipeline así:
   ```ts
   const pipelineContext: SerializationPipelineContext = {
     serializationContext: context,  // el que pasó el Logger (sin timeoutMs)
     sanitizeSensitiveData: this.config.sanitizeSensitiveData,
     ...
   };
   ```
   No inyecta `this.config.timeoutMs` en `serializationContext`.

**Consecuencia:** El pipeline siempre recibe `serializationContext.timeoutMs === undefined` y usa el fallback **50 ms**. El valor de `logger.serializerTimeoutMs` de la config **no llega** al pipeline en el flujo actual del Logger.

Para que “cualquier serializador respete el timeout de la configuración”, habría que pasar ese valor al pipeline, por ejemplo:
- que el Logger pase `timeoutMs` en el context (leyéndolo de algún sitio que tenga la config), o
- que `SerializationManager.serialize()` complete `serializationContext` con `timeoutMs: this.config.timeoutMs` cuando el caller no lo envíe.

---

## 3. Qué hace `operationTimeout` y `selectTimeoutStrategy` (no limitan ejecución)

Después del loop de steps, el pipeline hace:

```ts
const timeoutStrategy = this.selectTimeoutStrategy(currentData);
const operationTimeout = timeoutStrategy.calculateTimeout(currentData);
this.metrics.operationTimeout = operationTimeout;
this.metrics.timeoutStrategy = timeoutStrategy.getStrategyName();
// y se mete en result.metadata
```

- **`selectTimeoutStrategy(data)`:** Elige una estrategia según `data.type`:
  - `PrismaQuery` → PrismaTimeoutStrategy  
  - `TypeORMQuery` → TypeORMTimeoutStrategy  
  - `MySQLQuery`, `PostgreSQLQuery`, `SQLServerQuery`, `OracleQuery` → estrategias concretas  
  - resto → DefaultTimeoutStrategy (5000 ms).
- **`operationTimeout`:** Es un número que se escribe en **métricas y metadata** (p. ej. “recomendación” de timeout para esa operación). **No se usa** para hacer `Promise.race` ni para cortar ningún step.
- **`timeoutStrategy`:** Nombre de la estrategia usada, también solo metadata (métricas, `timeoutStrategyDistribution`).

Es decir: todo esto es **informativo**. El límite real de ejecución sigue siendo solo `globalTimeout` (derivado de `serializationContext.timeoutMs` o 50 ms).

---

## 4. Quién produce `data.type` (PrismaQuery, TypeORMQuery, …)

Esas estrategias solo se eligen si los **datos** que llegan al pipeline tienen `type` igual a:

- `PrismaQuery`
- `TypeORMQuery`
- `MySQLQuery`
- `PostgreSQLQuery`
- `SQLServerQuery`
- `OracleQuery`

Eso tendría sentido si existieran **serializadores o adaptadores** que, al serializar consultas de Prisma/TypeORM/etc., pusieran ese `type` en el objeto. En el código actual del framework (sin adaptadores específicos de DB), el Logger serializa el **log entry** (mensaje, metadata, bindings, etc.), que normalmente **no** tiene ese `type`. Por tanto, en el flujo estándar siempre se usa **DefaultTimeoutStrategy** y el resto de estrategias no se activan.

Si en el pasado había adaptadores que emitían esos tipos y ya no están, entonces la lógica de selección por tipo es **código legacy**: solo aporta valor si en el futuro alguien vuelve a inyectar datos con esos `type` o se expone para serializers custom.

---

## 5. TimeoutStep (step “timeout”)

- Recibe el `Map` de estrategias del pipeline (`this.pipeline['timeoutStrategies']`).
- En su `execute()` hace su propio `selectTimeoutStrategy(data)` y añade al dato:
  - `operationTimeout`, `timeoutStrategy`, `timeoutDuration`, `timeoutApplied`, etc.
- Tampoco aplica ningún límite de tiempo a la ejecución; solo **anota metadata** en el objeto que circula por el pipeline. El límite real sigue siendo el `Promise.race` con `globalTimeout` en el pipeline.

---

## 6. Resumen y conclusiones

| Concepto | Dónde está | Efecto real |
|----------|------------|-------------|
| **Timeout que limita** | `SerializationPipeline.process()` → `globalTimeout = context.serializationContext?.timeoutMs \|\| 50` | Máximo tiempo por step; cualquier serializador está acotado por este valor. |
| **Config del usuario** | `logger.serializerTimeoutMs` (default 50) | Se guarda en `SerializationManager.config.timeoutMs` pero **no se inyecta** en el context que recibe el pipeline cuando el Logger llama a `serialize()`. |
| **operationTimeout / timeoutStrategy** | Calculados con `selectTimeoutStrategy()` y estrategias por tipo | Solo **metadata y métricas**. No controlan ni cortan la ejecución. |
| **Estrategias por tipo** | Prisma, TypeORM, MySQL, … | Solo se usan si `data.type` es uno de esos. En el flujo actual del Logger, no se suele setear; en la práctica suele ganar siempre **default**. |

Conclusiones para decidir qué hacer:

1. **Que el serializador respete el timeout de configuración:** Hoy no ocurre del todo, porque `serializerTimeoutMs` no llega al pipeline. Habría que conectar `config.timeoutMs` (o equivalente) con `serializationContext.timeoutMs` en las llamadas a `serialize()` (p. ej. en SerializationManager o en el Logger).
2. **selectTimeoutStrategy y estrategias por tipo:** Tienen sentido si hay (o habrá) datos con `type` Prisma/TypeORM/etc. Si el framework ya no usa adaptadores que emitan esos tipos, es código que en el flujo actual no se usa; se puede mantener como legacy/documentación o simplificar a “siempre default” según convenga.
3. **No tocar (por ahora):** No se han hecho cambios en el código; este documento es solo análisis para decidir los siguientes pasos.

---

## 7. Referencias rápidas de código

- Timeout que limita: `src/serialization/SerializationPipeline.ts` (~líneas 55–79).
- Selector de estrategia: `src/serialization/SerializationPipeline.ts` ~`selectTimeoutStrategy`, `initializeDefaultStrategies`, clases `*TimeoutStrategy`.
- Context del pipeline: `src/serialization/SerializationManager.ts` ~`serialize()` (construcción de `pipelineContext`).
- Llamada desde el Logger: `src/logger/Logger.ts` ~`_log()` → `serializationManager.serialize(logEntry, { depth, maxDepth, sensitiveFields, sanitize })`.
- Config: `config.schema.ts` `serializerTimeoutMs`; `LifecycleManager` / `LoggerFactory` donde se crea `SerializationManager` con `timeoutMs`.
