# Singletons y registro de instancias — Diseño

Documento de diseño para el **manejador de instancias** genérico del framework. Refleja lo acordado: estructura, política estricta, teardown en orden inverso y API solo para tests.

---

## 1. Qué hay hoy

### 1.1 Singleton global del framework

- **SyntropyLog:** una sola instancia por proceso (`getInstance()`). Punto de entrada.
- **Export** `syntropyLog`: llama a `getInstance()` al importar el módulo.

### 1.2 Managers “por tipo” (registro por nombre)

Tres managers con varias instancias por nombre:

| Manager         | Config        | API en SyntropyLog | Qué guarda                    |
|-----------------|---------------|--------------------|-------------------------------|
| **RedisManager**  | `config.redis`  | `getRedis(name)`   | Clientes Redis instrumentados (BeaconRedis) |
| **HttpManager**   | `config.http`   | `getHttp(name)`    | Clientes HTTP instrumentados  |
| **BrokerManager** | `config.brokers`| `getBroker(name)`  | Clientes de broker instrumentados |

Cada manager se crea en `LifecycleManager.init()` si viene su bloque en la config. En `shutdown()` se llama a `redisManager?.shutdown()`, `httpManager?.shutdown()`, `brokerManager?.shutdown()`.

---

## 2. Objetivo acordado

- **Mantener:** Solo el **cliente Redis instrumentado** (RedisManager + BeaconRedis). Único “tipo” con manager propio y config dedicada.
- **Quitar:** HTTP/axios y brokers del core: HttpManager, BrokerManager, config `http`/`brokers`, `getHttp`/`getBroker`.
- **Añadir:** Un **registro genérico de instancias** (nombre → entrada con valor y dispose) para que el desarrollador guarde lo que quiera: axios, Kafka, clases propias, diccionarios, etc.

---

## 3. Estructura del registro

### 3.1 Entrada (por llave)

Cada entrada del registro tiene:

| Campo     | Tipo     | Descripción |
|----------|----------|-------------|
| **nombre** | `string` | Llave para registrar y para `get(nombre)`. |
| **valor**  | cualquiera | La instancia que se devuelve con `get(nombre)`. |
| **dispose** | `() => void \| Promise<void>` (opcional) | Función de limpieza; se llama en el teardown del framework. |

**Forma de la API (extensible):** se puede usar un objeto de opciones para poder añadir campos después sin romper la API:

```ts
syntropyLog.register('kafka-producer', {
  value: producer,
  dispose: async () => await producer.disconnect(),
});
```

O firma corta cuando no hay dispose:

```ts
syntropyLog.register('api', axiosInstance);
// equivalente a { value: axiosInstance }
```

### 3.2 Política estricta (producción)

- **Si la llave ya existe → error.** No se permite sobrescribir. Comportamiento de diccionario estricto.
- **Arranque:** Si algo falla (init, registro duplicado, etc.), la librería **informa el error y no levanta la API**. Fail fast.
- **Teardown:** Se ejecuta en **orden inverso** al de registro (el último registrado se dispone primero). El registro debe preservar orden (p. ej. array o estructura ordenada).

### 3.3 Dispose y errores

- Si un valor tiene `dispose`, se llama en el teardown (en orden inverso al registro).
- Si no tiene `dispose`, no se hace nada con ese valor.
- Si un `dispose` falla (throw o reject), se recomienda usar algo tipo `Promise.allSettled`: ejecutar todos los dispose y luego reportar fallos (log o evento), para no dejar otros recursos sin cerrar.

---

## 4. API pública (producción)

- **`register(name: string, value: unknown): void**  
  **`register(name: string, entry: { value: unknown; dispose?: () => void \| Promise<void> }): void**  
  Registra una instancia. Si la llave ya existe, **lanza error**. Orden de registro se usa para el teardown inverso.

- **`get<T>(name: string): T`**  
  Devuelve la instancia registrada; lanza si no existe.

- **`has(name: string): boolean`**  
  Indica si hay una entrada con ese nombre.

Redis sigue fuera del registro: se usa `getRedis(name)` como hasta ahora.

---

## 5. Ejemplos de uso

### Kafka (cliente con cierre)

