#!/bin/bash

# Script para publicar versiones alpha del proyecto principal SyntropyLog
# Uso: ./scripts/release-alpha.sh [patch|minor|major]

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para mostrar mensajes con colores
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Verificar argumentos
if [ $# -eq 0 ]; then
    log_error "Debes especificar el tipo de versión: patch, minor, o major"
    echo "Uso: $0 [patch|minor|major]"
    echo ""
    echo "Ejemplos:"
    echo "  $0 patch    # 0.5.11 -> 0.5.12-alpha.1"
    echo "  $0 minor    # 0.5.11 -> 0.6.0-alpha.1"
    echo "  $0 major    # 0.5.11 -> 1.0.0-alpha.1"
    exit 1
fi

VERSION_TYPE=$1

# Validar tipo de versión
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    log_error "Tipo de versión inválido: $VERSION_TYPE"
    echo "Tipos válidos: patch, minor, major"
    exit 1
fi

log_info "🚀 Iniciando release ALPHA de SyntropyLog..."

# Obtener versión actual
CURRENT_VERSION=$(node -p "require('./package.json').version")
log_info "📦 Versión actual: $CURRENT_VERSION"

# Verificar que no hay cambios sin commitear
if [ -n "$(git status --porcelain)" ]; then
    log_warning "Hay cambios sin commitear. Asegúrate de hacer commit antes del release."
    read -p "¿Continuar de todas formas? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Release cancelado."
        exit 1
    fi
fi

# Ejecutar tests
log_info "🧪 Ejecutando tests..."
npm test
log_success "Tests pasaron exitosamente"

# Ejecutar tests de integración
log_info "🔗 Ejecutando tests de integración..."
npm run test:integration
log_success "Tests de integración pasaron exitosamente"

# Ejecutar linting
log_info "🔍 Ejecutando linting..."
npm run lint
log_success "Linting completado"

# Incrementar versión según el tipo especificado
log_info "📈 Incrementando versión ($VERSION_TYPE)..."
INTERMEDIATE_VERSION=$(npm version $VERSION_TYPE --no-git-tag-version)
log_info "Versión intermedia: $INTERMEDIATE_VERSION"

# Convertir a versión alpha
log_info "🔄 Convirtiendo a versión alpha..."
NEW_VERSION=$(npm version prerelease --preid=alpha --no-git-tag-version)
log_success "Nueva versión final: $NEW_VERSION"

# Reconstruir el paquete
log_info "🔨 Reconstruyendo paquete..."
npm run build
log_success "Build completado"

# Verificar que el build fue exitoso
if [ ! -d "dist" ]; then
    log_error "El directorio dist no existe después del build"
    exit 1
fi

# Verificar archivos principales
REQUIRED_FILES=("dist/index.mjs" "dist/index.cjs" "dist/index.d.ts" "dist/http/index.mjs" "dist/http/index.cjs" "dist/http/index.d.ts")
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        log_error "Archivo requerido no encontrado: $file"
        exit 1
    fi
done
log_success "Todos los archivos de build están presentes"

# Dry run de publicación
log_info "📦 Haciendo dry run de publicación..."
npm pack
log_success "Dry run completado - el paquete está listo para publicación"

# Advertencia importante sobre versión alpha
log_warning "⚠️  ⚠️  ⚠️  PUBLICANDO VERSIÓN ALPHA ⚠️  ⚠️  ⚠️"
log_warning "Esta versión NO es estable y puede tener APIs cambiantes"
log_warning "Los usuarios deben usar esta versión solo para testing"
log_warning "NO usar en producción"

# Preguntar si publicar
log_warning "¿Publicar versión ALPHA $NEW_VERSION en npm?"
log_info "Tipo de versión: $VERSION_TYPE"
log_info "Versión anterior: $CURRENT_VERSION"
log_info "Versión nueva: $NEW_VERSION"
read -p "¿Continuar con la publicación? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "🚀 Publicando versión ALPHA en npm..."
    npm publish --tag alpha
    log_success "¡Versión ALPHA publicada exitosamente en npm!"
    
    # Crear tag de git
    log_info "🏷️  Creando tag de git..."
    git add package.json
    git commit -m "chore: bump version to $NEW_VERSION (alpha)"
    git tag "v$NEW_VERSION"
    log_success "Tag creado: v$NEW_VERSION"
    
    log_success "🎉 Release ALPHA completado exitosamente!"
    log_info "📦 Versión $NEW_VERSION publicada en npm con tag 'alpha'"
    log_info "🏷️  Tag git: v$NEW_VERSION"
    log_info "📈 Progreso: $CURRENT_VERSION → $INTERMEDIATE_VERSION → $NEW_VERSION"
    log_warning "⚠️  Recuerda: Esta es una versión ALPHA - APIs pueden cambiar"
    log_info "🔄 Para publicar versión estable: npm version $VERSION_TYPE && npm publish"
else
    log_warning "Publicación cancelada. El paquete está construido pero no publicado."
    log_info "Para publicar manualmente: npm publish --tag alpha"
fi 