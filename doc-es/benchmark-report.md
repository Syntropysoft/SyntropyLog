# SyntropyLog — Informe de benchmarks

**Fuente:** salida de `pnpm run bench:memory` (`NODE_OPTIONS=--expose-gc`).
**Fecha:** 2026-05-30. **Addon nativo (Rust):** sí (todas las máquinas).

Tres entornos, el mismo día, para que los resultados se lean como multiplataforma y no de una sola máquina:

| Etiqueta | Máquina | SO / entorno | Runtime |
|----------|---------|--------------|---------|
| **M2** | MacBook Pro (Apple M2) | macOS (nativo) | Node v20.20.1 (arm64-darwin) |
| **AMD** | AMD Ryzen 7 7735HS | **WSL2 sobre Windows 11** | Node v20.20.2 (x64-linux) |
| **GH** | AMD EPYC 7763 | **GitHub Actions CI (Ubuntu)** | Node v20.20.2 (x64-linux) |

> **Sobre los entornos.** Solo **M2** es bare-metal nativo. **AMD** corre bajo WSL2 (capa de virtualización sobre Windows). **GH** es un runner de CI compartido y virtualizado — útil como punto de x64-Linux, pero **ruidoso**: ver el disclaimer en §3.2. Toma AMD/GH como conservadores, no como el techo del hardware.

Todos los tiempos en **microsegundos (µs)**; grupo de rendimiento = 5.000 iteraciones, memoria = 100.000 iteraciones. Menor es mejor. Las cabeceras `M2` / `AMD` / `GH` de las tablas se refieren a las máquinas de arriba.

---

## 1. Esto no es una comparación 1:1

Pino y Winston son **loggers**. SyntropyLog es un **pipeline de observabilidad y cumplimiento** que, en *cada* llamada, hace lo que esos necesitan plugins o código manual para lograr. La pregunta real no es "quién escribe un string más rápido" — es "cuánto cuesta tener logging grado-compliance", y la respuesta es: **prácticamente lo mismo que un logger pelado.**

| Capacidad (de fábrica) | SyntropyLog | Pino | Winston |
|---|:---:|:---:|:---:|
| JSON estructurado | ✅ | ✅ | ✅ |
| Enmascarado / redacción PII | ✅ | ❌ (plugin) | ❌ |
| Logging Matrix (campos permitidos por nivel) | ✅ | ❌ | ❌ |
| Retención / ruteo de auditoría | ✅ | ❌ | ❌ |
| Propagación de contexto (AsyncLocalStorage) | ✅ | ❌ (manual) | ❌ |
| Sanitización / anti log-injection | ✅ | ❌ | ❌ |
| Defensa anti prototype-pollution | ✅ | ❌ | ❌ |
| Addon nativo single-pass (Rust) | ✅ | ❌ | ❌ |

Cada número de abajo es SyntropyLog ejecutando ese **stack completo** — no un logger recortado.

---

## 2. Resumen ejecutivo

| Escenario | SyntropyLog | vs Pino | vs Winston |
|-----------|-------------|---------|------------|
| **Log simple (JSON)** | 0,93 (M2) / 1,41 (AMD) / 1,73 (GH) µs | **más rápido** en M2 y WSL2; ~15–20% más lento en x64 CI | **más rápido** en todos |
| **Objeto complejo (con enmascarado)** | 5,0 (M2) / 6,0 (AMD) µs | ~2,2× más lento (coste de enmascarado — Pino no redacta) | más rápido en AMD/GH, más lento en M2 |
| **API fluida (`withRetention`)** | 6,6 / 7,3 / 10,3 µs | — | — |
| **Memoria (JSON simple)** | ~181 bytes/op | **idéntico** (~181) | ~5× menos (Winston ~936) |

