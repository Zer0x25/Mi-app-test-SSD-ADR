# Estado del Proyecto: Medidores (STATE.md)

Este archivo actúa como **memoria persistente y tablero de control** para humanos y agentes de software. Cada agente debe consultar este archivo al inicio de su sesión y actualizarlo al completar hitos o tareas.

---

## 🧭 Fase Actual: Consolidación, Rebuild de Staging y Expansión de Cobertura (Anti-Regresión & E2E Headless)

- **Proyecto:** `Medidores`
- **Estado:** Staging reconstruido exitosamente en Docker. Cobertura de anti-regresión y pruebas E2E headless expandida al 100% de los flujos del sistema.
- **Acción requerida para comenzar:** Sistema blindado y validado. Listo para siguientes prioridades o despliegue.
- **Última verificación de Quality Gate:** Superada (206/206 tests en Vitest + 19/19 tests en Playwright, código de salida 0).

---

## 📋 Registro de Hitos

- [x] **Hito -1: Blueprint Semilla Inicial**
  - Estructura agnóstica de gobernanza creada (`AGENTS.md`, `.agents/`, `docs/adr/`, `specs/templates/`, `scripts/`).
  - Barrera determinista `scripts/verify.sh` configurada.
- [x] **Hito 0: Constitución del Proyecto (Completado: 2026-10-03)**
  - Entrevista estructurada sobre Dominio, Invariantes, Stack y Restricciones.
  - Compilación inmutable de `docs/adr/0001-arquitectura-base.md`.
  - Plantilla de especificación de dominio `specs/templates/feature.md`.
  - Andamiaje funcional con TypeScript, Fastify, Prisma, Zod, Vitest y ESLint.
  - Quality Gate verificado con salida exitosa 0.
- [x] **Hito 1: Desarrollo de Features de Dominio (Completado: 2026-10-03)**
  - [x] `specs/feat-001-instalaciones-y-usuarios.md` (Completado: Módulo de Instalaciones y Asignaciones)
  - [x] `specs/feat-002-catalogo-medidores.md` (Completado: Catálogo de Tipos de Medidores y Medidores)
  - [x] `specs/feat-003-registro-lecturas.md` (Completado: Ingesta de Lecturas con Invariantes Duras)
  - [x] `specs/feat-004-dashboard-admin.md` (Completado: Métricas, KPIs y Alertas de Administración)
- [x] **Hito 2: Arquitectura Frontend & Design System (Completado: 2026-10-03)**
  - Aprobación inmutable de `docs/adr/0002-frontend-design-system-y-componentes.md`.
  - Design System Aurora implementado con tokens CSS semánticos y soporte nativo Modo Claro / Oscuro.
  - Desacoplamiento de lógica de negocio: `ApiClient` centralizado, `ModalManager`, `ToastManager` y factoría de componentes reutilizables (`createMeterCard`, etc.).
- [x] **Hito 3: Autenticación JWT y Control de Acceso RBAC (Completado: 2026-10-03)**
  - `specs/feat-005-autenticacion-rbac.md` implementado.
  - 3 Roles jerárquicos: `ADMIN` (acceso global), `SUPERVISOR` (limitado a sedes asignadas, crea medidores en sedes asignadas, no crea instalaciones), `OPERADOR` (captura en terreno).
  - Criptografía nativa con `node:crypto` (scrypt + JWT HS256), guardias preHandler de Fastify y 74/74 tests superados.
- [x] **Hito 4: Gestión Integral de Usuarios y Contraseñas (Completado: 2026-10-03)**
  - `specs/feat-006-gestion-usuarios-y-password.md` implementado bajo Agentic TDD.
  - Auto-servicio de cambio de contraseña (`POST /api/auth/cambiar-password`) con validación de contraseña actual y error tipado `PasswordActualInvalidaError`.
  - Directorio administrativo de usuarios (`GET /api/usuarios`) con asignaciones de instalaciones.
  - Modificación de usuario (`PATCH /api/usuarios/:id`) con sincronización transaccional de instalaciones asignadas.
  - Restablecimiento administrativo de credenciales (`POST /api/usuarios/:id/reset-password`).
  - Interfaz gráfica integrada con Aurora Design System.
  - Suite de pruebas expandida: 88/88 tests pasando (100%), Quality Gate 0.
