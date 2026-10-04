# Spec: Expansión de Cobertura Anti-Regresión y Pruebas E2E Headless (test-002)

> **Instrucción para el Agente:** Este documento es un contrato cerrado para consolidar la robustez del sistema, blindando contra regresiones los módulos existentes y expandiendo la cobertura de pruebas sintéticas E2E en Playwright headless.

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** 
  1. Certificar el rebuild y despliegue del contenedor de Staging Docker.
  2. Implementar una suite exhaustiva de pruebas de anti-regresión y casos de borde en Vitest (`tests/core/antiregression-edgecases.test.ts`), cubriendo validaciones Zod estrictas, transacciones en lote mixtas (`batch-sync`), RBAC de respaldos atómicos y parámetros extremos.
  3. Vincular el botón de respaldo atómico en caliente en la UI de Auditoría (`#btnGenerarBackup`) y conectar con `POST /api/admin/backup`.
  4. Expandir la suite de pruebas E2E headless de Playwright cubriendo todos los módulos restantes:
     - `e2e/reportes-conciliacion.spec.ts` (Consumos netos, filtros por fecha/recurso y conciliación de facturas con discrepancias).
     - `e2e/mantenimiento-metrologico.spec.ts` (Bitácora técnica, registro de calibraciones periódicas y trazabilidad de precintos).
     - `e2e/usuarios-administracion.spec.ts` (Directorio administrativo de usuarios, cambio de roles y reseteo de claves).
     - `e2e/auditoria-backup.spec.ts` (Bitácora inmutable de eventos y ejecución de respaldo en caliente desde UI).
     - `e2e/pwa-offline-resiliencia.spec.ts` (Simulación de caída de red, encolado offline en `SyncManager` y sincronización resiliente).

- **Archivos editables autorizados:**
  - `specs/test-002-cobertura-antirregresion-y-e2e.md`
  - `tests/server.test.ts`
  - `tests/core/antiregression-edgecases.test.ts`
  - `public/index.html`
  - `public/js/api.js`
  - `public/app.js`
  - `e2e/reportes-conciliacion.spec.ts`
  - `e2e/mantenimiento-metrologico.spec.ts`
  - `e2e/usuarios-administracion.spec.ts`
  - `e2e/auditoria-backup.spec.ts`
  - `e2e/pwa-offline-resiliencia.spec.ts`
  - `package-lock.json`
  - `STATE.md`

- **Archivos protegidos (solo lectura):**
  - `src/core/config.ts`
  - `src/core/errors.ts`
  - `prisma/schema.prisma`
  - `Dockerfile`
  - `docker-compose.staging.yml`

---

## 2. Criterios de Aceptación (Definition of Done)

### CA-1: Suite de Anti-Regresión y Edge Cases en Vitest (`tests/core/antiregression-edgecases.test.ts`)
- **Validaciones Zod Estrictas:**
  - `GET /api/lecturas/recientes`: `limit` negativo (-5), superior a 1000 (1001) o no numérico ("invalid") debe rechazar con HTTP 400 Bad Request.
- **Invariantes de Dominio de Lecturas:**
  - Intento de registrar lectura para `medidorId` no existente retorna HTTP 404 `MedidorNoEncontradoError`.
  - Intento de registrar lectura decreciente retorna HTTP 400 `LecturaDecrecienteError`.
  - Intento de registrar lectura con valor negativo retorna HTTP 400 por validación Zod.
- **Sincronización en Lote Tolerante a Fallos:**
  - `POST /api/lecturas/batch-sync`: lote mixto con 2 lecturas válidas y 1 lectura inválida decreciente debe retornar HTTP 200 con resultados discriminados (2 con status `SYNCED` y 1 con status `REJECTED`), persistiendo las válidas.
- **Seguridad y Respaldo Atómico:**
  - `POST /api/admin/backup` exige autenticación (401 sin token) y rol `ADMIN` (403 para `OPERADOR` o `SUPERVISOR`).
  - Invocación válida por `ADMIN` retorna 200 OK con metadata del archivo y genera registro en `AuditoriaEvento` con acción `BACKUP_SISTEMA`.
