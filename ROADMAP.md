# Hoja de Ruta de SyntropyLog (Visión Élite)

Este documento describe la hoja de ruta estratégica para transformar SyntropyLog en un framework de observabilidad de clase mundial, enfocado en rendimiento, resiliencia y extensibilidad.

## v0.8 — Throughput & Back-pressure (Rendimiento y Gestión de Carga)

- [ ] **[Rendimiento] Implementar Buffer No-Bloqueante y Escritor en Worker Thread**
  - **Objetivo:** Alcanzar un throughput sostenido de >70 MB/s, evitando bloquear el Event Loop bajo cualquier circunstancia.
  - **Acción 1: Implementar el Ring Buffer.**
    - Crear una clase `RingBuffer` que utilice un `SharedArrayBuffer` para permitir el acceso de alto rendimiento desde el hilo principal y el worker.
    - Gestionar los punteros de lectura/escritura usando `Atomics` para garantizar operaciones sin bloqueos y seguras entre hilos.
  - **Acción 2: Desarrollar el Worker de Escritura.**
    - Crear un `log-writer.worker.ts` que se ejecute en un hilo separado (usando una librería como `piscina` para la gestión del pool).
    - El worker se quedará en un bucle, esperando a que `Atomics.notify` le indique que hay nuevos logs en el `RingBuffer`, los leerá, los formateará y los escribirá en `stdout`.
  - **Acción 3: Implementar la Lógica de Back-Pressure.**
    - En el hilo principal, antes de añadir un log al buffer, se comprobará el "nivel de agua" (la distancia entre los punteros de lectura y escritura).
    - Si el buffer está lleno (high-water mark), los logs con severidad `info` o `debug` se descartarán inmediatamente para proteger la aplicación. Los logs de `error` o superior podrían esperar brevemente o forzar la escritura.

- [ ] **[Rendimiento] Benchmarks Públicos y Optimización de Regex**
  - **Objetivo:** Cuantificar el rendimiento y validarlo contra Pino. El objetivo es un overhead de ~1.2x el de Pino.
  - **Acción 1: Crear Suite de Benchmarks.**
    - Crear un directorio `benchmarks/` con varios escenarios:
      - `simple.bench.ts`: Bucle de `logger.info('hello')` para medir el throughput puro.
      - `http.bench.ts`: Servidor Express con un endpoint logueando cada petición, atacado con `autocannon` para medir latencia y sobrecarga por petición.
      - `large-object.bench.ts`: Benchmark de logueo de objetos complejos para medir el impacto de `JSON.stringify`.
  - **Acción 2: Integrar Benchmarks en el CI.**
    - Configurar un runner auto-hospedado en GitHub Actions (4+ vCPU) para ejecutar los benchmarks en cada PR.
    - Usar una action que comente en el PR con un gráfico de tendencias de rendimiento para detectar regresiones.
  - **Acción 3: Optimizar y Cachear Regex.**
    - Modificar `src/masking/MaskingEngine.ts` para cachear las instancias de `RegExp` compiladas en un `Map` y reutilizarlas.
    - Usar `node --trace-gc` en los benchmarks para verificar que no hay compilaciones de RegExp "en caliente" tras la inicialización.

- [ ] **[Seguridad] Prevenir Denegación de Servicio por Expresiones Regulares (ReDoS)**
  - **Objetivo:** Proteger a los usuarios de configuraciones de enmascaramiento maliciosas.
  - **Acción:**
    - Modificar `src/masking/MaskingEngine.ts` y el método `init` en `src/SyntropyLog.ts`.
    - Durante la inicialización, iterar sobre todas las reglas de enmascaramiento que sean strings y validarlas con la librería `safe-regex`.
    - Si alguna expresión regular no es segura, la inicialización debe fallar con un error descriptivo que indique qué regla es la culpable.

## v0.9 — Plugins y Observabilidad Distribuida

- [ ] **[Arquitectura] SDK de Plugins Estable y Extensible**
  - **Objetivo:** Permitir a la comunidad extender SyntropyLog con sus propias integraciones.
  - **Acción 1: Definir las Interfaces Públicas.**
    - Crear `src/plugins/transport.ts` y `src/plugins/masking.ts` para exportar las interfaces `TransportPlugin` y `MaskingRule`.
    - Asegurar que las interfaces incluyan `id` (string, único), `priority` (number, para ordenar), y un ciclo de vida (`init`, `flush`, `dispose`).
  - **Acción 2: Crear Transportes de Ejemplo Oficiales.**
    - **OTLP/HTTP:** Crear un `syntropylog-otlp-transport` que formatee los logs al estándar OpenTelemetry y los envíe vía HTTP.
    - **AWS S3:** Crear un `syntropylog-s3-transport` que agrupe logs en memoria y los suba a un bucket de S3 por lotes (cada 1 minuto o al alcanzar 5MB).