- [x] **Hito 5: Reportes, Alertas Automáticas y Mantenimiento Metrológico (Completado: 2026-10-03)**
  - `specs/feat-007-reportes-y-exportacion.md`: Consumos netos consolidados, descarga CSV con cabeceras `Content-Disposition`, auditoría y conciliación contra facturas de servicios básicos con detección de desvío (≤ 5% `CONCILIADO`, > 5% `DISCREPANCIA`).
  - `specs/feat-008-alertas-y-anomalias.md`: Motor de detección temprana en vivo (`SIN_REPORTE > 48h`, `SALTO_CONSUMO > 50%`, `FUGA_PROBABLE`), ciclo de vida de incidentes (`ABIERTO`, `EN_REVISION`, `RESUELTO`) y métricas de severidad.
  - `specs/feat-009-mantenimiento-y-calibracion.md`: Bitácora técnica metrológica, trazabilidad de precintos de seguridad numerados, control de calibraciones periódicas y bajas o reemplazos técnicos con validación de lecturas de retiro.
  - Interfaz gráfica con Aurora Design System: Nuevas pestañas de Reportes & Facturas, Alertas & Incidentes, y Mantenimiento & Calibración.
  - Suite de pruebas expandida a 19 archivos y 125 pruebas pasando exitosamente (100%), Quality Gate 0.
- [x] **Hito 6: Empaquetamiento Docker, Staging & Pipeline CI/CD (Completado: 2026-10-03)**
  - `docs/adr/0003-empaquetamiento-docker-y-pipeline-cicd.md` (Compilado y extendido con estrategia multi-entorno Dev -> Staging -> Prod).
  - `specs/infra-001-docker-y-cicd.md` (Completado: Dockerfile multi-stage, docker-compose productivo y CI GitHub Actions).
  - `specs/infra-002-entorno-staging.md` (Completado: Entorno Staging, `docker-compose.staging.yml`, validación Zod `NODE_ENV=staging`, `.env.staging.example` y scripts).
  - Persistencia y aislamiento: volúmenes `medidores_data` y `medidores_staging_data` independientes.
  - Puertos: Producción en 3000, Staging en 3001 (permitiendo convivencia segura en el mismo servidor).
  - Quality Gate verificado con salida 0 (126/126 tests pasando, 100%).
- [x] **Hito 7: Modo Offline y PWA para Captura en Terreno (Completado: 2026-10-03)**
  - [x] `specs/feat-010-pwa-offline-sync.md` (Completado: Arquitectura PWA y Offline-First).
  - [x] Manifest PWA (`manifest.webmanifest`), icono SVG y Service Worker (`sw.js`) para caching estático.
  - [x] Endpoint backend de sincronización en lote `POST /api/lecturas/batch-sync` con validación individual de invariantes.
  - [x] Cola offline local en cliente (`SyncManager`) con intercepción y persistencia de lecturas en `localStorage`.
  - [x] Indicadores de conectividad (Online/Offline) y botón de sincronización en Aurora UI.
  - [x] Auto-sincronización automática tras detección de evento `online`.
  - [x] Suite de pruebas expandida: 129/129 tests pasando (100%), Quality Gate 0.
- [x] **Hito 8: Seguridad & Observabilidad en Producción (Completado: 2026-10-03)**
  - `docs/adr/0004-seguridad-healthchecks-y-auditoria.md` formalizado.
  - `specs/feat-011-seguridad-healthchecks-auditoria.md` implementado bajo Agentic TDD.
  - Rate Limiting en autenticación (`POST /api/auth/login`) contra ataques de fuerza bruta (`@fastify/rate-limit`, máx 5 intentos/min, HTTP 429).
  - Endpoints de salud operativa: `/healthz` (liveness con uptime) y `/readyz` (readiness con ping activo a SQLite con 200 OK o 503).
  - Pista de Auditoría inmutable (Audit Log): modelo `AuditoriaEvento` y módulo `src/modules/auditoria/` para registrar eventos críticos (cambios de rol, bajas de medidores, rupturas de precintos y reset de contraseñas).
  - Consulta RBAC de auditoría (`GET /api/auditoria`) restringida exclusivamente a administradores.
  - Pestaña "Auditoría & Seguridad" en la interfaz Aurora UI con filtros por tipo de acción.
  - Probes en `Dockerfile`, `docker-compose.yml` y `docker-compose.staging.yml` actualizados a `/readyz`.
  - Suite de pruebas expandida: 143/143 tests pasando (100%), Quality Gate 0.