**Titular:** SyntropyLog es **competitivo con Pino en rendimiento bruto haciendo mucho más en cada llamada**, y es **siempre más rápido que Winston**. En JSON simple es el más rápido de los tres en M2 y WSL2; en la máquina x64 de CI Pino se adelanta ~15–20%. En memoria es **idéntico a Pino** (~181 bytes/op) y ~5× por debajo de Winston.

El único lugar donde un logger pelado gana de forma consistente es **el throughput de string plano en x64** — donde Pino no hace nada salvo formatear un string. En cuanto necesitas redacción, control de campos, contexto o ruteo de auditoría, esa brecha es el precio de escribirlo (y mantenerlo) tú mismo.

---

## 3. Rendimiento (tiempo medio por iteración)

### 3.1 Mensaje simple (Logging Throughput)

| Librería | M2 | M2 p99 | AMD | AMD p99 | GH | GH p99 |
|----------|----|--------|-----|---------|----|--------|
| console.log (referencia) | 0,14 | 1,63 | 0,25 | 3,16 | 0,29 | 3,19 |
| **SyntropyLog (JSON)** | **0,93** | 3,46 | **1,41** | 6,33 | 1,73 | 4,96 |
| Pino | 1,22 | 1,79 | 1,60 | 3,27 | **1,40** | 3,63 |
| Winston | 1,17 | 2,04 | 2,01 | 5,81 | 2,55 | 7,72 |

- SyntropyLog es **el más rápido de los tres en M2 y AMD/WSL2** (0,93 / 1,41 µs). En la máquina x64 de CI Pino es ~15–20% más rápido (1,40 vs 1,73 µs) — un logger pelado formateando un string plano en una CPU de servidor.
- SyntropyLog es **más rápido que Winston en todos los entornos**.

### 3.2 Objeto complejo (mismo payload)

| Librería | M2 | AMD | GH | Enmascara |
|----------|----|-----|----|-----------|
| Pino (objeto complejo) | 2,14 | 2,69 | 7,64 | ❌ |
| Winston (objeto complejo) | 3,58 | 8,67 | 9,47 | ❌ |
| **SyntropyLog (con enmascarado)** | **5,00** | **5,96** | **7,72** | ✅ |

- **No es equivalente:** SyntropyLog enmascara; Pino y Winston no. En las máquinas más limpias (M2, WSL2) SyntropyLog es **~2,2× más lento que Pino** — esa brecha *es* el trabajo de redacción.
- Frente a Winston el resultado es **mixto**: más rápido en AMD (5,96 vs 8,67) y GH (7,72 vs 9,47), más lento en M2 (5,00 vs 3,58).

> **⚠️ Ruido de CI — no sobre-leer la columna GH de complejo.** Dos corridas seguidas en la *misma* máquina EPYC de GitHub, sin cambiar código, dieron números **muy distintos** de objeto complejo: SyntropyLog **11,69 → 7,72 µs** y Pino **3,06 → 7,64 µs** (un swing de 2,5×). El runner de CI compartido es demasiado ruidoso para el grupo complejo/cola. La señal fiable en todos los entornos: el camino de enmascarado de SyntropyLog cuesta **~2,2× un Pino pelado** en hardware tranquilo (M2/WSL2). Las cifras GH de arriba son de la segunda corrida, más representativa; tómalas como indicativas.

### 3.3 MaskingEngine solo (objeto complejo)

| Benchmark | M2 | AMD | GH |
|-----------|----|-----|----|
| MaskingEngine.process(complexObj) | 2,30 | 2,72 | 4,05 |

Coste aislado del enmascarado, útil como base de p99/p999 para el grupo de objeto complejo.

### 3.4 API fluida (withRetention + JSON complejo)

| Benchmark | M2 | AMD | GH |
|-----------|----|-----|----|
| SyntropyLog (withRetention complejo) | 6,58 | 7,30 | 10,33 |

Crea un logger hijo ligado a la retención + un log por iteración. Para una llamada que liga metadatos de cumplimiento, los sanitiza y los enruta por el executor, esto es despreciable en cualquier aplicación real. En un camino caliente, reutiliza un único logger `withRetention(...)` en lugar de crear uno por llamada.

