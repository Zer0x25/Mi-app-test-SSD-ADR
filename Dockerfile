# ==============================================================================
# Dockerfile Multi-Stage - Sistema Medidores
# ==============================================================================

# ------------------------------------------------------------------------------
# Etapa 1: Builder
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependencias para compilación
COPY package*.json ./
RUN npm ci

# Generar cliente tipado de Prisma
COPY prisma ./prisma
RUN npx prisma generate

# Compilar código TypeScript a JavaScript (dist/)
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ------------------------------------------------------------------------------
# Etapa 2: Runner (Producción Ligera)
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Dependencias mínimas del sistema: openssl para Prisma y wget para Healthcheck
RUN apk add --no-cache openssl wget

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL="file:/app/data/medidores.db"
ENV JWT_EXPIRES_IN="8h"
ENV LOG_LEVEL="info"

# Instalar dependencias estrictas de producción
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar esquema y generar cliente Prisma en la imagen productiva
COPY prisma ./prisma
RUN npx prisma generate

# Copiar artefactos de compilación y archivos estáticos
COPY --from=builder /app/dist ./dist
COPY public ./public
COPY docker-entrypoint.sh ./

# Configurar directorio de persistencia para SQLite y permisos del usuario node
RUN chmod +x docker-entrypoint.sh && \
    mkdir -p /app/data && \
    chown -R node:node /app

USER node

EXPOSE 3000

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/readyz || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