- [x] **Hito 9: Despacho de Notificaciones & Webhooks (Completado: 2026-10-03)**
  - `docs/adr/0005-integraciones-y-despacho-webhooks.md` formalizado.
  - `specs/feat-012-webhooks-notificaciones.md` implementado bajo Agentic TDD.
  - Modelos `WebhookEndpoint` y `WebhookEntrega` en Prisma con soporte multi-evento y firmas seguras HMAC-SHA256 (`X-Webhook-Signature`).
  - Despachador asíncrono, tolerante a fallos (`fail-safe`), con timeout estricto de 5000ms y concurrencia paralela (`Promise.allSettled`).
  - Instrumentación automática ante incidentes en vivo (`alerta.incidente_detectado`, `alerta.incidente_resuelto`).
  - Disparador preventivo de calibraciones periódicas (`POST /api/webhooks/check-calibraciones`).
  - Diagnóstico sintético inmediato (`POST /api/webhooks/:id/test` con ping).
  - Pestaña de administración y modal de historial de entregas en Aurora UI.
  - Suite de pruebas expandida: 170/170 tests pasando (100%), Quality Gate 0.
- [x] **Hito 9 Extendido: Observabilidad y Triggers de Webhooks ante Errores Críticos (Completado: 2026-10-03)**
  - `docs/adr/0006-observabilidad-logs-estructurados-y-triggers-webhooks.md` formalizado.
  - `specs/feat-013-logs-estructurados-y-error-webhooks.md` implementado bajo Agentic TDD.
  - Integración nativa de Pino en Fastify según `LOG_LEVEL` dinámico por entorno.
  - Correlación de solicitudes con `reqId`.
  - Manejador central de errores `app.setErrorHandler` con trigger de webhook `sistema.error_critico` ante fallos 5xx.
  - Aislamiento de errores 4xx para evitar fatiga de alertas.
  - Resiliencia y despacho fail-safe ante caídas del receptor de webhooks.
  - Suite de pruebas expandida: 174/174 tests pasando (100%), Quality Gate 0.

---

- [x] **Hito 10: Suite de Pruebas E2E Automatizadas con Playwright (Completado: 2026-10-03)**
  - Formalización inmutable de `docs/adr/0007-pruebas-e2e-playwright.md`.
  - Especificación `specs/test-001-e2e-playwright.md` implementada bajo Agentic TDD.
  - `@playwright/test` y Chromium headless configurados con auto-lanzamiento (`webServer`).
  - Cobertura de flujos de usuario completos:
    - Login y Control de Acceso RBAC (`e2e/login-rbac.spec.ts`).
    - Captura de lecturas en terreno e invariantes decrecientes (`e2e/lecturas-terreno.spec.ts`).
    - Detección en vivo y resolución de alertas operativas (`e2e/alertas-incidentes.spec.ts`).
    - Administración, ping sintético y bitácora de webhooks (`e2e/webhooks-administracion.spec.ts`).
  - Aislamiento respecto a Vitest en `vitest.config.ts`.
  - Pipeline de CI en `.github/workflows/verify.yml` actualizado con paso Playwright.
  - Quality Gate verificado: 174/174 tests Vitest pasando + 6/6 tests E2E Playwright pasando (100%).
- [x] **Hito 11: Notificaciones Push (Web Push API) y Alertas por Telegram (Completado: 2026-10-03)**
  - ADR 0008 compilado (`docs/adr/0008-notificaciones-push-y-alertas-multicanal.md`).
  - Spec cerrado `specs/feat-014-notificaciones-push-y-telegram.md`.
  - Despachador de Telegram Bot 100% nativo con formato HTML enriquecido, severidad y emojis semánticos.
  - Despachador de Web Push (W3C Push API / RFC 8292 VAPID) con integración en Service Worker (`public/sw.js`).
  - Modelos `SuscripcionPush` y `NotificacionHistorial` en Prisma con bitácora inmutable.
  - Despacho fail-safe asíncrono (`Promise.allSettled`, timeout 5000 ms) en detección de incidentes y errores 5xx.
  - Interfaz de usuario con activación de push en un clic, pruebas sintéticas y bitácora de entregas.
  - Quality Gate verificado: 187/187 tests Vitest pasando + 7/7 tests E2E Playwright pasando (100%).