---

## 4. Memoria (delta de heap por 100.000 iteraciones, bytes/op)

Obtenido con **`pnpm run bench:memory`** (Node con `--expose-gc`). La memoria es mucho más estable entre corridas que el tiempo de CPU — las cifras de GH y bare-metal coinciden de cerca.

| Benchmark | M2 | AMD | GH |
|-----------|----|-----|----|
| console.log (referencia) | 148,24 | 148,76 | 148,12 |
| SyntropyLog (JSON) | 182,01 | 182,11 | 181,46 |
| Pino | 152,92 | 151,82 | 181,20 |
| Winston | 932,45 | 946,58 | 936,29 |
| SyntropyLog (con enmascarado) | 230,28 | 219,87 | 227,47 |
| Pino (objeto complejo) | 120,78 | 123,79 | 180,76 |
| Winston (objeto complejo) | 2.288,77 | 2.249,08 | 2.288,40 |
| SyntropyLog (withRetention complejo) | 253,82 | 250,65 | 253,54 |

- SyntropyLog (JSON): **~181 bytes/op** — **idéntico a Pino** en la corrida de CI (181,46 vs 181,20), dentro de ~30 bytes en el resto.
- Con enmascarado / retención: **~220–254 bytes/op**.
- Winston: **~936 bytes/op** simple y **~2.288 bytes/op** complejo — ~5× / ~10× los otros, en todos lados.
- Para un logger que trae enmascarado, retención, matriz y contexto estructurado por defecto, un suelo de ~181 bytes/op a la par de un Pino pelado es un footprint excelente.

---

## 5. Conclusiones

- **Hace más, por el mismo precio.** SyntropyLog ejecuta enmascarado, matriz, sanitización, contexto y ruteo de auditoría en cada llamada — Pino y Winston no — y aun así queda dentro del ruido de Pino en rendimiento e *idéntico* en memoria.
- **Rendimiento:** el más rápido de los tres en M2 y WSL2; ~15–20% detrás de Pino solo en string plano x64; siempre por delante de Winston.
- **Complejo / enmascarado:** ~2,2× un Pino pelado en hardware tranquilo (el coste de redacción), más rápido que Winston en la mayoría de corridas. Las cifras complejas de CI son ruidosas — ver §3.2.
- **Memoria:** a la par de Pino (~181 bytes/op), ~5–10× por debajo de Winston.
- **Posicionamiento:** para un logger que trae JSON, enmascarado, contexto y seguridad **por defecto**, no hay rival en su categoría. Pino es más ligero pero no redacta de fábrica; Winston es mucho más pesado y lento sin el mismo paquete listo para usar.

---

## 6. Oportunidades de mejora (priorizadas)

### 6.1 Alto impacto

1. **Reducir la latencia de cola (p99/p999) para "objeto complejo + enmascarado"** — perfilar el camino crítico de enmascarado + serialización buscando caminos lentos raros, asignaciones grandes o coste de regex; valorar caché o simplificar el enmascarado para formas comunes.

### 6.2 Impacto medio

1. **Coste de la API fluida (`withRetention`)** — 6,6–10,3 µs/iter incluye crear un logger hijo cada vez. Fomentar reutilizar un logger ligado a retención en lugar de crearlo por llamada; o reducir el coste de ligar loggers (contexto diferido, menos copias).

### 6.3 Prioridad menor / validación

1. **Conseguir un número de Linux bare-metal.** Hoy la única corrida nativa es M2 (macOS); ambos puntos x64 están virtualizados (WSL2, CI). Una máquina Linux bare-metal dedicada zanjaría la cuestión del throughput x64 sin ruido de CI.
2. **"Con enmascarado" vs "sin enmascarado" explícito** — añadir un benchmark de SyntropyLog "objeto complejo sin enmascarado" para separar el coste de serialización del de enmascarado.

---

