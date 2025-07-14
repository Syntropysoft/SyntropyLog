# SyntropyLog Doctor: Su Guardián de Configuración

Este ejemplo demuestra el uso de `syntropylog doctor`, una potente herramienta de línea de comandos (CLI) para auditar, validar y asegurar sus archivos de configuración de SyntropyLog.

## ¿Qué es el Doctor y por qué usarlo?

El "Doctor" es una herramienta de análisis estático diseñada para examinar sus archivos de configuración (`syntropylog.config.js`, `.yml`, etc.) y detectar problemas comunes, malas prácticas y vulnerabilidades de seguridad *antes* de que lleguen a producción.

Es su guardián automatizado para:
- **Prevenir Errores de Despliegue**: Atrapa errores críticos como un array de `transports` vacío o una configuración de Redis Sentinel incorrecta.
- **Reforzar la Seguridad**: Advierte si no se han configurado reglas de enmascaramiento de datos (`masking`), ayudando a prevenir la fuga de información sensible.
- **Garantizar la Preparación para Producción**: Alerta sobre niveles de log demasiado verbosos (`debug`, `trace`) en un entorno de `production`.
- **Mantener la Consistencia**: Detecta nombres de instancia duplicados que pueden llevar a comportamientos ambiguos.
- **Imponer Estándares de Equipo**: Es totalmente extensible, permitiendo a los equipos de DevOps o Plataforma crear reglas personalizadas para hacer cumplir sus propias políticas de configuración.

Está diseñado para ser un paso crucial en su pipeline de CI/CD, actuando como un control de calidad automatizado.

## Cómo Funciona

El proceso del Doctor es simple y robusto:
1.  **Cargar**: Encuentra y carga su archivo de configuración.
2.  **Validar**: Comprueba que la estructura del archivo sea compatible con el esquema oficial de SyntropyLog.
3.  **Verificar**: Ejecuta un conjunto de reglas de diagnóstico (tanto las "core" como las personalizadas) contra su configuración.
4.  **Reportar**: Imprime un informe claro y conciso en la consola, detallando cada hallazgo, su nivel de severidad (ERROR, WARN, INFO) y una recomendación para solucionarlo.

---

## Modos de Uso

### 1. Para Desarrolladores (en un entorno de proyecto)

Durante el desarrollo, puede ejecutar el doctor fácilmente a través de `npx` o un script de `npm`.

1.  Navegue a este directorio:
    ```sh
    cd examples/110-diagnostics-doctor
    ```

2.  Instale las dependencias (que incluyen `syntropylog`):
    ```sh
    npm install
    ```

3.  Ejecute el script de verificación. Simulamos un entorno de producción para activar todas las reglas:
    ```sh
    NODE_ENV=production npm run check
    ```
    El script `check` en `package.json` simplemente ejecuta `syntropylog doctor`.

Verá un informe detallado de todos los problemas encontrados en el archivo `syntropylog.config.js` de este ejemplo.

---

## Estrategias de Distribución para Entornos Corporativos

El `doctor` está diseñado para una integración flexible en flujos de trabajo de DevOps. Aquí se presentan dos estrategias principales para su distribución en entornos controlados, garantizando la seguridad y el cumplimiento normativo.

### Estrategia A: Binario Autoejecutable (para Entornos sin Acceso a Node.js)

Esta estrategia es ideal para los entornos más restrictivos, donde ni siquiera `Node.js` o `npm` están disponibles en las máquinas de CI/CD.

**El verdadero poder del `doctor` es que puede ser empaquetado como un binario autoejecutable e independiente.** Esto permite a los equipos de DevOps y seguridad ejecutar auditorías en cualquier entorno (incluyendo aquellos sin acceso a `npm` o `Node.js` instalados, como es común en instituciones financieras).

##### Creando el Binario