- [ ] **[Resiliencia] Propagación de Contexto y Pruebas de Caos**
  - **Objetivo:** Garantizar la correlación de logs en sistemas distribuidos complejos y su resiliencia ante fallos.
  - **Acción 1: Implementar W3C Trace-Context.**
    - En el `HttpManager`, añadir soporte nativo para leer/escribir los headers `traceparent` y `tracestate` para una máxima interoperabilidad.
  - **Acción 2: Propagar Contexto a `worker_threads`.**
    - Crear una función wrapper que, al crear un `new Worker()`, capture el contexto de `AsyncLocalStorage` del hilo padre y lo restaure en el hilo hijo antes de ejecutar su código.
  - **Acción 3: Implementar Circuit Breaker para Redis.**
    - Integrar una librería como `opossum` en el `RedisManager` para envolver las operaciones de Redis.
    - Configurar un `exponential back-off` y un `half-open state` para permitir que el sistema se recupere automáticamente.
  - **Acción 4: Crear Pipeline de Pruebas de Caos.**
    - Crear un `docker-compose.chaos.yml` que use `toxiproxy` para introducir latencia (250ms) y cortes (5s) en las conexiones a Redis y otros servicios.
    - Crear una suite de tests (`tests/chaos/`) que verifique que los logs no se pierden y la aplicación no se bloquea durante estos eventos.

- [ ] **[Métricas] Exportador de Métricas Nativo**
  - **Objetivo:** Proporcionar observabilidad sobre el propio logger (introspección).
  - **Acción:**
    - Crear un `MetricsManager` opcional, activado vía configuración.
    - Usar `prom-client` para exponer un endpoint `/metrics` con histogramas y percentiles sobre: latencia de los transportes, tamaño del buffer, y logs descartados por back-pressure.

## v1.0 — Compliance-Ready y Lanzamiento Público

- [ ] **[Compliance] Generador de Reglas y Criptografía Segura**
  - **Objetivo:** Facilitar el cumplimiento de normativas como PCI-DSS o GDPR.
  - **Acción 1: Desarrollar el Generador de Reglas.**
    - Crear un script CLI (`syntropylog generate-masks --from=pci-dss.yml`) que use `js-yaml` para parsear un archivo de compliance y `ts-morph` para generar un archivo `pci-dss.masking.ts` con las reglas de enmascaramiento correspondientes.
  - **Acción 2: Implementar Hash Criptográfico Seguro.**
    - Para las reglas de enmascaramiento que requieran hashing, usar el `crypto.pbkdf2` nativo de Node.js con un salt único por cada valor para prevenir ataques de rainbow tables.
  - **Acción 3: Integrar Auditoría de Seguridad Continua.**
    - Añadir al CI los comandos `npx socket-ci` y `npm audit --audit-level=high` para bloquear PRs que introduzcan dependencias con vulnerabilidades.

- [ ] **[DX] Calidad de Código y Tipado Ultra-Estricto**
  - **Acción 1: Eliminar `any`.**
    - Realizar una pasada por toda la base de código, reemplazando cada `any` por `unknown` y añadiendo los predicados de tipo necesarios para garantizar la seguridad.
  - **Acción 2: Fortalecer `tsconfig.json`.**
    - Activar `"exactOptionalPropertyTypes": true` y solucionar cualquier error derivado.
  - **Acción 3: Implementar Tipos Literales Estrictos.**
    - Usar `template-literal types` para `LogLevel` y otros tipos string para que el compilador pueda detectar errores tipográficos.

- [ ] **[Comunidad] Lanzamiento y Automatización**
  - **Acción 1: Configurar `changesets`.**
    - Ejecutar `npx changeset init` y configurar el bot de `changesets` en el repositorio para automatizar la gestión de `CHANGELOG.md` y el versionado.
    - Configurar el CI para que publique versiones `@canary` en NPM automáticamente tras un merge a `main`.
  - **Acción 2: Publicar Documentación Completa.**
    - Configurar `typedoc` para generar la referencia de la API y publicarla en GitHub Pages.
    - Escribir guías de alta calidad para la migración desde Winston y Pino. 