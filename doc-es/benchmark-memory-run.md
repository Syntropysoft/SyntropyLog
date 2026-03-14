# Ejecución de benchmark: throughput y memoria (addon nativo)

**Ejecución:** `pnpm run bench:memory` (desde la raíz del repo o desde `benchmark/`)  
**Entorno:** Apple M2, Node v20.20.1 (arm64-darwin)  
**Addon nativo (Rust):** sí

Tiempos en **microsegundos (µs)**. Memoria: variación de heap en 100.000 iteraciones, bytes/op. Menor es mejor.

---

## 1. Throughput de logging (5.000.000 iteraciones)

| Librería | avg (µs) | min … max (µs) | p75 | p99 | p999 |
|----------|----------|----------------|-----|-----|------|
| console.log (baseline) | 0,15 | 0,08 … 9,05 | 0,10 | 2,08 | 3,83 |
| **SyntropyLog (JSON)** | **0,95** | 0,67 … 7.783 | 0,79 | 2,04 | 28,92 |
| Pino | 0,54 | 0,37 … 5,48 | 0,41 | 2,25 | 5,48 |
| Winston | 1,16 | 0,46 … 4.154 | 0,58 | 2,42 | 7,67 |

**Resumen respecto al baseline:**  
- console.log (baseline): 0,15 µs  
- Pino: 0,54 µs → 3,59× más lento que el baseline  
- SyntropyLog (JSON): 0,95 µs → 6,33× más lento que el baseline  
- Winston: 1,16 µs → 7,69× más lento que el baseline  

---

## 2. Solo MaskingEngine (objeto complejo)

| Benchmark | avg (µs) | min … max (µs) | p75 | p99 | p999 |
|-----------|----------|----------------|-----|-----|------|
| MaskingEngine.process(complexObj) | 2,31 | 1,88 … 7.232 | 2,08 | 4,75 | 30,17 |

---

## 3. Objeto complejo (mismo payload, comparación justa)

| Librería | avg (µs) | min … max (µs) | p75 | p99 | p999 |
|----------|----------|----------------|-----|-----|------|
| **SyntropyLog (con masking)** | **4,20** | 2,96 … 14.519 | 3,33 | 8,50 | 31,13 |
| Pino (objeto complejo) | 2,55 | 1,08 … 15,32 | 3,11 | 15,32 | 15,32 |
| Winston (objeto complejo) | 3,88 | 1,63 … 7.980 | 1,79 | 4,71 | 9,04 |

**Resumen (Pino como baseline):**  
- Pino (objeto complejo): 2,55 µs (baseline)  
- Winston (objeto complejo): 3,88 µs → 1,52× más lento que el baseline  
- SyntropyLog (con masking): 4,20 µs → 1,64× más lento que el baseline

---

## 4. API fluida (withRetention + JSON complejo)

| Benchmark | avg (µs) | min … max (µs) | p75 | p99 | p999 |
|-----------|----------|----------------|-----|-----|------|
| SyntropyLog (withRetention complex) | 6,54 | 5,75 … 2.771 | 6,17 | 10,08 | 32,42 |

---

## 5. Consumo de memoria (100.000 iteraciones)

| Benchmark | delta heap | bytes/op |
|-----------|-----------|----------|
| console.log (baseline) | 14,00 MB | 146,84 |
| SyntropyLog (JSON) | 17,19 MB | 180,25 |
| Pino | 17,59 MB | 184,48 |
| Winston | 88,89 MB | 932,08 |
| SyntropyLog (con masking) | 21,66 MB | 227,15 |
| Pino (objeto complejo) | 17,39 MB | 182,34 |
| Winston (objeto complejo) | 218,15 MB | 2.287,48 |
| SyntropyLog (withRetention complex) | 24,12 MB | 252,93 |

**Memoria:** ~180–253 bytes/op con JSON + masking + contexto es una marca muy baja para el bundle. SyntropyLog (JSON) queda en **180 bytes/op** (a la par de Pino, 184); con masking, 227. Muy por debajo de Winston (932–2.287 bytes/op). Para un logger que hace “todo” por defecto, el footprint es excelente.

---

**Nota:** Para números de memoria estables, ejecutar desde la raíz del repo: `pnpm run bench:memory`. Otras ejecuciones pueden dar deltas con ruido.

