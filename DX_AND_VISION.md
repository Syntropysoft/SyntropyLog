# Guía Maestra de Ingeniería y Producto: SyntropyLog
_Versión: 1.0 - "Blueprint de Nivel Jira"_

---

## 1. Visión General y Filosofía

**Propósito de este Documento:** Este no es un `README`. Es la fuente única de verdad (`Single Source of Truth`) para la planificación, diseño y ejecución del framework SyntropyLog. Cada sección está diseñada como un "paquete de trabajo" que define una capacidad del sistema, su justificación de negocio, sus especificaciones técnicas y los criterios para considerarla "terminada". Sirve como el puente directo entre la visión del producto y los Epics de ingeniería.

**Filosofía Central:** SyntropyLog no es un logger, es un **framework de gobernanza de la observabilidad**. Su propósito es permitir a los equipos de ingeniería enviar software resiliente, seguro y rentable a producción, con la confianza de que su telemetría es controlable, segura y no un cuello de botella. Se basa en principios innegociables: contexto unificado, extensibilidad por defecto (Plugin-First), DX sin fricción y compliance como una característica de primer nivel.

---

## Parte I: El Núcleo — Arquitectura Central

### **Epic: Core-Arch — Fundamentos del Framework**

#### **Feature: Context-Manager — Propagación de Contexto Transparente**
- **Justificación (User Story):** Como desarrollador, quiero que un identificador único de la operación (`correlationId`) se propague automáticamente a través de todas mis llamadas asíncronas, colas de mensajes y workers, sin que yo tenga que pasarlo manualmente, para poder rastrear una solicitud de extremo a extremo con facilidad.
- **Criterios de Aceptación (AC):**
    - **AC1:** Al iniciar una operación (ej. una petición HTTP), se crea un contexto. Cualquier log o cliente obtenido dentro de esa operación hereda automáticamente el `correlationId`.
    - **AC2:** El contexto se propaga correctamente a través de `Promise.then/.catch`, `async/await`, y `EventEmitter`.
    - **AC3:** El contexto se propaga a `worker_threads` (Node.js) si se utiliza un wrapper proporcionado por el framework.
    - **AC4:** La sobrecarga de rendimiento por mantener el contexto es medible y se mantiene por debajo de 3µs por operación asíncrona en los benchmarks.
- **Especificación Técnica:**
    - **Implementación Principal (Node.js):** Se basará en `AsyncLocalStorage` para crear un almacén inmutable por cada operación asíncrona.
    - **Implementaciones Futuras:** Go (`context`), Python (`contextvars`).
    - **API Pública:**
        - `syntropyLog.getContextManager().set(key, value)`: Añade un dato al contexto actual.
        - `syntropyLog.getContextManager().get(key)`: Obtiene un dato del contexto actual.
        - `syntropyLog.getContextManager().run(context, () => { ... })`: Ejecuta una función dentro de un contexto específico (útil para jobs de fondo).
- **Desglose de Tareas:**
    - `[Task]` Implementar `ContextManager.ts` con `AsyncLocalStorage`.
    - `[Task]` Implementar los métodos `set`, `get`, `run`.
    - `[Task]` Crear tests que verifiquen la propagación en `async/await`, `Promises` y `EventEmitter`.
    - `[Task]` Crear un benchmark específico para medir el overhead del `ContextManager`.

---

#### **Feature: Masking-Engine — Seguridad por Defecto**
- **Justificación (User Story):** Como responsable de seguridad, quiero definir un conjunto central de reglas de enmascaramiento para datos sensibles (ej. `password`, `creditCardNumber`), y que el framework las aplique automáticamente a todos los logs, para prevenir fugas de datos accidentales.
- **Criterios de Aceptación (AC):**
    - **AC1:** El `MaskingEngine` sanitiza cualquier objeto de log antes de ser procesado por los transportes.
    - **AC2:** Soporta el enmascaramiento recursivo en objetos y arrays anidados.
    - **AC3:** Las reglas de enmascaramiento se cargan durante la inicialización y se compilan/cachean para un rendimiento óptimo.
    - **AC4:** Se pueden definir diferentes estrategias de enmascaramiento: redacción completa, parcial o hashing.
- **Especificación Técnica:**
    - **Lógica Central:** Un visitor que recorre el árbol de propiedades de un objeto. Para cada clave, comprueba si coincide con alguna regla de enmascaramiento.
    - **Cacheo de Regex:** Las reglas basadas en expresiones regulares se compilan a un objeto `RegExp` una sola vez y se guardan en un `Map` para su reutilización.
    - **Estrategias:** La configuración aceptará un objeto `strategies` que mapea un nombre de estrategia a una función de transformación.
- **Desglose de Tareas:**
    - `[Task]` Implementar `MaskingEngine.ts` con la lógica de recorrido de objetos.
    - `[Task]` Implementar el cacheo de expresiones regulares.
    - `[Task]` Implementar el sistema de estrategias de enmascaramiento.
    - `[Task]` Escribir tests unitarios para enmascaramiento anidado y diferentes estrategias.

---

