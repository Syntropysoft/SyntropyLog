# Transports condicionales por ambiente

Objetivo: poder habilitar o deshabilitar transports según el ambiente (NODE_ENV, APP_ENV, etc.) y repartir salida (consola, archivo, Azure, etc.) de forma condicional sin duplicar config.

---

## Forma recomendada: transportList + env

Lista de transports **separada** del criterio por ambiente: definís un pool (nombre → transport) y, por ambiente, qué nombres del pool se usan como default. Muy flexible y declarativo.

- **`transportList`:** `Record<string, Transport>` — pool de todos los transports (nombre → instancia).
- **`env`:** `Record<string, string[]>` — por cada ambiente, lista de **nombres** del pool que se usan como default.

El ambiente actual se lee de `process.env[logger.envKey ?? 'NODE_ENV']`. Si el ambiente no está en `env`, el default queda vacío (conviene definir una entrada por cada env que usés).

**Ejemplo (autocontenido: todo a consola con simulados):**

En el ejemplo, `db`, `azure` y `archivo` se simulan con `AdapterTransport` + `UniversalAdapter` mandando a consola con una etiqueta. En producción reemplazás por el transport real (Azure, DB, archivo, etc.).

```ts
import { syntropyLog, ColorfulConsoleTransport, AdapterTransport, UniversalAdapter } from 'syntropylog';

// Registro tipo mock: cada “destino” va a consola con etiqueta (solo para el ejemplo).
const mockToConsole = (label: string) =>
  new AdapterTransport({
    name: label,
    adapter: new UniversalAdapter({
      executor: (data) => console.log(`[${label}]`, JSON.stringify(data)),
    }),
  });

await syntropyLog.init({
  logger: {
    envKey: 'NODE_ENV',
    transportList: {
      consola: new ColorfulConsoleTransport({ name: 'consola' }),
      db: mockToConsole('db'),
      azure: mockToConsole('azure'),
      archivo: mockToConsole('archivo'),
    },
    env: {
      development: ['consola'],
      staging: ['consola', 'archivo', 'azure'],
      production: ['consola', 'db', 'azure'],
    },
  },
  redis: { instances: [] },
});

const log = syntropyLog.getLogger('app');
log.info('default según env');
log.override('consola').info('solo consola');
```

Override/add/remove por llamada usan los mismos nombres del pool (`logger.override('consola').info('...')`). En producción, reemplazás `mockToConsole('db')` por tu transport real (p. ej. uno que use UniversalAdapter con un executor que persista en DB).

**Prioridad:** Si están `transportList` y `env`, se usa esta forma. Si no, se usa la forma clásica `transports` (compatibilidad).

---

## Forma clásica (compatibilidad): transports

### Descriptor en config (declarativo, por env)

En `logger.transports` (forma antigua) cada elemento puede ser:

- **Un `Transport`** → siempre activo.
- **Un descriptor** `{ transport: Transport, env?: string | string[] }` → el transport solo se incluye cuando el **ambiente actual** está en la lista. Si no se pone `env`, se considera activo en todos los ambientes.

El "ambiente actual" se lee de una variable de entorno. Por defecto `NODE_ENV`. Se puede cambiar con `logger.envKey` (ej. `'APP_ENV'`).

**Ejemplo:**

```ts
await syntropyLog.init({
  logger: {
    envKey: 'NODE_ENV',  // opcional; por defecto es 'NODE_ENV'
    transports: [
      // Siempre: consola colorida en desarrollo
      new ColorfulConsoleTransport(),
      // Solo en production: Azure
      { transport: new AzureLogTransport({ ... }), env: 'production' },
      // En production y staging: archivo
      { transport: new FileTransport({ path: 'app.log' }), env: ['production', 'staging'] },
    ],
  },
  // ...
});
```

Comportamiento:

- **development:** solo ColorfulConsoleTransport.
- **staging:** ColorfulConsoleTransport + FileTransport.
- **production:** ColorfulConsoleTransport + AzureLogTransport + FileTransport.

Si no indicás `env`, el transport se usa en todos los ambientes. Así podés “partir” qué va a consola, a archivo o a Azure según el env, sin APIs adicionales.

---

### 2. ConditionalTransport (flexible, por función)

Para condiciones que no sean solo “env en lista” (por ejemplo “si existe cierta variable”, “si es martes”, etc.), un transport **wrapper** que delega solo cuando una función devuelve true:

```ts
import { ConditionalTransport } from 'syntropylog';

new ConditionalTransport({
  transport: new AzureLogTransport({ ... }),
  enableWhen: () => process.env.NODE_ENV === 'production' && process.env.ENABLE_AZURE === '1',
})
```

En `log(entry)`: si `enableWhen()` es true, se llama al transport envuelto; si no, no se hace nada. No requiere cambios en el schema; es composición.

---

## 3. Override por llamada: .override(), .add(), .remove()

Objetivo: tener un **pool de N transports** configurados y nombrados (por ambiente, etc.) y, **solo para un caso puntual**, decidir a dónde va ese log sin cambiar la config global. API declarativa y fluida.

### 3.1 Pool de transports con nombre

Todos los transports configurados deben tener **nombre** (ej. `name: 'consola'`, `name: 'db'`, `name: 'azure'`, `name: 'archivo'`). Esa lista N es el universo de destinos; en cada ambiente suelen estar activos solo algunos (ej. 2–4). Cualquier override/add/remove usa **solo nombres de ese pool**; no se inventan transports nuevos en la llamada.

### 3.2 Tres formas (fluent, aplican al siguiente log)

| Método | Significado | Ejemplo |
|--------|-------------|---------|
| **`.override("a", "b")`** | Para este log, **solo** estos transports. Lista exacta. | `logger.override("consola").info("solo consola")` |
| **`.add("x")`** | Para este log, default **más** estos (de la lista configurada). Encadenable. | `logger.add("azure").info("transacción especial")` |
| **`.remove("x").remove("z")`** | Para este log, default **menos** estos. Encadenable. | `logger.remove("db").remove("azure").info("debug, no guardar")` |

- **Override** reemplaza la lista efectiva por exactamente la que indicás. Si usás override, no se mezcla con default.
- **Add** y **remove** se aplican sobre el default (o sobre lo que quede tras add/remove). Se pueden encadenar: `logger.remove("db").add("archivo").info("...")` → default − db + archivo.
- Aplica al **siguiente log**; la llamada siguiente sin override/add/remove vuelve al default.

### 3.3 Ejemplos

```ts
// Solo a consola (override)
logger.override("consola").info("buscando un error, no mandar a DB");

// Solo consola y archivo
logger.override("consola", "archivo").info("backup manual");

// Default + Azure para esta línea
logger.add("azure").info("transacción que también va a Azure");

// Default menos DB y Azure (ej. debug)
logger.remove("db").remove("azure").info("solo ver en consola");

// Default − db + archivo
logger.remove("db").add("archivo").info("auditoría a archivo sin DB");
```

### 3.4 Resumen de la idea

- Configurás una lista N de transports (con nombre y por ambiente).
- Para el 99,9 % de los casos usás el default que da esa config.
- Para un caso puntual: **override** (“solo estos”), **add** (“default + estos”) o **remove** (“default − estos”), siempre sobre la lista que ya configuraste. Declarativo y fluido.

---

## Resumen

| Necesidad | Solución |
|-----------|----------|
| **Pool + env (recomendado)** | `logger.transportList` (nombre → Transport) + `logger.env` (env → nombres). Ej: `env: { development: ['consola'], production: ['consola','db'] }`. |
| Habilitar transport solo en ciertos env (forma clásica) | Descriptor `{ transport, env: 'production' }` o `env: ['production', 'staging']` en `logger.transports`. |
| Variable de ambiente distinta de NODE_ENV | `logger.envKey: 'APP_ENV'` (o la que uses). |
| Condición arbitraria (función) | `ConditionalTransport({ transport, enableWhen: () => boolean })`. |
| Algunos a consola, otros a archivo/Azure, según env | Mismo array de transports: algunos sin `env` (siempre), otros con `env` para filtrar por ambiente. |
| **Por llamada: solo estos destinos** | `logger.override("consola", "archivo").info("...")` — solo esos transports (del pool configurado). |
| **Por llamada: default + algunos** | `logger.add("azure").info("...")` — fluido, encadenable. |
| **Por llamada: default − algunos** | `logger.remove("db").remove("azure").info("...")` — fluido, encadenable. |

Implementación: en `LoggerFactory`, al construir la lista de transports, resolver el ambiente con `envKey`/NODE_ENV y filtrar los descriptores por `env`; el resto del código sigue recibiendo `Transport[]`. Transports con `name` para el pool nombrado. Logger expone `.override()`, `.add()`, `.remove()` que aplican al siguiente log y resuelven por nombre contra ese pool. Opcionalmente exportar `ConditionalTransport` para quien prefiera la API por función.
