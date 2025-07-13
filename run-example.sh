#!/bin/bash

# Este script automatiza la verificación de un ejemplo de SyntropyLog.
# Sale inmediatamente si un comando falla.
set -e

# --- Validación de Argumentos ---
if [ -z "$1" ]; then
  echo "Error: Debes proporcionar la ruta relativa al ejemplo (desde la raíz)."
  echo "Uso: $0 examples/01-hello-world"
  exit 1
fi

EXAMPLE_DIR=$1

# --- Configuración del Entorno ---
echo "--- Iniciando verificación para el ejemplo: $EXAMPLE_DIR ---"
echo "-> Configurando NVM para usar la versión de Node.js correcta..."
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Asegurarse de que el script se ejecuta desde la raíz del proyecto
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
  echo "Error: Este script debe ejecutarse desde el directorio raíz del proyecto beaconlog-v2."
  exit 1
fi

# --- Ejecución de Pasos para el Ejemplo ---
echo "-> Navegando al directorio del ejemplo: $EXAMPLE_DIR"
cd "$EXAMPLE_DIR"

echo "-> Limpiando artefactos previos e instalando dependencias del ejemplo..."
rm -rf node_modules package-lock.json dist
npm install

echo "-> Compilando el ejemplo con TypeScript..."
npm run build

echo "-> Ejecutando el ejemplo..."
npm start

echo "--- Verificación completada exitosamente para: $EXAMPLE_DIR ---" 