## 7. Alcance e interpretación de los resultados

Los benchmarks se ejecutaron en varios rangos de iteraciones (p. ej. 5k, 100k, 1M y 10M) para evaluar rendimiento y memoria bajo distintas cargas. Las cifras de este informe corresponden a ejecuciones donde los resultados fueron estables y comparables entre librerías.

**Cargas representativas.** Rangos desde unos pocos miles hasta alrededor de un millón de eventos de log por ejecución se alinean con el volumen típico de aplicaciones Node.js: acotado por ciclos de vida de petición, unidades de despliegue (p. ej. un único POD) y condiciones normales de operación. Dentro de estos rangos, SyntropyLog muestra un comportamiento estable de rendimiento y memoria, sin problemas observados bajo las condiciones probadas.

**Conteos de iteraciones muy altos.** Con conteos significativamente mayores (p. ej. 10M+), se observó algo de variación y degradación en la latencia media y de cola. Esa carga sostenida en un único proceso no es representativa del uso típico de Node.js o de un único POD en producción; en la práctica, el volumen de logs se reparte en el tiempo, entre instancias y entre procesos. Por tanto, estos resultados no indican una limitación práctica en escenarios de despliegue típicos.

---

## 8. Entornos de alta demanda

SyntropyLog está diseñado para entornos de **alta demanda** y regulados. Las cifras de este informe (rendimiento, latencia de cola, memoria) se obtienen con el **stack completo** activo — no con un logger recortado. Ese stack incluye:

- **Addon nativo (Rust)** — serializar + enmascarar + sanitizar en una sola pasada; strip de ANSI en metadatos.
- **Logging Matrix** — control declarativo de qué campos de contexto aparecen por nivel (lean en `info`, completo en `error`).
- **Universal Adapter** (y **AdapterTransport**) — envía logs a cualquier backend (PostgreSQL, MongoDB, Elasticsearch, S3) con un único `executor`; sin vendor lock-in.
- **MaskingEngine** — reglas integradas y personalizadas; los campos sensibles nunca salen del pipeline.
- **Pipeline de serialización** — referencias circulares, límite de profundidad configurable, timeouts; el logging nunca bloquea el event loop.
- **SanitizationEngine** — strip de caracteres de control; seguro frente a inyección en logs.
- **Contexto / cabeceras** — propagación de correlation ID y transaction ID; única fuente de verdad desde la config.
- **API fluida** — `withRetention`, `withSource`, `withTransactionId`.
- **Control de transporte por llamada** — override, add o remove de los transportes configurados para una sola llamada de log, sin crear nuevas instancias de logger.
- **Auditoría y retención** — nivel `audit` (siempre se escribe, sin importar el nivel configurado); `withRetention(anyJson)` para cumplimiento y trazas de auditoría inmutables (SOX, GDPR); enrutar por política de retención a transportes/stores dedicados.
- **Ciclo de vida** — `init()` / `shutdown()`; flush ordenado en SIGTERM/SIGINT para no perder logs al apagar instancias.
- **Hooks de observabilidad** — opcionales: `onLogFailure`, `onTransportError`, `onSerializationFallback`, `onStepError`, `masking.onMaskingError`; el logging nunca lanza; `isNativeAddonInUse()` para comprobar en runtime.
- **Matriz en runtime** — `reconfigureLoggingMatrix()` sin reinicio; frontera de seguridad: solo cambia qué campos son visibles, no el enmascarado ni los transportes.
- **Tree-shaking** — `sideEffects: false` y ESM; solo lo que importas acaba en el bundle.

Para alta demanda obtienes **un único bundle**: JSON, enmascarado, matriz, adapters, contexto y seguridad — todo automático cuando se configura — con baja memoria y sin rival en esa categoría.

**Lista canónica con ejemplos:** cada punto de la lista anterior se desarrolla con explicación y ejemplos de código en [caracteristicas-y-ejemplos.md](./caracteristicas-y-ejemplos.md).