Puede utilizar herramientas como [`pkg`](https://github.com/vercel/pkg) para crear el ejecutable. Primero, necesitaría un pequeño archivo de entrada que lance el CLI.

**`build-doctor.js`**
```javascript
#!/usr/bin/env node
// Este archivo es el punto de entrada para el binario
require('syntropylog/cli'); 
```

Luego, podría añadir un script a su `package.json` para construir los binarios:
```json
"scripts": {
  "package-doctor": "pkg build-doctor.js --targets node18-linux-x64,node18-macos-x64,node18-win-x64 -o syntropylog-doctor"
}
```

##### Ejecutando el Binario

Una vez construido, un equipo de DevOps puede simplemente descargar el binario `syntropylog-doctor` y ejecutarlo contra cualquier archivo de configuración:

```sh
# Ejecutar el doctor contra un archivo de configuración específico
./syntropylog-doctor doctor --config /path/to/your/project/syntropylog.config.yml

# La salida será idéntica a la ejecución a través de npm
```

### Estrategia B: Paquete NPM Privado y Hermético (Método Recomendado)

Este es el método **recomendado y más seguro** para organizaciones que utilizan un registro privado de NPM (como Nexus, JFrog Artifactory, GitHub Packages, etc.).

En una futura versión, el CLI se distribuirá como un paquete dedicado: **`@syntropylog/cli`**.

La ventaja fundamental de este enfoque es la **Instalación de Cero Dependencias**. El paquete publicado no es código fuente con una lista de dependencias que deben descargarse de internet. En su lugar, utilizamos un empaquetador (`bundler`) para crear un **único archivo JavaScript auto-contenido**.

Esto significa que:
- **La Superficie de Ataque es Mínima**: No hay dependencias transitivas que puedan ocultar vulnerabilidades. Lo que se audita es lo que se ejecuta.
- **Funciona Offline**: El servidor de CI/CD no necesita acceso a internet para instalar el paquete, ya que todo está incluido.
- **Auditoría Sencilla**: El equipo de seguridad puede analizar un único y limpio artefacto de software.

#### Flujo de Trabajo para la Adopción Segura

El proceso de adopción por parte de una entidad financiera seguiría estos tres pasos:

1.  **Ingestión y Auditoría**:
    - El equipo de seguridad de la organización descarga el artefacto oficial `syntropylog-cli-X.Y.Z.tgz` desde el registro público de NPM.
    - Realizan su proceso de auditoría de seguridad sobre este único archivo.

2.  **Publicación en el Repositorio Interno**:
    - Una vez aprobado, el artefacto `.tgz` se sube al registro privado de la compañía (Nexus, Artifactory, etc.).
    - A partir de este momento, `@syntropylog/cli` está disponible para todos los equipos internos, servido de forma segura desde la propia infraestructura de la empresa.

3.  **Uso en Pipelines de CI/CD**:
    - Los pipelines de CI/CD pueden ahora invocar el `doctor` de forma segura, sabiendo que se está descargando desde el registro interno verificado.
    ```sh
    # Este comando instala y ejecuta el CLI desde el Nexus interno.
    # No se realiza ninguna llamada a la red externa.
    npx @syntropylog/cli doctor --config /path/to/project/syntropylog.config.yml
    ```

Esta aproximación simplifica la gestión de versiones, se alinea con las mejores prácticas de DevSecOps y se integra de forma nativa en los ecosistemas de desarrollo corporativos.

---

## Extendiendo el Doctor con Reglas Personalizadas

El `doctor` no se limita a las comprobaciones incorporadas. Puede extenderlo fácilmente con sus propias reglas creando un archivo `syntropylog.doctor.js` en la raíz de su proyecto.

Este ejemplo incluye uno: `syntropylog.doctor.js`.

**Anatomía de una Regla Personalizada:**

```javascript
{
  // Un ID único para su regla
  id: 'custom-check-for-http-clients',
  // Descripción de lo que hace la regla
  description: 'Ensures that at least one HTTP client is configured.',
  /**
   * La función de lógica. Recibe la configuración validada.
   * Devuelve un array de hallazgos. Si no hay problemas, devuelve [].
   */
  check: (config) => {
    if (!config.http?.instances || config.http.instances.length === 0) {
      return [
        {
          level: 'WARN', // Puede ser ERROR, WARN, o INFO
          title: 'No HTTP Clients Configured',
          message: 'The configuration does not define any instrumented HTTP clients.',
          recommendation: 'If this service communicates with other APIs, add an HTTP client instance.'
        },
      ];
    }
    return [];
  },
}
```

### Reglas Sensibles al Entorno: Adaptando la Auditoría a `development`, `staging` y `production`

No todas las reglas de configuración son universales. Una configuración que es válida y segura para `development` podría ser una vulnerabilidad en `production`. El `doctor` aborda esto haciendo que sus reglas sean **conscientes del entorno**.

La función `check` de cada regla recibe un segundo argumento, un objeto de contexto que contiene el entorno actual (leído desde `process.env.NODE_ENV` o `'development'` por defecto).

Esto le permite crear reglas de cumplimiento increíblemente potentes.

**Ejemplo: Prohibir Credenciales en Producción**

Imagine que quiere permitir contraseñas en `development` pero prohibirlas estrictamente en `production`. Su regla se vería así:

```javascript
{
  id: 'no-credentials-in-production',
  description: 'Ensures no sensitive credentials are hardcoded in production configurations.',
  /**
   * @param {import('syntropylog').SyntropyLogConfig} config
   * @param {{ env: string }} context - El contexto del entorno actual.
   * @returns {import('syntropylog/doctor').CheckResult[]}
   */
  check: (config, context) => {
    // La regla SOLO se aplica en el entorno de producción.
    if (context.env !== 'production') {
      return []; // No hacer nada en otros entornos.
    }

    const findings = [];
    config.redis?.instances?.forEach((instance) => {
      if (instance.password || instance.username) {
        findings.push({
          level: 'ERROR',
          title: 'Credenciales en Configuración de Producción',
          message: `La instancia de Redis "${instance.instanceName}" contiene credenciales.`,
          recommendation: 'En producción, las credenciales deben ser inyectadas en runtime a través de secretos o variables de entorno seguras, no guardadas en el archivo de configuración.'
        });
      }
    });
    return findings;
  },
}
```
Al ejecutar `NODE_ENV=production npm run check`, esta regla fallaría con un error. Al ejecutarlo sin `NODE_ENV` (o con `NODE_ENV=development`), la regla se saltaría la comprobación y pasaría silenciosamente.

En su archivo `syntropylog.doctor.js`, simplemente exporta un array que combine las reglas del core con las suyas:

```javascript
const { coreRules } = require('syntropylog/doctor');
const myCustomRules = [ /* ... tus reglas aquí ... */ ];

module.exports = [...coreRules, ...myCustomRules];
```

El `doctor` cargará automáticamente este manifiesto si lo encuentra, convirtiéndolo en una herramienta de auditoría increíblemente flexible y potente.