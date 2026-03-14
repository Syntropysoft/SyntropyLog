# SyntropyLog — Informe de benchmarks (objetivo)

**Entorno:** Apple M2, Node v20.20.1 (arm64-darwin)  
**Addon nativo (Rust):** sí  
**Fuente:** salida de `pnpm run bench` (rendimiento: 5M iteraciones; memoria: 100k iteraciones)

Todos los tiempos en **microsegundos (µs)** salvo indicación contraria. Menor es mejor para tiempo y bytes/op.

---

## 1. Resumen ejecutivo


| Escenario                   | SyntropyLog                | vs Pino      | vs Winston   |
| -------------------------- | -------------------------- | ------------ | ------------ |
| Log simple (JSON)          | 0,93 µs media              | ~1,5× más lento | ~1,3× más rápido |
| Objeto complejo            | 6,69 µs media (con enmascarado) | ~3,5× más lento | ~1,8× más rápido |
| API fluida (withRetention) | 8,63 µs media              | —            | —            |


- **Rendimiento:** SyntropyLog se sitúa entre Pino (el más rápido) y Winston. En logging simple está más cerca de Pino; en payloads complejos con enmascarado es el más lento de los tres, pero es el único que aplica enmascarado en ese grupo.
- **Latencia de cola:** SyntropyLog (con enmascarado) muestra un p99/p999 más alto (42 µs / 145 µs) que Pino y Winston en el caso de objeto complejo; SyntropyLog simple (JSON) tiene un p999 muy ajustado (4,96 µs).
- **Memoria:** Los bytes/op de SyntropyLog están en el rango bajo–medio (≈229–266 bytes/op con `bench:memory`); Pino es comparable (≈181–182 bytes/op); Winston es el más alto (≈939–2288 bytes/op). *Antes*, sin `--expose-gc`, Pino aparecía como 0 B por un bug de medición (delta negativo reclampado a 0); ya está corregido (se muestra "0 (noise)" y se recomienda `pnpm run bench:memory`).

---

## 2. Rendimiento (tiempo medio por iteración)

### 2.1 Mensaje simple (sin objeto complejo)


| Librería                | media (µs) | mín (µs) | máx (µs) | p75 (µs) | p99 (µs) | p999 (µs) |
| ---------------------- | -------- | -------- | -------- | -------- | -------- | --------- |
| console.log (referencia) | 0,15     | 0,09     | 11,42    | 0,10     | 1,82     | 4,84      |
| **Pino**               | **0,61** | 0,29     | 9.866    | 0,42     | 1,46     | 29,58     |
| **SyntropyLog (JSON)** | **0,93** | 0,70     | 4,96     | 0,76     | 3,44     | 4,96      |
| Winston                | 1,23     | 0,46     | 10.103   | 0,58     | 2,13     | 8,13      |


- SyntropyLog es **~1,5× más lento** que Pino y **~1,3× más rápido** que Winston en media.
- SyntropyLog tiene el **máx y p999 más ajustados** en este grupo (4,96 µs); Pino y Winston muestran máximos muy altos (≈10 ms), lo que sugiere pausas ocasionales o GC.

### 2.2 Objeto complejo (mismo payload)


| Librería                        | media (µs) | mín (µs) | máx (µs) | p75 (µs) | p99 (µs) | p999 (µs) |
| ------------------------------ | -------- | -------- | -------- | -------- | -------- | --------- |
| **Pino (objeto complejo)**     | **1,88** | 1,08     | 11,44    | 1,82     | 8,12     | 11,44     |
| Winston (objeto complejo)      | 3,79     | 1,63     | 7.540    | 1,83     | 3,79     | 8,04      |
| **SyntropyLog (con enmascarado)** | **6,69** | 3,00     | 15.808   | 3,96     | 42,29    | 144,71    |


- **Nota:** SyntropyLog aplica **enmascarado** (redacción) sobre el objeto complejo; Pino y Winston no. Por tanto “objeto complejo” no es estrictamente comparable.
- En cifras brutas: SyntropyLog es **~3,55× más lento** que Pino y **~1,76× más lento** que Winston.
- El **p99 (42 µs) y p999 (145 µs)** de SyntropyLog son notablemente más altos que los otros dos; es un área clara de mejora.

### 2.3 API fluida (withRetention + JSON complejo)


| Librería                             | media (µs) | mín (µs) | máx (µs) | p75 (µs) | p99 (µs) | p999 (µs) |
| ----------------------------------- | -------- | -------- | -------- | -------- | -------- | --------- |
| SyntropyLog (withRetention complejo) | 8,63     | 7,75     | 2.578    | 8,38     | 11,54    | 17,04     |


- Escenario único: **8,63 µs** de media. El coste viene de crear un logger hijo (withRetention) + un log por iteración. No hay competidor directo en esta ejecución.

---

## 3. Memoria (delta de heap por 100k iteraciones, bytes/op)

