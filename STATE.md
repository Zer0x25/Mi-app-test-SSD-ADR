# Estado del Proyecto: Medidores (STATE.md)

Este archivo actúa como **memoria persistente y tablero de control** para humanos y agentes de software. Cada agente debe consultar este archivo al inicio de su sesión y actualizarlo al completar hitos o tareas.

---

## 🧭 Fase Actual: Hito 8 Concluido (Seguridad, Healthchecks & Auditoría)

- **Proyecto:** `Medidores`
- **Estado:** Rate limiting en Auth, probes operacionales /healthz y /readyz, y pista de auditoría inmutable completados y verificados.
- **Acción requerida para comenzar:** Elegir el siguiente hito de la hoja de ruta (Hito 9: Despacho de Notificaciones & Webhooks).
- **Última verificación de Quality Gate:** Superada (100% pruebas pasando, 143/143 tests en 21 suites, código de salida 0).

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

---

## 🗺️ Hoja de Ruta / Roadmap de Hitos Futuros (Backlog TO-DO)

- [ ] **Hito 9: Despacho de Notificaciones & Webhooks**
  - Integración saliente para alertas críticas (`FUGA_PROBABLE`, `SALTO_CONSUMO > 50%`).
  - Webhooks configurables (Slack / Discord / Teams / HTTP genérico).
  - Notificaciones de aviso previo para medidores próximos a vencer calibración periódica.
- [ ] **Hito 10: Suite de Pruebas E2E Automatizadas (Playwright)**
  - Pruebas sintéticas completas de navegador: login de operador, registro de lecturas, visualización de dashboard, resolución de incidentes.
  - Ejecución en modo headless dentro del flujo de GitHub Actions.
- [ ] **Hito 11: Escalabilidad y Persistencia Multi-Contenedor (PostgreSQL)**
  - Nuevo ADR para soporte dual SQLite (desarrollo local ágil) y PostgreSQL (producción distribuida con réplicas).
  - Migración con Prisma hacia motor de base de datos cliente-servidor con pooling.

---

## 🎯 Especificación Activa
- **Archivo:** *Hito 8 concluido (`specs/feat-011-seguridad-healthchecks-auditoria.md`).*
- **Módulo objetivo:** *Seguridad, Healthchecks & Auditoría Inmutable.*

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
