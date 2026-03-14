# Compilar el addon nativo (Rust)

SyntropyLog puede usar un **addon nativo en Rust** opcional (`syntropylog-native`) para serialización y enmascarado más rápidos. Este documento describe cómo compilar el addon en **macOS**, **Windows** y **Linux**.

## Requisitos previos

- **Node.js** ≥ 18 (se recomienda ≥ 20; el paquete principal usa 20)
- **pnpm** (instalar con `npm install -g pnpm` o ver [pnpm.io](https://pnpm.io))
- **Rust** (instalar con [rustup](https://rustup.rs))

---

## macOS

### 1. Instalar Xcode Command Line Tools (si no los tienes)

```bash
xcode-select --install
```

### 2. Instalar Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Sigue las indicaciones y luego reinicia la terminal o ejecuta:

```bash
source "$HOME/.cargo/env"
```

### 3. Instalar dependencias y compilar el addon

Desde la **raíz del repositorio**:

```bash
pnpm install
cd syntropylog-native && pnpm run build
```

O en una sola línea:

```bash
pnpm install && cd syntropylog-native && pnpm run build
```

### 4. Verificar

```bash
cd syntropylog-native && node test-node.mjs
```

Deberías ver: `OK syntropylog-native: pong`.

**Plataformas soportadas:** `x86_64-apple-darwin`, `aarch64-apple-darwin` (Apple Silicon). La compilación genera un único `.node` para tu plataforma (p. ej. `syntropylog_native.darwin-arm64.node`).

---

## Windows

### 1. Instalar Visual Studio Build Tools (para MSVC)

El addon usa la herramienta **MSVC** en Windows. Instala una de estas opciones:

- **Visual Studio 2022** (o posterior) con la carga de trabajo **“Desarrollo para el escritorio con C++”**, o  
- **Build Tools para Visual Studio** con la carga de trabajo **“Desarrollo para el escritorio con C++”**  

Descarga: [Descargas de Visual Studio](https://visualstudio.microsoft.com/downloads/) → Build Tools para Visual Studio.

### 2. Instalar Rust

1. Descarga y ejecuta **rustup-init.exe**:
   - 64 bits: https://win.rustup.rs/x86_64  
   - ARM64: https://win.rustup.rs/aarch64  

2. Sigue el asistente. Cuando pregunte, mantén la herramienta **stable** por defecto y el target **x86_64-pc-windows-msvc** (o **aarch64-pc-windows-msvc** en ARM).

3. Reinicia la terminal (o abre una nueva **Developer Command Prompt** / **Símbolo del sistema para desarrolladores x64** si la usas).

### 3. Instalar dependencias y compilar el addon

Desde la **raíz del repositorio** (en PowerShell o Símbolo del sistema):

```powershell
pnpm install
cd syntropylog-native
pnpm run build
```

O en una línea (PowerShell):

```powershell
pnpm install; cd syntropylog-native; pnpm run build
```

### 4. Verificar

```powershell
cd syntropylog-native
node test-node.mjs
```

Deberías ver: `OK syntropylog-native: pong`.

**Plataformas soportadas:** `x86_64-pc-windows-msvc`, `aarch64-pc-windows-msvc`. La compilación genera un `.node` para tu plataforma (p. ej. `syntropylog_native.win32-x64-msvc.node`).

---

## Linux

### 1. Instalar herramientas de compilación

**Debian / Ubuntu:**

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config
```

**Fedora / RHEL:**

```bash
sudo dnf groupinstall "Development Tools"
# o
sudo yum groupinstall "Development Tools"
```

**Alpine:**

```bash
apk add build-base
```

### 2. Instalar Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Sigue las indicaciones y luego:

```bash
source "$HOME/.cargo/env"
```

### 3. Instalar dependencias y compilar el addon

Desde la **raíz del repositorio**:

```bash
pnpm install
cd syntropylog-native && pnpm run build
```

O en una línea:

```bash
pnpm install && cd syntropylog-native && pnpm run build
```

### 4. Verificar

```bash
cd syntropylog-native && node test-node.mjs
```

Deberías ver: `OK syntropylog-native: pong`.

**Plataformas soportadas:** varios triples `linux-*-gnu` y `linux-*-musl` (p. ej. `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`). La compilación genera un `.node` para tu plataforma actual.

---

## Opciones de compilación

| Comando              | Descripción |
|----------------------|-------------|
| `pnpm run build`     | Compilación en **release** para la **plataforma actual** (recomendado para desarrollo y benchmarks). |
| `pnpm exec napi build --platform --release` | Igual que arriba (explícito). |
| `pnpm run build:debug` | Compilación en modo debug (sin optimizaciones, útil para depurar). |

Para compilar para **varias plataformas** (p. ej. en CI), se usa el workflow en [../.github/workflows/build-native.yml](../.github/workflows/build-native.yml); el job de merge genera un artefacto con todos los `.node`.

---

## Usar el addon después de compilar

- Desde la **raíz del repo**, ejecuta los benchmarks: `pnpm bench`. Deberías ver: `SyntropyLog native addon (Rust): yes`.
- La librería principal resuelve `syntropylog-native` desde el workspace; una vez que el archivo `.node` está en `syntropylog-native/`, se cargará solo al ejecutar la app o los benchmarks desde este repo.

Si sigue apareciendo `SyntropyLog native addon (Rust): no`, comprueba que hayas ejecutado `pnpm run build` dentro de `syntropylog-native/` y que exista el archivo `*.node` correspondiente en esa carpeta.

---

## Publicar / empaquetar en local

Para compilar el addon y luego empaquetar el **paquete principal** (con el addon incluido) para instalarlo en otro proyecto en tu máquina:

1. **Compilar el addon** (desde la raíz del repo):
   ```bash
   cd syntropylog-native && pnpm run build
   ```
   O de forma explícita: `pnpm exec napi build --platform --release`.

2. **Empaquetar el paquete principal** (desde la raíz del repo):
   ```bash
   pnpm pack
   ```
   Se genera un `.tgz` (ej. `syntropylog-0.11.0.tgz`) que incluye `syntropylog-native` con el `.node` compilado para tu plataforma.

3. **Instalar en otro proyecto**: `pnpm add /ruta/a/syntropylog-0.11.0.tgz`

Si te saltas el paso 1, el tarball llevará lo que haya en `syntropylog-native/` (por ejemplo un binario viejo o ninguno).
