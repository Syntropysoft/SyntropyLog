# Explicación General de SyntropyLog

SyntropyLog es un **marco de observabilidad estructurada** diseñado específicamente para aplicaciones en **Node.js**. Su objetivo principal es permitirte declarar qué información deben llevar tus logs de forma automática, garantizando el rendimiento y cumplimiento normativo en todo momento.

Está especialmente construido para entornos de **alta demanda** y de **alta regulación** (como banca, salud o fintech), donde el control sobre los datos y la resiliencia del sistema son críticos.

---

## ¿Para qué sirve?

En aplicaciones tradicionales, los logs pueden ser pesados, difíciles de rastrear o contener información sensible (como contraseñas o datos personales) que violan regulaciones como GDPR o HIPAA. 

SyntropyLog resuelve esto permitiéndote:
1.  **Controlar qué se muestra:** Mediante una matriz (`Logging Matrix`), defines qué campos de contexto (como `userId` o `correlationId`) se incluyen en cada nivel de log (por ejemplo, poco en `info`, todo en `error`).
2.  **Proteger datos sensibles:** Un motor de enmascaramiento automático (`MaskingEngine`) filtra contraseñas, emails, tarjetas, etc., **antes** de que el log salga del sistema.
3.  **No detener la aplicación:** El pipeline de procesamiento está diseñado para ser a prueba de fallas: neutraliza referencias circulares, limita la profundidad y usa un addon nativo en **Rust** de alto rendimiento para que grabar un log nunca bloquee el bucle de eventos de Node.js.

---

## Conceptos Clave

| Concepto | Qué hace |
| :--- | :--- |
| **Addon Nativo (Rust)** | Un módulo en Rust (opcional pero recomendado) que procesa los logs a máxima velocidad (serialización, enmascaramiento y sanitización). |
| **Logging Matrix** | Una configuración declarativa que define qué variables de contexto son visibles según el nivel del log (`debug`, `info`, `warn`, `error`). **Importante:** Solo se procesan y muestran aquellos campos o headers que hayas declarado en la configuración inicial del contexto. |
| **MaskingEngine** | Redacta en tiempo real campos sensibles basándose en reglas predefinidas o expresiones regulares. **Configuración:** Puedes habilitar reglas por defecto y/o definir tus propios patrones de texto (regex) a reemplazar. |
| **Universal Adapter** | Te permite enviar tus logs a cualquier base de datos u servicio (PostgreSQL, MongoDB, Elasticsearch) implementando una única función de guardado (`executor`), sin casarte con un proveedor específico. |

---

## Beneficios Principales

*   **Rendimiento Extremo:** Gracias al addon en Rust, el procesamiento visual de los logs es sumamente liviano para la CPU de Node.js.
*   **Cumplimiento Normativo Directo:** Facilita el cumplimiento de auditorías (SOX, GDPR, PCI-DSS) mediante niveles dedicados de `audit` y políticas de retención.
*   **Seguridad Activa:** Sanitiza strings para evitar ataques de *Log Injection*.
*   **Trazabilidad:** Gestiona automáticamente el `Correlation ID` y `Transaction ID` que viajan a lo largo de toda una petición o ciclo de vida.

---

*Para ver ejemplos de código y la lista completa de características, consulta [caracteristicas-y-ejemplos.md](./caracteristicas-y-ejemplos.md).*
