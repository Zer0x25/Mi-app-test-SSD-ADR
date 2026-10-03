# Spec: Empaquetamiento Docker Multi-Stage & Pipeline CI/CD (infra-001)

> **Instrucción para el Agente:** Este documento es un contrato cerrado de infraestructura. Sigue los criterios de aceptación y los archivos autorizados sin desviar el alcance.

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Empaquetar el sistema Medidores en una imagen Docker multi-stage optimizada, proporcionar un archivo `docker-compose.yml` para despliegue productivo con persistencia de SQLite, y robustecer el pipeline de GitHub Actions para validar la construcción de la imagen.
- **Archivos editables autorizados:**
  - `Dockerfile`
  - `.dockerignore`
  - `docker-compose.yml`
  - `docker-entrypoint.sh`
  - `tsconfig.build.json`
  - `package.json`
  - `.github/workflows/verify.yml`
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/modules/*`
  - `src/core/*`
  - `prisma/schema.prisma`
  - `tests/*`

---

## 2. Criterios de Aceptación

### CA-1: Compilación de Producción Tipada
- Debe existir un archivo `tsconfig.build.json` que excluya el directorio `tests/` y compile el código de `src/` hacia `dist/`.
- Debe existir un script en `package.json`: `"build": "tsc -p tsconfig.build.json"`.
- La ejecución de `npm run build` debe generar los artefactos JavaScript ejecutables en `dist/` sin advertencias de tipos.

### CA-2: Dockerfile Multi-Stage Minimalista
- Debe estructurarse en 2 etapas: `builder` y `runner`.
- Imagen base: `node:20-alpine`.
- La etapa final `runner` debe:
  - Contener únicamente dependencias de producción (`npm ci --omit=dev`).
  - Incluir `openssl` y `wget` requeridos para Prisma y Healthchecks.
  - Ejecutarse bajo el usuario no-root `USER node`.
  - Exponer el puerto `3000`.
  - Definir un volumen persistente en `/app/data`.
  - Contener un `HEALTHCHECK` configurado apuntando a `GET /api/health`.

### CA-3: Punto de Entrada Determinista (`docker-entrypoint.sh`)
- Debe crear/asegurar los permisos del directorio `/app/data`.
- Debe sincronizar automáticamente el esquema de la base de datos SQLite antes de iniciar la aplicación (`npx prisma db push --skip-generate`).
- Debe delegar la ejecución final al comando principal mediante `exec "$@"`.

### CA-4: Despliegue con Docker Compose (`docker-compose.yml`)
- Debe definir el servicio `app` configurado para compilar desde el contexto local.
- Debe montar el volumen con nombre `medidores_data` en `/app/data`.
- Debe mapear el puerto de host al contenedor (`${PORT:-3000}:3000`).
- Debe configurar las variables de entorno `NODE_ENV=production`, `PORT=3000`, `DATABASE_URL=file:/app/data/medidores.db`.
- Debe incluir configuración de `healthcheck` y `restart: unless-stopped`.

### CA-5: Verificación Continua en GitHub Actions
- El workflow `.github/workflows/verify.yml` debe mantener el paso determinista `./scripts/verify.sh`.
- Debe incluir un paso subsiguiente que verifique la construcción exitosa de la imagen Docker (`docker build -t medidores:ci-test .`).

---

## 3. Invariantes Técnicas

1. **Persistencia Garantizada:** Queda prohibido almacenar la base de datos de producción dentro del sistema de archivos efímero del contenedor sin volumen montado.
2. **Seguridad no-root:** El proceso de Node.js en el contenedor debe correr obligatoriamente bajo el usuario `node`.
3. **Calidad Determinista Intacta:** `scripts/verify.sh` debe seguir retornando código de salida `0` sin degradaciones en `typecheck`, `lint` o `test`.
