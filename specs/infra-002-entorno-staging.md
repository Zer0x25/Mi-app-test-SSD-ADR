# Spec: Entorno Staging & Pre-Producción Contenerizado (infra-002)

> **Instrucción para el Agente:** Este documento es un contrato cerrado de infraestructura. Sigue los criterios de aceptación y los archivos autorizados sin desviar el alcance.

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Declarar e implementar formalmente el entorno **Staging (Pre-producción / QA)** en Docker, con validación de entorno en `src/core/config.ts`, volumen aislado, puerto diferenciado para convivencia en el mismo host y scripts en `package.json`.
- **Archivos editables autorizados:**
  - `src/core/config.ts`
  - `tests/core/config.test.ts`
  - `docker-compose.staging.yml`
  - `.env.staging.example`
  - `package.json`
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/modules/*`
  - `prisma/schema.prisma`
  - `tests/modules/*`

---

## 2. Criterios de Aceptación

### CA-1: Soporte de Entorno Staging en Esquema Zod
- `src/core/config.ts` debe admitir el valor `"staging"` en el enum de `NODE_ENV`:
  `NODE_ENV: z.enum(["development", "test", "staging", "production"])`
- Debe exportar `envSchema` para verificación de pruebas unitarias.
- `tests/core/config.test.ts` debe contar con un test que verifique la aceptación de `NODE_ENV="staging"`.

### CA-2: Archivo de Configuración de Entorno `.env.staging.example`
- Debe documentar las variables requeridas para Staging:
  - `NODE_ENV=staging`
  - `PORT=3000` (interno del contenedor)
  - `STAGING_HOST_PORT=3001` (puerto expuesto en el host)
  - `DATABASE_URL=file:/app/data/medidores-staging.db`
  - `LOG_LEVEL=debug`

### CA-3: Orquestación Aislada con `docker-compose.staging.yml`
- Debe utilizar la misma imagen/build del `Dockerfile` multi-stage.
- Nombre de contenedor: `sistema-medidores-staging`.
- Debe mapear el puerto de host `${STAGING_HOST_PORT:-3001}:3000`.
- Debe montar un volumen independiente con nombre: `medidores_staging_data:/app/data`.
- Debe inyectar `NODE_ENV=staging`, `LOG_LEVEL=debug` y `DATABASE_URL=file:/app/data/medidores-staging.db`.
- Healthcheck activo contra `http://localhost:3000/api/health`.

### CA-4: Scripts de Operación en `package.json`
- Debe incluir comandos:
  - `"staging:up": "docker compose -f docker-compose.staging.yml up -d --build"`
  - `"staging:down": "docker compose -f docker-compose.staging.yml down"`

### CA-5: Barrera Determinista Intacta
- Ejecución exitosa de `./scripts/verify.sh` con salida 0 (100% pruebas pasando).
