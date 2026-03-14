# Plan de implementación: Rust como “Fórmula 1” del pipeline

Objetivo: **usar al máximo el addon nativo (Rust)** para dar mejor experiencia al usuario — menos CPU en JS, mismo comportamiento y seguridad. Detalle de cada oportunidad en [rust-pipeline-optimization.md](rust-pipeline-optimization.md).

**Criterio:** I/O se queda en Node; Rust se encarga del trabajo CPU puro (serialización, sanitización, enmascarado, formateo, etc.).

---

## Cómo usar este plan

- Ir tachando ítems cuando estén hechos (cambiar `- [ ]` por `- [x]`).
- Actualizar **Último paso completado** y **Siguiente paso** al inicio del doc cuando avances.
- Las fases están ordenadas por impacto y dependencias; se pueden hacer en paralelo donde no haya dependencias.

---

### Último paso completado / Siguiente paso

- **Último paso completado:** Fase 1.3 — Metadata como string: fast_serialize_from_json en Rust, path en JS (JSON.stringify → fastSerializeFromJson, fallback a fastSerialize si error o circulares).
- **Siguiente paso sugerido:** Fase 2 — Documentación addon (2.1).

---

## Fase 0 — Preparación y visibilidad

Objetivo: saber cuándo el addon no se usa y asegurar que el release entregue el “Fórmula 1” por defecto.

- [x] **0.1** — **Observabilidad del fallback**  
  - En `SerializationManager`, si ya existe `onSerializationFallback`, documentarlo en la API y en el README.  
  - Si no existe: añadir un callback opcional (ej. `onSerializationFallback?: (err: unknown) => void`) que se invoque cuando la llamada al addon falle y se use el pipeline JS.  
  - Permite al usuario (o a un monitor) ver cuándo no se está usando Rust.

- [x] **0.2** — **Verificar y documentar prebuilt**  
  - Confirmar que el flujo de release (build addon en Linux/Windows/macOS y empaquetado en `syntropylog-native`) está estable y se ejecuta en cada release.  
  - Añadir en README (o en docs) una línea tipo: “Para la mejor experiencia de rendimiento se usan binarios precompilados del addon nativo; se instalan automáticamente en instalaciones compatibles.”

- [x] **0.3** — **Benchmark de referencia (opcional)**  
  - Tener un benchmark que compare throughput/p99 **con addon** vs **sin addon** (ej. variable de entorno o flag para deshabilitar el addon), para poder medir mejoras en fases siguientes.

---

## Fase 1 — Pipeline en Rust (optimizar el addon actual)

Todo en `syntropylog-native`; sin cambios de API en JS salvo donde se indique.

- [x] **1.1** — **Un solo recorrido convert + mask**  
  - Refactor en Rust: fusionar la conversión JS → valor interno con la aplicación de máscara/truncado/límites en **un solo** recorrido del árbol.  
  - Objetivo: menos asignaciones y un pase menos por los datos.  
  - Validar con tests existentes y, si hay, benchmark antes/después.

- [x] **1.2** — **Strip ANSI / caracteres de control en Rust**  
  - Dentro del tratamiento de strings en el addon (donde se aplica truncado/redacción), añadir strip de secuencias ANSI (regex equivalente a `SanitizationEngine` en JS) y, si se desea, caracteres de control genéricos.  
  - La salida del addon queda segura por defecto frente a log injection.  
  - Actualizar tests para cubrir strings con ANSI y comprobar que se eliminan.

- [x] **1.3** — **Metadata como string (experimental)**  
  - En JS: intentar `JSON.stringify(metadata)`; si no lanza (sin circulares), llamar a una nueva función del addon, ej. `fast_serialize_from_json(level, message, timestamp, service, metadata_json_string)`.  
  - En Rust: parsear el JSON y reutilizar la lógica de mask/serialización actual (o la del recorrido unificado de 1.1). Si JS no puede serializar (circular), fallback a `fast_serialize` con objeto.  
  - Añadir benchmark (metadata pequeña vs grande) y decidir si se deja como path por defecto o solo bajo opción.

---

## Fase 2 — Asegurar que el usuario use el addon (experiencia “Fórmula 1”)

- [ ] **2.1** — **README / documentación**  
  - Sección corta “Rendimiento” o “Addon nativo”: explicar que la instalación normal incluye binarios precompilados del addon en Rust y que eso ofrece el mejor rendimiento.  
  - Mencionar requisitos (versiones de Node soportadas, plataformas con prebuilt). Enlace a [rust-pipeline-optimization.md](rust-pipeline-optimization.md) o a este plan para quien quiera más detalle.

- [ ] **2.2** — **Detección en runtime (opcional)**  
  - Si tiene sentido para vuestra API: exponer algo como `syntropyLog.isNativeAddonLoaded()` o similar para que el usuario pueda comprobar en tiempo de ejecución si está usando el path Rust.  
  - Útil para diagnóstico y para tests.

---

## Fase 3 — Más trabajo CPU en Rust (fuera del pipeline)

- [ ] **3.1** — **Formateo de mensaje en Rust (`format_message`)**  
  - Implementar en el addon una función que acepte una cadena de formato y argumentos (ej. como JSON array) y devuelva la cadena formateada (subconjunto de placeholders: `%s`, `%d`, `%i`, `%f`, `%j`).  
  - En `Logger`, cuando haya argumentos de formato: si el addon está cargado, llamar a esta función en lugar de `util.format`. Si no, mantener `util.format`.  
  - Tests: mismos casos que con `util.format` (al menos el subconjunto soportado).

- [ ] **3.2** — **Masking JSON-in / JSON-out para el path sin addon (opcional)**  
  - Nuevo método en el addon: recibe una string JSON (log entry ya serializado por el pipeline JS) y devuelve otra string JSON con las mismas reglas built-in de enmascarado (sensitive_fields, redact_patterns, y si se alinean, estrategias tipo credit_card/SSN/email).  
  - En el path **sin** addon: después del pipeline JS, serializar el entry a JSON, llamar a Rust para enmascarar, y pasar la string resultante a los transports (o deserializar solo si el transport espera objeto). Las reglas custom (funciones JS) se aplican en JS antes o después según diseño.  
  - Objetivo: que el fallback también descargue la parte más pesada del masking a Rust. Requiere mantener paridad de comportamiento con `MaskingEngine` para las reglas built-in.

---

## Fase 4 — Futuro (solo si se añaden las features)

- [ ] **4.1** — **Compresión**  
  - Si se añade la feature de comprimir logs antes de enviar: implementar en el addon (ej. con `zstd` o `lz4`) y exponer algo como `compress_log_buffer(data: string) -> Buffer`. El I/O (write/send) sigue en Node.

- [ ] **4.2** — **Hashing para sampling / deduplicación**  
  - Si se añade sampling por contenido o dedup: implementar en el addon un hash rápido (ej. xxhash, fnv) y exponer `hash_for_sampling(line: string) -> number`. La decisión de enviar o no y el I/O siguen en Node.

---

## Resumen de fases

| Fase | Enfoque | Dependencias |
|------|--------|--------------|
| **0** | Visibilidad y prebuilt | — |
| **1** | Optimizar pipeline en Rust | 0.2 recomendado (prebuilt verificado) |
| **2** | Experiencia usuario (doc + opcional detección) | 0.2 |
| **3** | Formateo y masking para fallback | 1.x recomendado |
| **4** | Compresión / hashing | Features futuras |

Cuando termines un ítem, márcalo con `- [x]` y actualiza “Último paso completado” y “Siguiente paso” arriba para seguir el ritmo.