- [x] **Hito 12: Endurecimiento Operacional, Concurrencia y Resiliencia de Producción (Completado: 2026-10-04)**
  - Formalización inmutable de `docs/adr/0009-endurecimiento-operacional-concurrencia-y-resiliencia.md`.
  - Especificación `specs/feat-015-endurecimiento-y-resiliencia-produccion.md` implementada bajo Agentic TDD.
  - SQLite WAL mode, busy timeout (5000ms), integridad referencial forzada (`PRAGMA foreign_keys = ON;`) y `synchronous = NORMAL`.
  - Endpoint seguro de hot backup (`POST /api/admin/backup`) mediante `VACUUM INTO` con registro de auditoría (`AuditoriaEvento`, acción `BACKUP_SISTEMA`).
  - Parada ordenada (Graceful Shutdown) ante `SIGTERM`/`SIGINT` con drenaje de peticiones y desconexión segura de Prisma.
  - Cabeceras de seguridad HTTP con `@fastify/helmet` y CSP adaptada para la PWA (`scriptSrcAttr: ["'unsafe-inline'"]`).
  - Validación Zod estricta en query parameters (`/api/lecturas/recientes`).
  - Frontend resiliente: retroceso exponencial con jitter aleatorio (±15%) en `SyncManager`, captura global de expiración de sesión (401) en `ApiClient` con evento `medidores:session-expired`, y estados de error con recuperación interactiva (`renderErrorState`).
  - Suite de pruebas de concurrencia y validación completa del Quality Gate (196/196 Vitest pasando + 7/7 E2E Playwright pasando, 100%).

---

## 🗺️ Hoja de Ruta / Roadmap de Hitos Futuros (Backlog TO-DO)

- [x] **Rebuild & Hardening Staging:** Sincronización de `package-lock.json` y build/start Docker certificado (Completado).
- [x] **Expansión de Pruebas Anti-Regresión y E2E Headless:** Cobertura de edge cases en Vitest y suites Playwright en Reportes, Mantenimiento, Usuarios, Auditoría/Backup y PWA Offline (Completado: `specs/test-002-cobertura-antirregresion-y-e2e.md`).
- [~] **Hito 13: Evidencia Fotográfica y Geolocalización GPS en Terreno** *(Descartado por indicación explícita del usuario)*.
- [ ] **Hito 14: Rutas de Inspección y Órdenes de Trabajo para Mantenimiento en Campo**
  - Planificador de rutas óptimas para operadores por sede/edificio.
  - Checklist metrológico y firma digital del técnico al cerrar órdenes de trabajo.
- [ ] **Hito 15: Sub-Facturación y Liquidación de Consumos (Medidores Remarcadores)**
  - Cálculo de prorrateo por m³/kWh según tarifas escalonadas y cargos fijos.
  - Generación de comprobantes y recibos de cobro por local o departamento.

---

## 🎯 Especificación Activa
- **Archivo:** `specs/test-002-cobertura-antirregresion-y-e2e.md` (Completado)
- **Módulo objetivo:** Expansión de Cobertura Anti-Regresión y Pruebas E2E Headless.

---

