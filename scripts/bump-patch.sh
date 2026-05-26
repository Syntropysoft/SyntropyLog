#!/bin/bash

# Script para incrementar la versión de parche automáticamente
# Uso: ./scripts/bump-patch.sh

set -e

echo "🔄 Incrementando versión de parche..."

# Obtener la versión actual
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "📦 Versión actual: $CURRENT_VERSION"

# Incrementar versión de parche
NEW_VERSION=$(npm version patch --no-git-tag-version)
echo "🚀 Nueva versión: $NEW_VERSION"

# Reconstruir el paquete
echo "🔨 Reconstruyendo paquete..."
npm run build

echo "✅ Versión incrementada y paquete reconstruido: $NEW_VERSION"
echo "💡 Recuerda ejecutar 'npm link' en el directorio de ejemplos para usar la nueva versión" 