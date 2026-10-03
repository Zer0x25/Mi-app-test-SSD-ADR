# ADR 0003: Empaquetamiento Docker Multi-Stage, Persistencia SQLite y Pipeline CI/CD

- **Fecha:** 2026-10-03
- **Estado:** Aceptado
- **Afecta a:** Infraestructura, Docker, GitHub Actions, Despliegue y Scripts de Build

---

## 1. Contexto y Problema

Habiendo alcanzado la madurez funcional de dominio (Hitos 0 al 5 con 9 módulos implementados, 125 pruebas automatizadas y frontend web consolidado), el sistema **Medidores** requiere una estrategia estandarizada y determinista de empaquetamiento para despliegues locales, servidores y entornos cloud.

Desafíos clave identificados:
1. **Persistencia de SQLite en Contenedores:** SQLite almacena los datos en un archivo local. Si el contenedor se recrea sin un volumen persistente formalmente definido, los datos históricos de mediciones y auditoría se pierden irrevocablemente.
2. **Dependencias Nativas de Prisma Engine:** El motor de Prisma requiere binarios compilados y soporte de OpenSSL. Las imágenes minimalistas (como Alpine) requieren configuración explícita para evitar fallos en tiempo de ejecución.
3. **Eficiencia y Seguridad en Producción:** La imagen de producción no debe contener herramientas de compilación (`tsc`, `devDependencies`, código fuente TypeScript sin compilar), reduciendo la superficie de ataque y el tamaño final.
4. **Verificación Continua en Repositorio (CI):** El Quality Gate determinista (`./scripts/verify.sh`) debe ejecutarse de forma mandatoria en GitHub Actions en cada Pull Request y Push, complementado con la verificación de compilación del artefacto Docker.

---

## 2. Decisión

Se aprueba la arquitectura de infraestructura y despliegue basada en los siguientes lineamientos:

### 2.1. Imagen Docker Multi-Stage (`Dockerfile`)
Se define una construcción en dos etapas sobre `node:20-alpine`:

1. **Etapa `builder`:**
   - Instala todas las dependencias (`npm ci`).
   - Genera el cliente tipado de Prisma (`npx prisma generate`).
   - Compila el código TypeScript a JavaScript puro con `tsconfig.build.json` hacia el directorio `dist/`.

2. **Etapa `runner` (Producción Minimalista):**
   - Instala únicamente dependencias de producción (`npm ci --omit=dev`).
   - Incluye librerías mínimas del sistema (`openssl`, `wget` para healthcheck).
   - Copia los artefactos compilados (`dist/`), archivos estáticos web (`public/`), el esquema Prisma (`prisma/`) y el cliente Prisma generado.
   - Configura el usuario sin privilegios `USER node` para máxima seguridad.
   - Expone el puerto `3000` con healthcheck activo contra `GET /api/health`.

### 2.2. Contrato de Persistencia de Datos para SQLite
- La base de datos SQLite de producción se alojará en la ruta `/app/data/medidores.db`.
- Se declara explícitamente el volumen `/app/data` en la imagen Docker.
- Se implementa un script de entrada `docker-entrypoint.sh` que asegura la sincronización del esquema (`npx prisma db push --skip-generate`) en arranques iniciales antes de delegar la ejecución a Node.js.

### 2.3. Despliegue Unificado con `docker-compose.yml`
- Servicio principal `app` configurado con reinicio automático (`restart: unless-stopped`).
- Volumen nombrado `medidores_data` mapeado a `/app/data` para garantizar persistencia entre ciclos de vida del contenedor.
- Integración de Healthcheck de Docker con reintentos y período de gracia.

### 2.4. CI/CD Automatizado en GitHub Actions
- El workflow `.github/workflows/verify.yml` ejecuta `./scripts/verify.sh` como primera barrera (typecheck, linter y tests con 100% éxito).
- Se agrega el paso de validación del artefacto Docker (`docker build -t medidores:ci-test .`) para asegurar que ningún cambio de dependencias o rutas rompa el empaquetado final.

---

## 3. Consecuencias

### Positivas
- Despliegue inmediato en cualquier servidor con un solo comando: `docker compose up -d`.
- Cero degradación de datos: el volumen garantiza persistencia integral de SQLite.
- Imagen ultra ligera (~150-180 MB) libre de código de pruebas y herramientas de desarrollo.
- CI/CD previene regresiones tanto a nivel de código de dominio como a nivel de empaquetado.

### Negativas / Trade-offs
- Se requiere mantener sincronizado `tsconfig.build.json` con cualquier nueva configuración de compilación.