#### **Feature: Canonical-Data-Model — Contrato Agnóstico del Lenguaje**
- **Justificación (User Story):** Como arquitecto, necesito un modelo de datos canónico y bien definido para toda la telemetría, para que las implementaciones en diferentes lenguajes (TypeScript, Go, Python) sean consistentes y los datos generados sean interoperables.
- **Criterios de Aceptación (AC):**
    - **AC1:** Todas las implementaciones de SyntropyLog deben producir un objeto `LogEnvelope` que se adhiera al esquema definido.
    - **AC2:** El esquema está formalmente definido usando JSON Schema y publicado en un repositorio de especificaciones.
    - **AC3:** La estructura es lo suficientemente flexible para soportar logs, y en el futuro, métricas y trazas.
- **Especificación Técnica:**
    - **`LogEnvelope` (El Contenedor):**
        - `timestamp`: `integer` (Unix epoch, nanosegundos). *Obligatorio*.
        - `level`: `enum` (`TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`). *Obligatorio*.
        - `serviceName`: `string`. *Obligatorio*.
        - `message`: `string`. Mensaje legible. *Obligatorio*.
        - `context`: `ContextSnapshot`. *Obligatorio*.
        - `payload`: `map<string, any>`. Datos estructurados específicos del log. *Opcional*.
    - **`ContextSnapshot` (La Huella Digital):**
        - `correlationId`: `string` (formato UUIDv4/v7). *Obligatorio*.
        - `causationId`: `string`. ID del evento padre. *Opcional*.
        - `[custom_fields]`: `map<string, any>`.
- **Desglose de Tareas:**
    - `[Task]` Crear un repositorio `github.com/syntropy-soft/spec`.
    - `[Task]` Definir `log-envelope.schema.json` y `context-snapshot.schema.json` en ese repositorio.
    - `[Task]` Refactorizar los tipos internos de TypeScript para que sean generados o validados contra estos esquemas.

---

## Parte II: Features de Alto Impacto

### **Epic: Perf-Scale — Rendimiento a Escala de Hipercrecimiento**

#### **Feature: Non-Blocking-Buffer — Transporte de Consola Asíncrono con Ring-Buffer**
- **Justificación (User Story):** Como desarrollador de una aplicación de alto rendimiento, quiero que el logger pueda procesar >100,000 logs/s sin bloquear el Event Loop, para que la observabilidad no se convierta en un cuello de botella.
- **Criterios de Aceptación (AC):**
    - **AC1:** En benchmarks, el lag del Event Loop no supera los 5ms bajo una carga de 100k logs/s.
    - **AC2:** Cuando el buffer alcanza su `high-water mark`, los logs de `INFO` o inferior se descartan.
    - **AC3:** En un apagado controlado, `flush()` garantiza que todos los logs en el buffer se escriban.
- **Especificación Técnica:**
    - **Componentes:** `RingBuffer` (usando `SharedArrayBuffer` y `Atomics`), `LogWriterWorker` (un `worker_thread` que drena el buffer), `BufferedConsoleTransport` (el plugin que los orquesta).
    - **Flujo:** `log()` en el transporte serializa el log -> `tryEnqueue` en el `RingBuffer` -> el worker es notificado vía `Atomics.wait` -> el worker despierta, drena con `dequeue` y escribe en `stdout`.
- **Desglose de Tareas:**
    - `[Task]` Implementar la clase `RingBuffer`.
    - `[Task]` Escribir tests unitarios exhaustivos para `RingBuffer`.
    - `[Task]` Crear el script `log-writer.worker.ts`.
    - `[Task]` Implementar la clase `BufferedConsoleTransport`.
    - `[Task]` Integrar el nuevo transporte como opción por defecto en producción.

---
## Parte III: Extensibilidad y Ecosistema (El SDK)

### **Epic: SDK-Ecosystem — Un Framework Abierto a la Comunidad**

#### **Feature: Transport-Plugin-API — Contrato para Transportes de Telemetría**
- **Justificación (User Story):** Como desarrollador, quiero poder enviar mis logs a cualquier destino (Loki, S3, Kafka) implementando una interfaz simple y estable, para extender el framework sin necesidad de modificar su núcleo.
- **Criterios de Aceptación (AC):**
    - **AC1:** Se exporta una interfaz `TransportPlugin` clara y documentada.
    - **AC2:** El ciclo de vida (`init`, `log`, `flush`, `dispose`) está bien definido y el framework lo respeta.
    - **AC3:** El sistema de `priority` permite al usuario influir en el orden de ejecución de los transportes.
- **Especificación Técnica:**
    - **Interfaz (`src/plugins/transport.ts`):**
        ```typescript
        export interface TransportPlugin {
          id: string; // Identificador único, ej: 'console-transport'
          priority?: number; // Menor número = mayor prioridad
          init(ctx: LoggerContext): Promise<void>;
          log(entry: LogEnvelope): Promise<void>;
          flush?(): Promise<void>;
          dispose?(): Promise<void>;
        }
        ```
- **Desglose de Tareas:**
    - `[Task]` Formalizar la interfaz `TransportPlugin` y `LogEnvelope` en `src/plugins/`.
    - `[Task]` Refactorizar los transportes existentes (`Console`, `PrettyConsole`) para que implementen la nueva interfaz.
    - `[Task]` Crear un ejemplo de un `S3Transport` como prueba de concepto.

---
Este es un extracto del nivel de detalle que se aplicará a todo el documento. El archivo completo será la guía definitiva para construir SyntropyLog. 