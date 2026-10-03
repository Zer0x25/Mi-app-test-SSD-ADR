#!/usr/bin/env sh
set -e

echo "🚀 [Docker Entrypoint] Inicializando Sistema Medidores..."

# Asegurar existencia del directorio de datos SQLite si aplica
if [ -n "$DATABASE_URL" ]; then
  # Si DATABASE_URL es de tipo file:/app/data/... asegurar creación de la carpeta
  DB_FILE=$(echo "$DATABASE_URL" | sed 's|^file:||')
  DB_DIR=$(dirname "$DB_FILE")
  if [ -n "$DB_DIR" ] && [ "$DB_DIR" != "." ]; then
    mkdir -p "$DB_DIR" 2>/dev/null || true
  fi

  echo "📦 [Docker Entrypoint] Sincronizando esquema de base de datos..."
  npx prisma db push --skip-generate
fi

echo "✅ [Docker Entrypoint] Base de datos lista. Iniciando aplicación..."
exec "$@"
