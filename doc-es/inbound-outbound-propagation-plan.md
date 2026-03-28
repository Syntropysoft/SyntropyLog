# Plan de Propagación de Contexto: Inbound / Outbound

**Estado:** Planificación
**Versión objetivo:** 1.0.0-rc.2 (solo adiciones — sin cambios que rompan compatibilidad)
**Implementación de referencia:** [slpy v0.3.2 (Python)](https://github.com/Syntropysoft/syntropylog.py)

---

## Descripción del problema

La API actual tiene dos campos de contexto fijos — `correlationIdHeader` y `transactionIdHeader` —
y un único método `getTraceContextHeaders()` que devuelve ambos. Esto genera tres limitaciones:

1. **Nombres de campo fijos.** Cualquier servicio que use campos distintos (tenant ID, session ID,
   request ID, etc.) tiene que trabajar alrededor de la API o almacenarlos manualmente sin participar
   en la propagación.

2. **Una única fuente de entrada.** Un BFF o API gateway que recibe tráfico de múltiples orígenes
   (una app frontend, una API de partner, un sistema legacy interno) no puede declarar que cada
   fuente usa distintos nombres de headers para los mismos campos conceptuales. Hay una única
   configuración global — no una por fuente.

3. **Sin mapeo de salida por destino.** `getTraceContextHeaders()` devuelve los mismos nombres de
   clave sin importar el destino. Una llamada a Kafka necesita `correlationId`, una a S3 necesita
   `Correlation_ID`, una a Azure necesita `CorrelationID`. Hoy el desarrollador tiene que construir
   ese mapeo manualmente en cada llamada saliente.

La contraparte en Python (slpy) resolvió los tres problemas con una estructura de configuración
`inbound`/`outbound` simétrica. Este documento planifica el equivalente para SyntropyLog.

---

## Diseño central

La idea clave: `inbound` y `outbound` tienen la misma forma. Uno está indexado por **fuente**,
el otro por **destino**. El contexto interno es la capa de traducción entre ambos. El código de
aplicación nunca ve los nombres de wire.

```
inbound['frontend']   contexto interno   outbound['http']       outbound['kafka']
──────────────────    ────────────────   ─────────────────      ─────────────────
X-Correlation-ID  ->  correlationId  ->  X-Correlation-ID   /   correlationId
X-Trace-ID        ->  traceId        ->  X-Trace-ID         /   traceId

inbound['partner']    contexto interno   outbound['http']       outbound['kafka']
──────────────────    ────────────────   ─────────────────      ─────────────────
x-request-id      ->  correlationId  ->  X-Correlation-ID   /   correlationId
x-b3-traceid      ->  traceId        ->  X-Trace-ID         /   traceId
```

---

## Estrategia de compatibilidad

La nueva característica es **puramente aditiva**. No se elimina nada. No se renombra nada.

Los dos estilos de configuración conviven en `ContextConfig`:

| Config presente | Comportamiento |
|-----------------|----------------|
| Solo `correlationIdHeader` / `transactionIdHeader` | Comportamiento actual, sin cambios |
| Solo `inbound` / `outbound` | Comportamiento nuevo |
| Ambos | El nuevo tiene prioridad en `getPropagationHeaders()`; los métodos viejos siguen funcionando con sus propios campos |

Los métodos existentes — `getCorrelationId()`, `getCorrelationIdHeaderName()`,
`getTransactionId()`, `getTransactionIdHeaderName()`, `setCorrelationId()`,
`setTransactionId()`, `getTraceContextHeaders()` — **se conservan tal cual**. No se
marcan como deprecados en esta versión. La deprecación (con `@deprecated` en JSDoc) puede
llegar en una versión menor futura, una vez confirmada la adopción de la nueva API.

Esto significa que los desarrolladores que adoptaron rc.1 no ven ningún cambio. Los que
están en rc.2 pueden migrar a su propio ritmo — o no migrar en absoluto.

---

## Nuevos tipos TypeScript para la configuración

```typescript
// fields.ts — el desarrollador define sus propias constantes
const FIELD_CORRELATION = 'correlationId';
const FIELD_TRACE       = 'traceId';
const FIELD_TENANT      = 'tenantId';

const SOURCE_FRONTEND = 'frontend';
const SOURCE_PARTNER  = 'partner';
const SOURCE_LEGACY   = 'legacy';

const TARGET_HTTP  = 'http';    // por defecto — usado por getPropagationHeaders() sin argumento
const TARGET_KAFKA = 'kafka';
const TARGET_S3    = 's3';
const TARGET_AZURE = 'azure';
```

```typescript
// Esquema de configuración actualizado — campos viejos conservados, campos nuevos agregados
export interface ContextConfig {
  // ── Campos existentes (conservados, sin cambios) ────────────────────────
  /** @legacy Usar inbound/outbound para soporte multi-fuente y multi-destino. */
  correlationIdHeader?: string;
  /** @legacy Usar inbound/outbound para soporte multi-fuente y multi-destino. */
  transactionIdHeader?: string;

  // ── Campos nuevos ────────────────────────────────────────────────────────
  /**
   * Mapeos de headers de entrada por fuente.
   * Cada clave es un nombre de fuente; cada valor mapea campo conceptual → nombre de header en el wire.
   *
   * @example
   * inbound: {
   *   [SOURCE_FRONTEND]: { [FIELD_CORRELATION]: 'X-Correlation-ID' },
   *   [SOURCE_PARTNER]:  { [FIELD_CORRELATION]: 'x-request-id' },
   * }
   */
  inbound?: Record<string, Record<string, string>>;

  /**
   * Mapeos de headers de salida por destino.
   * Cada clave es un nombre de destino; cada valor mapea campo conceptual → nombre en el wire para ese destino.
   * Usar 'http' como clave para el destino HTTP por defecto (getPropagationHeaders() sin argumento).
   *
   * @example
   * outbound: {
   *   [TARGET_HTTP]:  { [FIELD_CORRELATION]: 'X-Correlation-ID' },
   *   [TARGET_KAFKA]: { [FIELD_CORRELATION]: 'correlationId' },
   *   [TARGET_S3]:    { [FIELD_CORRELATION]: 'Correlation_ID' },
   * }
   */
  outbound?: Record<string, Record<string, string>>;

  /**
   * El campo que se auto-genera cuando está ausente en una request de entrada.
   * Por defecto: 'correlationId'.
   */
  correlationField?: string;

  /**
   * Headers personalizados para extraer de las requests de entrada y propagar tal cual,
   * sin mapear a nombres de campo conceptuales.
   * El nombre del header en minúsculas con '-' reemplazado por '_' se convierte en la clave de contexto.
   *
   * @example
   * customHeaders: ['X-Tenant-ID', 'X-Feature-Flag']
   */
  customHeaders?: string[];
}
```

---

## Ejemplo completo de init()

```typescript
import syntropyLog from 'syntropylog';

const FIELD_CORRELATION = 'correlationId';
const FIELD_TRACE       = 'traceId';
const FIELD_TENANT      = 'tenantId';

const SOURCE_FRONTEND = 'frontend';
const SOURCE_PARTNER  = 'partner';

const TARGET_HTTP  = 'http';
const TARGET_KAFKA = 'kafka';
const TARGET_S3    = 's3';

await syntropyLog.init({
  logger: { level: 'info' },
  context: {
    correlationField: FIELD_CORRELATION,
    inbound: {
      [SOURCE_FRONTEND]: {
        [FIELD_CORRELATION]: 'X-Correlation-ID',
        [FIELD_TRACE]:       'X-Trace-ID',
        [FIELD_TENANT]:      'X-Tenant-ID',
      },
      [SOURCE_PARTNER]: {
        [FIELD_CORRELATION]: 'x-request-id',
        [FIELD_TRACE]:       'x-b3-traceid',
      },
    },
    outbound: {
      [TARGET_HTTP]: {
        [FIELD_CORRELATION]: 'X-Correlation-ID',
        [FIELD_TRACE]:       'X-Trace-ID',
        [FIELD_TENANT]:      'X-Tenant-ID',
      },
      [TARGET_KAFKA]: {
        [FIELD_CORRELATION]: 'correlationId',
        [FIELD_TRACE]:       'traceId',
      },
      [TARGET_S3]: {
        [FIELD_CORRELATION]: 'Correlation_ID',
      },
    },
  },
});
```

---

## Nueva API de IContextManager

### Métodos existentes — sin cambios

Todos los métodos existentes se conservan con firmas y comportamiento idénticos:

| Método | Estado |
|--------|--------|
| `configure(options)` | Sin cambios — ahora también acepta las claves `inbound`/`outbound` |
| `getCorrelationId()` | Conservado |
| `getCorrelationIdHeaderName()` | Conservado |
| `setCorrelationId(id)` | Conservado |
| `getTransactionId()` | Conservado |
| `getTransactionIdHeaderName()` | Conservado |
| `setTransactionId(id)` | Conservado |
| `getTraceContextHeaders()` | Conservado |
| `run(fn)` | Conservado |
| `get(key)` | Conservado |
| `set(key, value)` | Conservado |
| `getAll()` | Conservado |
| `getFilteredContext(level)` | Conservado |

### Nuevos métodos

```typescript
interface IContextManager {
  // ... métodos existentes conservados (run, get, set, getAll, getFilteredContext) ...

  /**
   * Devuelve un dict de {nombreWire: valor} para el destino dado, listo para pasar a
   * cualquier llamada saliente. Solo se incluyen los campos que tienen valor en el contexto actual.
   *
   * Sin argumento — usa el destino 'http' (outbound['http']).
   * Con nombre de destino — usa outbound[target].
   * Destino desconocido — devuelve {}.
   *
   * @example
   * await axios.get(url, { headers: contextManager.getPropagationHeaders() });
   * await kafkaProducer.send({ headers: contextManager.getPropagationHeaders(TARGET_KAFKA) });
   * await s3.putObject({ Metadata: contextManager.getPropagationHeaders(TARGET_S3) });
   */
  getPropagationHeaders(target?: string): Record<string, string>;

  /**
   * Devuelve el nombre de wire de salida configurado para un campo conceptual.
   * Por defecto usa el destino 'http' si no se especifica destino.
   *
   * @example
   * contextManager.getOutboundHeaderName(FIELD_CORRELATION)          // -> 'X-Correlation-ID'
   * contextManager.getOutboundHeaderName(FIELD_CORRELATION, 'kafka') // -> 'correlationId'
   */
  getOutboundHeaderName(field: string, target?: string): string | undefined;

  /**
   * Lee cualquier campo del contexto actual por su nombre conceptual.
   * Ya existe como get(key) — esto documenta el patrón de uso principal.
   *
   * @example
   * contextManager.get(FIELD_CORRELATION)  // -> 'req-001'
   * contextManager.get(FIELD_TENANT)       // -> 'acme'
   * contextManager.get('desconocido')      // -> undefined
   */
  get<T = string>(key: string): T | undefined;
}
```

---

## Gotcha de Node.js — normalización de mayúsculas en headers

**Node.js convierte todos los headers HTTP de entrada a minúsculas.** Cuando `req.headers` es
un objeto plano `Record<string, string>`, el runtime ya bajó a minúsculas todas las claves:

```typescript
// El desarrollador declara en la config:
{ [FIELD_CORRELATION]: 'X-Correlation-ID' }

// Node entrega:
req.headers = { 'x-correlation-id': 'req-001' }  // <- ya en minúsculas

// Esta búsqueda FALLA:
req.headers['X-Correlation-ID']   // -> undefined

// Esta funciona:
req.headers['x-correlation-id']   // -> 'req-001'
```

`extractInboundContext` debe normalizar el nombre de wire configurado a minúsculas antes de
buscarlo en el objeto de headers:

```typescript
const value = headers[wireName.toLowerCase()];
```

El desarrollador sigue declarando el nombre de wire en su capitalización canónica
(`'X-Correlation-ID'`) — ese es el nombre que aparecerá en el header de respuesta y en
`getPropagationHeaders()`. Solo la **búsqueda de entrada** usa `.toLowerCase()`. La salida
no se ve afectada.

**Por qué esto no afecta a Python:** El objeto `Headers` de Starlette es insensible a mayúsculas
por diseño (`request.headers.get('X-Correlation-ID')` y `request.headers.get('x-correlation-id')`
son idénticos). Node.js entrega un objeto plano — sin esa garantía.

---

## Patrón de middleware — extracción de entrada

No se agrega middleware integrado (la filosofía agnóstica al framework se mantiene). El patrón
cambia de:

```typescript
// ANTES (actual)
app.use(async (req, res, next) => {
  await contextManager.run(async () => {
    const correlationId = req.headers['x-correlation-id'] as string
      ?? contextManager.getCorrelationId(); // auto-generar
    contextManager.set(contextManager.getCorrelationIdHeaderName(), correlationId);
    next();
  });
});
```

A un helper que usa el mapa inbound configurado:

```typescript
// DESPUÉS — el framework provee un helper
import { extractInboundContext } from 'syntropylog';

app.use(async (req, res, next) => {
  await contextManager.run(async () => {
    // Extrae campos usando el mapa inbound de la fuente declarada
    const fields = extractInboundContext(req.headers, SOURCE_FRONTEND);
    for (const [field, value] of Object.entries(fields)) {
      contextManager.set(field, value);
    }
    // Refleja los headers de propagación en la respuesta
    const responseHeaders = contextManager.getPropagationHeaders();
    for (const [header, value] of Object.entries(responseHeaders)) {
      res.setHeader(header, value);
    }
    next();
  });
});
```

`extractInboundContext(headers, source)` lee el mapa inbound para la fuente dada, extrae los
valores de header correspondientes, auto-genera `correlationId` si el campo mapeado está ausente,
y devuelve `{ nombreCampo: valor }`. Es una función pura — no muta el contexto.

---

## Regla de auto-generación

`correlationId` (o cualquier campo que `correlationField` defina) es **el único campo que se
auto-genera** cuando está ausente en una request de entrada. Esto replica el comportamiento de Python.

La configuración declara qué campo tiene este comportamiento especial:

```typescript
context: {
  correlationField: FIELD_CORRELATION,  // 'correlationId' — se auto-genera cuando está ausente
  inbound: { ... },
  outbound: { ... },
}
```

Por defecto: `'correlationId'`. Esta es la única opinión que el framework mantiene en cuanto a
nombres de campo.

---

## Qué es nuevo (solo adiciones)

| Adición | Descripción |
|---------|-------------|
| `context.inbound` | Nueva clave de config opcional — mapeos de headers por fuente |
| `context.outbound` | Nueva clave de config opcional — mapeos de headers por destino |
| `context.correlationField` | Nueva clave de config opcional — qué campo se auto-genera (por defecto: `'correlationId'`) |
| `context.customHeaders` | Nueva clave de config opcional — headers de passthrough |
| `getPropagationHeaders(target?)` | Nuevo método — devuelve `{wireName: valor}` para el destino dado |
| `getOutboundHeaderName(field, target?)` | Nuevo método — devuelve el nombre de wire de salida configurado |
| `extractInboundContext(headers, source)` | Nueva función helper exportada — pura, sin mutación de contexto |

**No se elimina nada. No se renombra nada. Ningún call site existente se rompe.**

---

## Archivos que necesitan cambios

### Código fuente
| Archivo | Cambio |
|---------|--------|
| `src/config.schema.ts` | Agregar `inbound`, `outbound`, `correlationField`, `customHeaders` a `ContextConfig` |
| `src/config/config.validator.ts` | Agregar reglas de validación para las nuevas claves opcionales (claves viejas sin tocar) |
| `src/context/IContextManager.ts` | Agregar `getPropagationHeaders`, `getOutboundHeaderName` (sin eliminaciones) |
| `src/context/ContextManager.ts` | Agregar campos de mapa inbound/outbound e implementar nuevos métodos |
| `src/context/MockContextManager.ts` | Agregar stubs para los nuevos métodos |
| `src/SyntropyLog.ts` | Exportar helper `extractInboundContext` |

### Archivos de tests
| Archivo | Cambio |
|---------|--------|
| `tests/context/ContextManager.test.ts` | Reescribir suites de configure/header/propagación |
| `tests/SyntropyLog.test.ts` | Actualizar ejemplos de configuración en init |

### Documentación
| Archivo | Cambio |
|---------|--------|
| `README.md` | Reescribir sección "Context" con el nuevo patrón inbound/outbound |
| `docs/features-and-examples.md` | Actualizar ejemplos de middleware |
| `docs/opentelemetry-integration.md` | Actualizar `getTraceContextHeaders()` → `getPropagationHeaders()` |

---

## Sección del README a escribir

La nueva sección reemplaza la actual "Context — correlation ID and transaction ID". Puntos clave:

1. **Nombres de campo conceptuales vs nombres de wire** — el diagrama que muestra inbound → interno → outbound
2. **Patrón de constantes** — `FIELD_*`, `SOURCE_*`, `TARGET_*` como convención de nomenclatura, no feature del framework
3. **Configuración simétrica** — `inbound` y `outbound` tienen forma idéntica
4. **`getPropagationHeaders(target?)`** — el único método de salida, `'http'` por defecto
5. **`contextManager.get(FIELD)`** — leer cualquier campo de contexto
6. **Patrón de middleware** — ejemplo actualizado usando la nueva configuración
7. **Auto-generación** — `correlationField` recibe un UUID si está ausente en la entrada

---

## Qué NO cambia

- `AsyncLocalStorage` como motor de contexto — se mantiene
- `contextManager.run(fn)` — se mantiene, ese es el límite del scope
- `contextManager.get(key)` / `contextManager.set(key, value)` — se mantienen
- `contextManager.getAll()` — se mantiene
- `getFilteredContext(level)` + logging matrix — se mantiene
- Filosofía agnóstica al framework — sin middleware integrado para Express/Fastify
- `customHeaders` — se mantiene (headers de passthrough)
- Silent observer — los errores en propagación nunca lanzan excepciones

---

## Guía de actualización (para el README — opcional, no requerida)

```typescript
// ANTES
await syntropyLog.init({
  context: {
    correlationIdHeader: 'X-Correlation-ID',
    transactionIdHeader: 'X-Trace-ID',
  },
});

const correlationId = contextManager.getCorrelationId();
const headers = contextManager.getTraceContextHeaders();
// -> { 'X-Correlation-ID': 'req-001', 'X-Trace-ID': 'trace-xyz' }

// DESPUÉS
const FIELD_CORRELATION = 'correlationId';
const FIELD_TRACE       = 'traceId';
const TARGET_HTTP       = 'http';

await syntropyLog.init({
  context: {
    correlationField: FIELD_CORRELATION,
    inbound: {
      default: {
        [FIELD_CORRELATION]: 'X-Correlation-ID',
        [FIELD_TRACE]:       'X-Trace-ID',
      },
    },
    outbound: {
      [TARGET_HTTP]: {
        [FIELD_CORRELATION]: 'X-Correlation-ID',
        [FIELD_TRACE]:       'X-Trace-ID',
      },
    },
  },
});

const correlationId = contextManager.get(FIELD_CORRELATION);
const headers = contextManager.getPropagationHeaders();
// -> { 'X-Correlation-ID': 'req-001', 'X-Trace-ID': 'trace-xyz' }
```

---

## Orden de implementación

1. Actualizar `config.schema.ts` — nuevos tipos
2. Actualizar `config.validator.ts` — reglas de validación
3. Actualizar `IContextManager.ts` — nueva interfaz
4. Actualizar `ContextManager.ts` — implementación central
5. Actualizar `MockContextManager.ts` — espejo para tests
6. Actualizar `SyntropyLog.ts` — conectar nueva config en el ciclo de vida
7. Actualizar todos los tests
8. Actualizar README
9. Actualizar `docs/features-and-examples.md`
10. Subir versión a 1.0.0-rc.2, actualizar CHANGELOG