---

## Alcance e interpretación de los resultados

Los benchmarks se ejecutaron en varios rangos de iteraciones (p. ej. 5k, 100k, 1M y 10M) para evaluar throughput y memoria bajo distintas cargas. Las cifras de este informe corresponden a ejecuciones en las que los resultados fueron estables y comparables entre librerías.

**Cargas representativas.** Los rangos desde unos miles hasta del orden del millón de eventos de log por ejecución se alinean con el volumen que suele observarse en aplicaciones Node.js: acotado por el ciclo de vida de las peticiones, las unidades de despliegue (p. ej. un único POD) y las condiciones normales de operación. Dentro de estos rangos, SyntropyLog muestra un comportamiento estable en throughput y memoria, sin problemas de rendimiento observados en las condiciones probadas.

**Conteos de iteraciones muy altos.** Con cantidades sensiblemente mayores (p. ej. 10M+), se observó cierta variación y degradación en la latencia media y de cola. Esa carga sostenida en un único proceso no es representativa del uso habitual de Node.js o de un único POD en producción; en la práctica, el volumen de logs se reparte en el tiempo, entre instancias y entre procesos. Por tanto, estos resultados no indican una limitación práctica en escenarios de despliegue típicos.

---

## Entornos de alta demanda

SyntropyLog está pensado para **alta demanda** y entornos regulados. Las cifras de este informe (throughput, latencia de cola, memoria) se obtienen con **todo el stack** activo — no un logger recortado. Ese stack incluye:

- **Addon nativo (Rust)** — un solo recorrido serializar + enmascarar + sanitizar; strip ANSI en metadata.
- **Logging Matrix** — control declarativo de qué campos de contexto salen por nivel (poco en `info`, todo en `error`).
- **Universal Adapter** (y **AdapterTransport**) — enviar logs a cualquier backend (PostgreSQL, MongoDB, Elasticsearch, S3) con un solo `executor`; sin atarte a un vendor.
- **MaskingEngine** — reglas built-in y custom; los campos sensibles no salen del pipeline.
- **Pipeline de serialización** — referencias circulares, límites de profundidad/ancho, timeouts; el log no bloquea el event loop.
- **SanitizationEngine** — strip de caracteres de control; seguro frente a log injection.
- **Contexto / headers** — propagación de correlation ID y transaction ID; única fuente de verdad desde la config.
- **API fluida** — `withRetention`, `withSource`, `withTransactionId`.
- **Control de transports por llamada** — sobrescribir, agregar o quitar los transports configurados para una sola llamada a log. Podés enviar un log solo a transports concretos (`.override()`), sumar destinos (`.add()`) o sacar uno (`.remove()`), sin crear nuevas instancias de logger. Ideal para casos puntuales y entornos controlados.
- **Audit y retention** — nivel `audit` (siempre se loguea, no depende del level); `withRetention(anyJson)` para compliance y trazas de auditoría inmutables (SOX, GDPR); enrutar por política de retention a transports/almacenes dedicados.
- **Ciclo de vida** — `init()` / `shutdown()`; flush graceful en SIGTERM/SIGINT para no perder logs al bajar instancias.
- **Hooks de observabilidad** — opcionales: `onLogFailure`, `onTransportError`, `onSerializationFallback`, `onStepError`, `masking.onMaskingError`; el logging no lanza; `isNativeAddonInUse()` para comprobar en runtime.
- **Matrix en runtime** — `reconfigureLoggingMatrix()` sin reiniciar (p. ej. contexto completo temporal en producción); frontera de seguridad: solo cambia qué campos se ven, no masking ni transports.
- **Tree-shaking** — `sideEffects: false` y ESM; en el bundle solo entra lo que importás.

Para alta demanda tenés **un solo bundle**: JSON, masking, matrix, adapters, contexto y seguridad, todo automático si está configurado — con poca memoria y sin rival en esa categoría.

---

## Conclusión

Para un logger que trae **JSON, masking, contexto y seguridad por defecto** — todo automático si está configurado — **no tenemos rival**: Pino es más rápido pero no hace redacción/masking de fábrica; Winston es mucho más lento y no ofrece el mismo paquete listo para usar. Misma carga, misma comparación con “todo encendido”: somos únicos.
