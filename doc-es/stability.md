# Estabilidad y Compatibilidad

Este documento es el contrato que SyntropyLog asume desde **1.0** en adelante.
El objetivo es simple: tenés que poder actualizar dentro de una versión mayor y
que **no se rompa nada**.

## Versionado semántico

Seguimos [SemVer](https://semver.org/). Desde 1.0:

- **Patch** (`1.0.x`) — bugfixes, performance, cambios internos. Siempre seguro.
- **Minor** (`1.x.0`) — features nuevas y retrocompatibles. Siempre seguro.
- **Major** (`x.0.0`) — cambios que rompen. Con nota de migración documentada.

Un cambio "rompe" solo si afecta la **superficie pública** definida abajo.

## Qué es público (el contrato)

La superficie pública son exactamente los exports nombrados de los puntos de
entrada del paquete:

| Punto de entrada | Import |
|---|---|
| Core | `import { ... } from 'syntropylog'` |
| Toolkit de testing | `import { ... } from 'syntropylog/testing'` |
| Mock de test | `import { ... } from 'syntropylog/testing/mock'` |
| Módulo NestJS | `import { ... } from 'syntropylog/nestjs'` |

Esta superficie (**valores y tipos**) está blindada por tests automáticos
(`tests/index.test.ts` y `tests/public-api-surface.test.ts`). Cualquier alta o
baja rompe CI y se revisa como una decisión deliberada de semver — no puede
cambiar por accidente.

**Fuera del contrato:** imports profundos (`syntropylog/dist/...`, cualquier cosa
no listada arriba), los internos de las clases más allá de sus métodos
documentados, y los internos del addon nativo (ver abajo).

## Forma de la salida de log

El registro emitido es algo que parseás aguas abajo, así que su forma es parte
del contrato. Estos campos de nivel superior son **estables** y no se renombran
ni cambian de tipo sin un major:

| Campo | Tipo | Notas |
|---|---|---|
| `level` | string | uno de `audit`, `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `message` | string | el mensaje formateado |
| `timestamp` | string | ISO 8601 / RFC 3339 |
| `service` | string | nombre del logger/servicio |

Todo lo demás en el registro es **tu metadata estructurada**, pasada tal cual la
diste (luego del masking/sanitización). Solo agregamos campos de forma
retrocompatible.

## Addon nativo (Rust) — una optimización, no un contrato

El addon nativo acelera serialización + masking + sanitización. Es una
**optimización de performance, nunca un contrato de comportamiento**:

- Cuando el addon **no** está disponible para tu plataforma, SyntropyLog usa de
  forma transparente el **pipeline en JS puro**. La salida y el comportamiento
  son **idénticos** — solo un poco más lento.
- El conjunto de plataformas con binario precompilado puede crecer en releases
  **minor** (más velocidad, sin cambio de comportamiento) y por lo tanto **no**
  está cubierto por SemVer.

### Matriz de plataformas precompiladas

| Plataforma | Arq | Precompilado | Si no |
|---|---|:---:|---|
| Linux (glibc) | x64 | ✅ | — |
| Linux (glibc) | **arm64 (Graviton, etc.)** | ✅ ¹ | fallback JS |
| Linux (**musl / Alpine**) | x64 | ✅ ¹ | fallback JS |
| Linux (**musl / Alpine**) | arm64 | ✅ ¹ | fallback JS |
| Windows (MSVC) | x64 | ✅ | — |
| macOS | arm64 (Apple Silicon) | ✅ | — |
| macOS | x64 (Intel) | ✅ ¹ | fallback JS |
| Windows | arm64 | ⬜ | fallback JS |

> ¹ Cross-compilado en CI (vía zig) y shippeado a partir de **v1.0.0**. En
> versiones anteriores (rc) estas plataformas usan el path JS.
>
> En cualquier plataforma ⬜ igual obtenés **comportamiento correcto por el path
> JS** — solo sin el acelerón nativo.

Para chequear en runtime por qué path vas:

```ts
import { syntropyLog } from 'syntropylog';
// true cuando el addon nativo está activo en este proceso
syntropyLog.isNativeAddonInUse();
```

Para forzar el path JS (ej. para comparar, o descartar el addon mientras
debuggeás):

```bash
SYNTROPYLOG_NATIVE_DISABLE=1 node tu-app.js
```

## Soporte de runtime

- **Node.js** `>= 20`.
