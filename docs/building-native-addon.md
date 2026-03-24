# Building the Native Addon (Rust)

SyntropyLog can use an optional **Rust native addon** (`syntropylog-native`) for faster serialization and masking. This document describes how to build the addon on **macOS**, **Windows**, and **Linux**.

## Prerequisites

- **Node.js** ≥ 18 (≥ 20 recommended; the main package uses 20)
- **pnpm** (install with `npm install -g pnpm` or see [pnpm.io](https://pnpm.io))
- **Rust** (install with [rustup](https://rustup.rs))

---

## macOS

### 1. Install Xcode Command Line Tools (if not already installed)

```bash
xcode-select --install
```

### 2. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Follow the prompts, then restart your terminal or run:

```bash
source "$HOME/.cargo/env"
```

### 3. Install dependencies and build the addon

From the **repo root**:

```bash
pnpm install
cd syntropylog-native && pnpm run build
```

Or in a single line:

```bash
pnpm install && cd syntropylog-native && pnpm run build
```

### 4. Verify

```bash
cd syntropylog-native && node test-node.mjs
```

You should see: `OK syntropylog-native: pong`.

**Supported platforms:** `x86_64-apple-darwin`, `aarch64-apple-darwin` (Apple Silicon). The build produces a single `.node` for your platform (e.g. `syntropylog_native.darwin-arm64.node`).

---

## Windows

### 1. Install Visual Studio Build Tools (for MSVC)

The addon uses the **MSVC** toolchain on Windows. Install one of:

- **Visual Studio 2022** (or later) with the **"Desktop development with C++"** workload, or
- **Build Tools for Visual Studio** with the **"Desktop development with C++"** workload

Download: [Visual Studio Downloads](https://visualstudio.microsoft.com/downloads/) → Build Tools for Visual Studio.

### 2. Install Rust

1. Download and run **rustup-init.exe**:
   - 64-bit: https://win.rustup.rs/x86_64
   - ARM64: https://win.rustup.rs/aarch64

2. Follow the wizard. When prompted, keep the **stable** toolchain default and the **x86_64-pc-windows-msvc** target (or **aarch64-pc-windows-msvc** on ARM).

3. Restart your terminal (or open a new **Developer Command Prompt / x64 Native Tools Command Prompt** if using one).

### 3. Install dependencies and build the addon

From the **repo root** (in PowerShell or Command Prompt):

```powershell
pnpm install
cd syntropylog-native
pnpm run build
```

Or in one line (PowerShell):

```powershell
pnpm install; cd syntropylog-native; pnpm run build
```

### 4. Verify

```powershell
cd syntropylog-native
node test-node.mjs
```

You should see: `OK syntropylog-native: pong`.

**Supported platforms:** `x86_64-pc-windows-msvc`, `aarch64-pc-windows-msvc`. The build produces a `.node` for your platform (e.g. `syntropylog_native.win32-x64-msvc.node`).

---

## Linux

### 1. Install build tools

**Debian / Ubuntu:**

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config
```

**Fedora / RHEL:**

```bash
sudo dnf groupinstall "Development Tools"
# or
sudo yum groupinstall "Development Tools"
```

**Alpine:**

```bash
apk add build-base
```

### 2. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Follow the prompts, then:

```bash
source "$HOME/.cargo/env"
```

### 3. Install dependencies and build the addon

From the **repo root**:

```bash
pnpm install
cd syntropylog-native && pnpm run build
```

Or in one line:

```bash
pnpm install && cd syntropylog-native && pnpm run build
```

### 4. Verify

```bash
cd syntropylog-native && node test-node.mjs
```

You should see: `OK syntropylog-native: pong`.

**Supported platforms:** several `linux-*-gnu` and `linux-*-musl` triples (e.g. `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`). The build produces a `.node` for your current platform.

---

## Build Options

| Command | Description |
|---------|-------------|
| `pnpm run build` | **Release** build for the **current platform** (recommended for development and benchmarks). |
| `pnpm exec napi build --platform --release` | Same as above (explicit). |
| `pnpm run build:debug` | Debug build (no optimizations, useful for debugging). |

To build for **multiple platforms** (e.g. in CI), use the workflow at [../.github/workflows/build-native.yml](../.github/workflows/build-native.yml); the merge job produces an artifact with all `.node` files.

---

## Using the Addon After Building

- From the **repo root**, run benchmarks: `pnpm bench`. You should see: `SyntropyLog native addon (Rust): yes`.
- The main library resolves `syntropylog-native` from the workspace; once the `.node` file is in `syntropylog-native/`, it will load automatically when running the app or benchmarks from this repo.

If you still see `SyntropyLog native addon (Rust): no`, verify that you ran `pnpm run build` inside `syntropylog-native/` and that the corresponding `*.node` file exists in that folder.

---

## Publishing / Local Packaging

To build the addon and then package the **main package** (with the addon included) for installation in another project on your machine:

1. **Build the addon** (from repo root):
   ```bash
   cd syntropylog-native && pnpm run build
   ```
   Or explicitly: `pnpm exec napi build --platform --release`.

2. **Pack the main package** (from repo root):
   ```bash
   pnpm pack
   ```
   This generates a `.tgz` (e.g. `syntropylog-0.11.0.tgz`) that includes `syntropylog-native` with the `.node` compiled for your platform.

3. **Install in another project**: `pnpm add /path/to/syntropylog-0.11.0.tgz`

If you skip step 1, the tarball will contain whatever is already in `syntropylog-native/` (e.g. an old binary or none).