- **Integridad Perimetral:**
  - Peticiones con cabecera de exención E2E (`x-e2e-client: playwright`) no activan el bloqueo de 429 Too Many Requests tras 5 intentos.

### CA-2: Flujo E2E - Reportes & Conciliación de Facturas (`e2e/reportes-conciliacion.spec.ts`)
- Cargar aplicación con credenciales `ADMIN`.
- Navegar a `#tabReportesBtn` y validar visibilidad de `#viewReportes`.
- Aplicar filtro de recursos (`#filtroReporteRecurso`) y accionar el botón `🔍 Filtrar`.
- Verificar que `#tablaReporteConsumos` renderiza los medidores con consumos netos calculados y total de muestras.
- Verificar que `#tablaReporteFacturas` muestra facturas de servicios y sus etiquetas de conciliación (`CONCILIADO` / `DISCREPANCIA`).
- Validar que el botón de exportación CSV dispara el inicio de descarga.

### CA-3: Flujo E2E - Mantenimiento Metrológico & Precintos (`e2e/mantenimiento-metrologico.spec.ts`)
- Navegar a `#tabMantenimientoBtn` y validar visibilidad de `#viewMantenimiento`.
- Verificar carga de la bitácora histórica general (`#tablaMantenimientosBitacora`).
- Abrir modal de mantenimiento (`#modalRegistrarMantenimiento`).
- Completar formulario de intervención técnica (tipo `CALIBRACION_PERIODICA`, técnico responsable, nuevo precinto, observaciones).
- Guardar y validar toast de éxito, cierre de modal e inserción del nuevo registro en la bitácora.

### CA-4: Flujo E2E - Gestión Administrativa de Usuarios (`e2e/usuarios-administracion.spec.ts`)
- Navegar a `#tabUsuariosBtn` y validar visibilidad de `#viewUsuarios`.
- Verificar que `#tablaUsuarios` renderiza los usuarios del sistema (`ADMIN`, `SUPERVISOR`, `OPERADOR`).
- Abrir modal de edición o reseteo de credenciales de usuario.
- Validar feedback visual y consistencia del estado en el directorio.

### CA-5: Flujo E2E - Auditoría y Respaldo en Caliente (`e2e/auditoria-backup.spec.ts`)
- Navegar a `#tabAuditoriaBtn` y validar visibilidad de `#viewAuditoria`.
- Verificar que `#tablaAuditoria` renderiza eventos inmutables de trazabilidad.
- Accionar `#btnGenerarBackup` (Generar Respaldo).
- Validar toast de éxito con el nombre del snapshot generado y tamaño en KB.
- Validar que la tabla de auditoría se actualiza automáticamente mostrando el evento `BACKUP_SISTEMA`.

### CA-6: Flujo E2E - PWA Offline y Resiliencia en Terreno (`e2e/pwa-offline-resiliencia.spec.ts`)
- Navegar a `#tabOperadorBtn` (Modo Terreno).
- Simular desconexión de red mediante `await page.context().setOffline(true)`.
- Registrar una lectura en modo terreno: verificar que se almacena en la cola local de `SyncManager` y la UI notifica el estado fuera de línea o pendientes.
- Simular restablecimiento de conexión con `await page.context().setOffline(false)`.
- Disparar sincronización (o aguardar auto-sincronización) y confirmar que la lectura se sincroniza con éxito y se actualiza la tarjeta.

---

## 3. Calidad y Validación Determinista

1. `npm run typecheck` (`prisma generate && tsc --noEmit`) sin errores de tipos.
2. `npm run lint` sin advertencias ni errores.
3. `npm test` ejecutando 100% de las suites en Vitest con salida 0.
4. `npx playwright test` ejecutando 100% de las suites E2E headless en Playwright con salida 0.
5. `./scripts/verify.sh` con código de salida 0.