```ts
const kafka = new Kafka({ clientId: 'my-app', brokers: ['localhost:9092'] });
const producer = kafka.producer();
await producer.connect();

syntropyLog.register('kafka-producer', {
  value: producer,
  dispose: async () => await producer.disconnect(),
});

const producer = syntropyLog.get<KafkaProducer>('kafka-producer');
await producer.send({ topic: 'events', messages: [...] });
```

### Axios (sin cierre)

```ts
const api = axios.create({ baseURL: 'https://api.ejemplo.com' });
api.interceptors.request.use((req) => {
  req.headers['x-correlation-id'] = syntropyLog.getContextManager().getCorrelationId();
  return req;
});

syntropyLog.register('api', api);

const api = syntropyLog.get<AxiosInstance>('api');
const { data } = await api.get('/users');
```

### Diccionario común (objeto plano)

```ts
const featureFlags = { betaCheckout: true, newDashboard: false };
syntropyLog.register('feature-flags', featureFlags);

const flags = syntropyLog.get<typeof featureFlags>('feature-flags');
if (flags.betaCheckout) { ... }
```

---

## 6. Tests: reemplazar y dejar a cero

Objetivo: poder correr los tests **como la aplicación** (mismo init, mismos registros) y luego **reemplazar** entradas por mocks, y **dejar la instancia a cero** para el siguiente test. Todo esto **solo en test**, sin mezclar con producción.

### 6.1 API solo para test (propuesta)

- **Reemplazar una entrada:** p. ej. `_replaceForTesting(name, value, dispose?)`. Permite que el test, después del init, sustituya una entrada (p. ej. `'api'`) por un mock. Solo disponible o con efecto en entorno de test.

- **Reemplazar toda la lista:** p. ej. `_replaceRegistryForTesting(entries)` o equivalente (vaciar y registrar una lista de entradas). El test puede tirar todo lo registrado en init y poner solo sus mocks.

- **Dejar a cero para el siguiente test:** p. ej. `_clearRegistryForTesting()` que vacíe el registro. Si `_resetForTesting()` ya recrea el `LifecycleManager`, ese reset puede incluir un registro nuevo y vacío; así “a cero” = mismo reset que hoy para estado limpio.

Nombres con prefijo `_` y sufijo `ForTesting` dejan claro que es API solo para tests.

### 6.2 Mocks sin columna extra

No se añade ninguna columna “es mock” en la entrada. En tests se usa el **mismo registro**: el test registra **el mock** en lugar del objeto real (o reemplaza con la API de test). Mismo nombre, mismo `get('api')`; lo que cambia es qué instancia se registró.

---

## 7. Resumen de impacto (al implementar)

| Área              | Acción |
|-------------------|--------|
| **LifecycleManager** | Quitar HttpManager y BrokerManager. Añadir registro genérico (ordenado). En shutdown: ejecutar dispose del registro en orden inverso, luego `redisManager?.shutdown()`. |
| **SyntropyLog**   | Quitar `getHttp` y `getBroker`. Añadir `register` y `get` (y `has`). Mantener `getRedis(name)`. Exponer API de test: reemplazo y clear. |
| **Config (schema)** | Quitar (o deprecar) `http` y `brokers`; mantener `redis`. |
| **Tests / mocks** | Dejar de usar config HTTP/broker y getHttp/getBroker. Usar registro; en test usar reemplazo/clear según necesidad. Ajustar o eliminar tests de HttpManager/BrokerManager. |
| **Documentación** | Explicar que solo Redis es “tipo integrado”; el resto va al registro genérico. Ejemplos (Kafka, Axios, diccionario) y uso en tests. |

---

## 8. Cerrado vs pendiente

**Cerrado:**

- Estructura de entrada: nombre, valor, dispose (opcional); objeto de opciones para extensibilidad.
- Política: llave existente → error; fail fast en arranque; teardown en orden inverso.
- Ejemplos: Kafka, Axios, diccionario.
- Tests: reemplazar por mocks y dejar a cero; API solo para test; sin columna “mock”.

**Pendiente (detalle de implementación):**

- Nombre exacto del registro: `InstanceRegistry`, `InstanceManager`, otro.
- Nombre de métodos: `get` / `register` vs `getInstance` / `registerInstance`.
- Registro solo en estado READY o también antes de `init()`.
- Mantener o no los módulos `src/http` y `src/brokers` como utilidades opcionales.

Cuando se implemente, este doc sirve como referencia del diseño acordado.