**Importante:** Las cifras que siguen se obtienen con **`pnpm run bench:memory`** (Node con `--expose-gc`). Sin ello, el “before” de cada tarea es el heap de la tarea anterior; allocators bajos (p. ej. Pino) pueden dar delta negativo que se reclampaba a 0 y se mostraba como “0 B” — era un **bug de medición**, no cero asignación real. Corregido: sin `--expose-gc` se muestra **"0 (noise)"** cuando el delta es negativo y se recomienda usar `bench:memory` para resultados estables.

| Benchmark                           | delta heap | bytes/op |
| ----------------------------------- | ---------- | -------- |
| console.log (referencia)            | 89,26 MB   | 935,93   |
| SyntropyLog (JSON)                  | 21,82 MB   | 228,82   |
| Pino                                | 17,30 MB   | 181,35   |
| Winston                             | 89,59 MB   | 939,38   |
| SyntropyLog (con enmascarado)       | 24,07 MB   | 252,39   |
| Pino (objeto complejo)              | 17,37 MB   | 182,18   |
| Winston (objeto complejo)           | 218,22 MB  | 2.288,19 |
| SyntropyLog (withRetention complejo)| 25,38 MB   | 266,18   |

- SyntropyLog: **~229–266 bytes/op** en los escenarios medidos (con `bench:memory`).
- Pino: **~181–182 bytes/op** — comparable o algo menor que SyntropyLog en log simple.
- Winston: **~939–2288 bytes/op** — mucho más alto.
- El perfil de memoria de SyntropyLog es razonable dado el conjunto de características (enmascarado, retención, contexto estructurado).

---

## 4. Oportunidades de mejora (priorizadas)

### 4.1 Alto impacto

1. **Reducir la latencia de cola (p99/p999) para “objeto complejo + enmascarado”**
  - Hoy: p99 ≈ 42 µs, p999 ≈ 145 µs (frente a Pino/Winston en dígitos o decenas bajas de µs).  
  - Acciones: perfilar el camino crítico (serialización + enmascarado), buscar caminos lentos raros, asignaciones grandes o coste de regex; valorar caché o simplificar el enmascarado para formas comunes.
2. **Cerrar la brecha frente a Pino en logs simples y complejos**
  - Simple: 0,93 µs vs 0,61 µs (~52 % más lento).  
  - Complejo (con enmascarado): 6,69 µs vs 1,88 µs (~256 % más lento); parte de esto es el trabajo extra (enmascarado).  
  - Acciones: asegurar que el addon Rust se usa en el camino crítico; optimizar el `fastSerialize` nativo y reducir el coste del límite JS↔nativo; valorar enmascarado diferido o por lotes donde sea seguro.

### 4.2 Impacto medio

1. **Coste de la API fluida (withRetention)**
  - 8,63 µs/iter incluye crear un logger hijo cada vez.  
  - Acciones: fomentar reutilizar un logger de “retention” en lugar de crearlo por llamada; o optimizar el coste de crear loggers ligados (contexto diferido, menos copias).
2. **Estabilidad de los benchmarks de memoria** *(parcialmente resuelto)*
   - Pino mostraba 0 B por un bug de medición: sin `--expose-gc` no se llama a `gc()` entre tareas, el delta podía ser negativo y se reclampaba a 0.  
   - **Hecho:** el benchmark ahora muestra **"0 (noise)"** cuando el delta es negativo y recomienda `pnpm run bench:memory`; con `bench:memory` las cifras son estables (Pino ~17 MB / ~181 bytes/op).  
   - Opcional: ejecutar varias pasadas y reportar mediana/percentiles.

### 4.3 Prioridad menor / validación

1. **Picos de latencia máxima**
  - SyntropyLog (con enmascarado) máx 15.808 µs vs p999 145 µs sugiere valores atípicos raros.  
  - Acciones: perfilar bajo carga para ver si se correlacionan con GC, optimización de V8 o payloads concretos; añadir opción de tiempo máximo o muestreo en desarrollo para detectar regresiones.
2. **“Con enmascarado” vs “sin enmascarado” explícito**
  - Añadir un benchmark de SyntropyLog “objeto complejo sin enmascarado” para separar el coste de serialización del coste de enmascarado y guiar la optimización (serialización vs enmascarado).

---

## 5. Conclusiones

- **Posicionamiento:** SyntropyLog es más rápido que Winston y más lento que Pino en estos benchmarks; en memoria (con `pnpm run bench:memory`) SyntropyLog está en el rango ~229–266 bytes/op y Pino en ~181–182 bytes/op, ambos muy por debajo de Winston (~939–2288 bytes/op).
- **Fortalezas:** Latencia de cola ajustada para logging JSON simple; memoria razonable; addon Rust en uso.
- **Principales oportunidades:** Reducir p99/p999 en el camino de enmascarado y optimizar más la ruta nativa de serialización/enmascarado para acercarse a Pino manteniendo la semántica de enmascarado y retención.