## 📝 Registro de Tareas Recientes
| Fecha | Autor | Acción Realizada | Resultado |
| :--- | :--- | :--- | :--- |
| 2026-10-03 | Antigravity | Inicialización del Blueprint agnóstico Hito 0 | Semilla creada y vinculada a GitHub |
| 2026-10-03 | Antigravity | Ejecución y Auto-Sellado de Hito 0 (Sistema Medidores) | ADR 0001, entorno configurado y Quality Gate superado |
| 2026-10-03 | Antigravity | Implementación de `feat-001-instalaciones-y-usuarios` | Ciclo TDD completado, 19/19 tests pasando, Quality Gate 0 |
| 2026-10-03 | Antigravity | Implementación de `feat-002-catalogo-medidores` | Ciclo TDD completado, 36/36 tests pasando, Quality Gate 0 |
| 2026-10-03 | Antigravity | Implementación de `feat-003-registro-lecturas` | Ciclo TDD completado, 51/51 tests pasando, Quality Gate 0 |
| 2026-10-03 | Antigravity | Implementación de `feat-004-dashboard-admin` | Ciclo TDD completado, 59/59 tests pasando, Quality Gate 0 |
| 2026-10-03 | Antigravity | Creación del Servidor HTTP y Dashboard Web Base | Fastify con SQLite y seed de datos demo, 60/60 tests pasando |
| 2026-10-03 | Antigravity | Formalización de ADR 0002 y Frontend Design System | Tokens Claro/Oscuro, ApiClient desacoplado y componentes reutilizables |
| 2026-10-03 | Antigravity | Implementación de `feat-005-autenticacion-rbac` | Roles Admin, Supervisor y Operador con guardias y JWT, 74/74 tests pasando |
| 2026-10-03 | Antigravity | Implementación de `feat-006-gestion-usuarios-y-password` | CRUD usuarios admin, cambio y reset de claves, 88/88 tests pasando |
| 2026-10-03 | Antigravity | Implementación de `feat-007-reportes-y-exportacion` | Ciclo TDD completado, exportación CSV y conciliación de facturas |
| 2026-10-03 | Antigravity | Implementación de `feat-008-alertas-y-anomalias` | Ciclo TDD completado, motor de detección y resolución de incidentes |
| 2026-10-03 | Antigravity | Implementación de `feat-009-mantenimiento-y-calibracion` | Ciclo TDD completado, bitácora técnica, precintos y calibraciones |
| 2026-10-03 | Antigravity | Integración Frontend Aurora Design System | Vistas y modales interactivos integrados, 125/125 tests, Quality Gate 0 |
| 2026-10-03 | Antigravity | Implementación de `infra-001-docker-y-cicd` | Multi-stage Dockerfile, docker-compose, CI workflow, Quality Gate 0 |
| 2026-10-03 | Antigravity | Implementación de `infra-002-entorno-staging` | Staging compose, Zod NODE_ENV staging, 126/126 tests, Quality Gate 0 |
| 2026-10-03 | Antigravity | Implementación de `feat-010-pwa-offline-sync` | PWA, Service Worker, Batch Sync y SyncManager, 129/129 tests, Quality Gate 0 |
| 2026-10-03 | Antigravity | Implementación de `feat-011-seguridad-healthchecks-auditoria` | Rate limiting, probes /healthz y /readyz, y Auditoria inmutable, 143/143 tests, Quality Gate 0 |
| 2026-10-03 | Antigravity | Implementación de `feat-012-webhooks-notificaciones` | Webhooks salientes, firma HMAC, fail-safe, UI y 170/170 tests pasando |
| 2026-10-03 | Antigravity | Implementación de `feat-013-logs-estructurados-y-error-webhooks` | ADR 0006, Pino nativo, reqId, errorHandler y webhooks 500 fail-safe, 174/174 tests |
| 2026-10-03 | Antigravity | Ejecución `/learn` (Reglas 13 y 14 en AGENTS.md) | Formalización de webhooks salientes y observabilidad crítica en AGENTS.md y UI |
| 2026-10-03 | Antigravity | Implementación de `test-001-e2e-playwright` (Hito 10) | ADR 0007, Playwright en modo headless, suites E2E completas y CI (6/6 tests) |
| 2026-10-03 | Antigravity | Ejecución `/learn` (Reglas 11 y 15 en AGENTS.md) | Formalización de exención segura E2E y desacoplamiento de runners (Vitest vs Playwright) |
| 2026-10-03 | Antigravity | Implementación de `feat-014-notificaciones-push-y-telegram` (Hito 11) | ADR 0008, Web Push (VAPID/SW), Telegram Bot nativo, bitácora inmutable y E2E (7/7 tests) |
| 2026-10-04 | Antigravity | Ejecución `/learn` (Reglas 13 y 15 en AGENTS.md) | Formalización de auto-purga 410 en Web Push y DOM scoping obligatorio en Playwright |
| 2026-10-04 | Antigravity | Implementación de `feat-015-endurecimiento-y-resiliencia` (Hito 12) | ADR 0009, SQLite WAL, Hot Backup, Graceful Shutdown, Helmet CSP, Backoff PWA y Quality Gate 0 (196 tests Vitest + 7 tests E2E) |
| 2026-10-04 | Antigravity | Ejecución `/learn` (Reglas 16 y 17 en AGENTS.md) | Formalización de concurrencia SQLite, raw PRAGMAs, hot backup y Helmet CSP scriptSrcAttr |
| 2026-10-04 | Antigravity | Rebuild de Staging en Docker y `test-002-cobertura-antirregresion-y-e2e` | Lockfile resincronizado, Staging certificado (3001), 206/206 tests Vitest y 19/19 tests Playwright E2E pasando (Quality Gate 0) |
| 2026-10-04 | Antigravity | Ejecución `/learn` (Reglas 8 y 15 en AGENTS.md) | Sincronización de lockfile para Docker, tipado estricto en page.evaluate y desacoplamiento de invariantes acumulativas |
| 2026-10-04 | Antigravity | Optimización y Modularización de Pipeline CI | Separación en 3 jobs paralelos (Quality Gate, Playwright E2E y Docker Builds), fix regex unidad M3 y GitHub Actions 100% verde |




