# Sistema Medidores ⚡💧🔥

> **Plataforma integral de telemetría, auditoría metrológica, gestión de consumos y captura en terreno offline-first para medidores industriales y residenciales.**
> Desarrollado bajo la metodología **Spec-Driven Development (SDD)**, **Architecture Decision Records (ADR)**, **Agentic TDD** y **Quality Gates Deterministas**.

---

## 🧭 Estado Actual del Proyecto (Hito 14 Completado)

El sistema se encuentra en un estado **estable, endurecido y blindado para producción**, con:
- **Quality Gate:** Código de salida 0 garantizado en CI/CD y local (`./scripts/verify.sh`).
- **Pruebas Unitarias & Integración:** 206 / 206 tests pasando al 100% en [Vitest](https://vitest.dev/).
- **Pruebas E2E Sintéticas:** 37 / 37 tests pasando al 100% en [Playwright](https://playwright.dev/) cubriendo todos los flujos de usuario (escritorio y móviles de 320px a 1024px+).
- **Contenerización Multi-Entorno:** Soporte desacoplado para Desarrollo Local, Staging (Docker en puerto 3001) y Producción (Docker en puerto 3000).

---

## 🎯 Capacidades Principales del Sistema

### 1. Multi-Recurso y Tipologías Heterogéneas
- **Recursos Soportados:** Agua potable e industrial, Electricidad (red trifásica/monofásica), Gas (gas natural, GLP) y Combustibles / Petróleo.
- **Tipologías de Medición:** Acumulativa/Secuencial (kWh, m³, L), Instantánea (flujo o potencia kW, L/min), Porcentaje de Nivel (% estanque) y Volumétrica.
- **Invariante Metrológica Dura:** En medidores acumulativos, cualquier lectura menor o igual a la inmediata anterior es rechazada de forma estricta (prevención de retroceso no autorizado).

### 2. Control de Acceso Basado en Roles (RBAC Jerárquico)
- **`ADMIN`:** Control global del sistema, directorio de usuarios, asignación de instalaciones, bitácora inmutable de auditoría, disparador de respaldos atómicos y configuración de webhooks.
- **`SUPERVISOR`:** Acceso restringido exclusivamente a las instalaciones o sedes asignadas. Puede crear medidores y analizar consumos de sus plantas sin acceso a la administración global.
- **`OPERADOR`:** Interfaz optimizada para captura de lecturas en terreno, con autoservicio de cambio de contraseña e historial de mediciones.

### 3. Modo Terreno & PWA Offline-First
- **Captura sin Conexión:** Registro ininterrumpido de lecturas en almacenamiento local del cliente (`localStorage`) cuando se pierde la conectividad celular o WiFi.
- **Sincronización Automática Resiliente:** Gestor `SyncManager` con detección de reconexión, backoff exponencial con jitter aleatorio (±15%) y endpoint de sincronización en lote (`POST /api/lecturas/batch-sync`) con validación discriminada por ítem.
- **Service Worker (`sw.js`) & Manifest:** Caching seguro de la aplicación (shell de navegación) con acotamiento estricto de origen (*same-origin*).

### 4. Metrología, Calibraciones y Precintos
- **Bitácora Técnica:** Registro histórico inmutable de intervenciones técnicas y calibraciones periódicas.
- **Trazabilidad de Precintos:** Control estricto de precintos de seguridad numerados ante reemplazos o aperturas.
- **Bajas Técnicas Controladas:** Desactivación de medidores con validación obligatoria de lectura final de retiro y registro en auditoría.

### 5. Reportes, Conciliación de Facturas y Exportación
- **Consumos Netos Consolidados:** Métricas de consumo discriminadas por recurso, sede y período.
- **Conciliación de Servicios Básicos:** Registro de facturas emitidas por empresas proveedoras y cálculo automático de desvío frente a mediciones internas (≤ 5% `CONCILIADO`, > 5% `DISCREPANCIA`).
- **Exportación CSV:** Descarga nativa de consumos y lecturas con cabeceras HTTP `Content-Disposition`.

### 6. Alertas y Detección Temprana de Incidentes
- **Motor en Caliente:** Detección de `SIN_REPORTE` (> 48h sin lectura), `SALTO_CONSUMO` (> 50% respecto al histórico) y `FUGA_PROBABLE` (consumo constante nocturno).
- **Ciclo de Incidentes:** Estados tipados (`ABIERTO`, `EN_REVISION`, `RESUELTO`) con bitácora de resolución.
- **Reglas Dinámicas:** Configuración de nuevas reglas de alerta en caliente con umbrales porcentuales e intervalos configurables.

### 7. Integraciones Salientes (Webhooks, Telegram y Web Push)
- **Webhooks Salientes:** Despacho asíncrono fail-safe (`Promise.allSettled`), timeout de 5000ms, firma criptográfica HMAC-SHA256 (`X-Webhook-Signature`) y registro inmutable de entregas (`WebhookEntrega`).
- **Telegram Bot:** Notificaciones nativas por HTTP con formato HTML enriquecido y emojis de severidad.
- **Web Push API:** Notificaciones push en navegador basadas en estándares W3C / RFC 8292 VAPID.
- **Trigger ante Errores Críticos:** Captura automática en `app.setErrorHandler` que dispara alertas operativas ante excepciones HTTP 5xx.

### 8. Seguridad Perimetral, Concurrencia y Resiliencia
- **Cabeceras HTTP con Helmet:** Content Security Policy (CSP) adaptada a PWA (`scriptSrcAttr: ["'unsafe-inline'"]` y dominios tipográficos en `connect-src`).
- **Rate Limiting:** Protección por IP en `POST /api/auth/login` (máximo 5 peticiones/min, HTTP 429 con cabecera `Retry-After`).
- **Concurrencia SQLite WAL:** Configuración obligatoria con `PRAGMA journal_mode = WAL;`, `busy_timeout = 5000;`, `foreign_keys = ON;` y `synchronous = NORMAL;`.
- **Hot Backup Atómico:** Respaldo en caliente de SQLite en `/api/admin/backup` mediante `VACUUM INTO` con pista en `AuditoriaEvento`.
- **Probes Operacionales:** `/healthz` (liveness ligero con uptime) y `/readyz` (readiness con ping activo a SQLite).
- **Apagado Ordenado (Graceful Shutdown):** Captura de `SIGTERM`/`SIGINT` para drenar peticiones y desconectar Prisma limpiamente.

### 9. Diseño Responsivo Mobile-First (Aurora Design System)
- **Breakpoints Progresivos:** Adaptación perfecta desde 320px (iPhone SE 1st Gen) hasta 1024px+ (Desktop XL).
- **Cero Desbordamiento Horizontal:** `max-width: 100%` y contención estricta en todas las vistas y modales.
- **Drawer Móvil Accesible:** Menú hamburguesa off-canvas con animaciones suaves, cierre automático y accesibilidad para lectores de pantalla.
- **Fichas Móviles Apiladas (Stacked Cards):** Transformación CSS automática (`@media (max-width: 768px)`) de todas las tablas de datos en tarjetas táctiles individuales con etiquetas semánticas `data-label` y botones táctiles ergonómicos (>= 44px).

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
| :--- | :--- |
| **Backend & API** | Node.js (v20+), [Fastify](https://fastify.dev/) 5, [TypeScript](https://www.typescriptlang.org/) (Strict Mode) |
| **ORM & Base de Datos** | [Prisma ORM](https://www.prisma.io/) 6 con [SQLite](https://www.sqlite.org/) (Modo WAL) |
| **Validación & Entorno** | [Zod](https://zod.dev/) para DTOs, queries y variables de entorno |
| **Frontend & PWA** | Vanilla JavaScript / CSS (Aurora Design System), Service Worker, Web Push |
| **Seguridad & Red** | `@fastify/helmet` (CSP), `@fastify/rate-limit`, `node:crypto` (scrypt, HMAC, VAPID) |
| **Logging** | Pino integrado nativo con `LOG_LEVEL` dinámico y correlación `reqId` |
| **Testing** | [Vitest](https://vitest.dev/) (Unit/Integration) y [Playwright](https://playwright.dev/) (E2E Headless) |
| **Contenerización** | Docker Multi-Stage (Alpine Linux) y Docker Compose |

---

## 🏛️ Registros de Decisión Arquitectónica (ADRs)

Todas las decisiones estructurales del proyecto están formalizadas de forma inmutable en `docs/adr/`:

- [ADR 0000: Adopción de Gobernanza Agéntica](docs/adr/0000-adopcion-gobernanza-agentica.md)
- [ADR 0001: Arquitectura Base, Invariantes y Stack de Medidores](docs/adr/0001-arquitectura-base.md)
- [ADR 0002: Frontend Design System Aurora y Componentes Desacoplados](docs/adr/0002-frontend-design-system-y-componentes.md)
- [ADR 0003: Empaquetamiento Docker y Pipeline CI/CD Multi-Entorno](docs/adr/0003-empaquetamiento-docker-y-pipeline-cicd.md)
- [ADR 0004: Seguridad Perimetral, Probes de Salud y Pistas de Auditoría](docs/adr/0004-seguridad-healthchecks-y-auditoria.md)
- [ADR 0005: Integraciones Salientes y Despacho de Webhooks Seguros](docs/adr/0005-integraciones-y-despacho-webhooks.md)
- [ADR 0006: Observabilidad, Logs Estructurados y Triggers ante Fallos Críticos](docs/adr/0006-observabilidad-logs-estructurados-y-triggers-webhooks.md)
- [ADR 0007: Suite de Pruebas E2E Automatizadas con Playwright](docs/adr/0007-pruebas-e2e-playwright.md)
- [ADR 0008: Notificaciones Push (Web Push API) y Alertas por Telegram Bot](docs/adr/0008-notificaciones-push-y-alertas-multicanal.md)
- [ADR 0009: Endurecimiento Operacional, Concurrencia SQLite WAL y Resiliencia](docs/adr/0009-endurecimiento-operacional-concurrencia-y-resiliencia.md)
- [ADR 0010: Diseño Responsivo Mobile-First y Usabilidad Táctil en Terreno](docs/adr/0010-diseno-responsivo-y-adaptabilidad-movil.md)
- [ADR 0011: Fichas Adaptativas Móviles (Stacked Cards) para Tablas de Datos](docs/adr/0011-fichas-moviles-tablas-responsive.md)

---

## 📁 Estructura del Repositorio

```text
├── docs/
│   └── adr/                                     # Architecture Decision Records inmutables (0000 a 0011)
├── specs/                                       # Especificaciones SDD cerradas de cada hito
│   └── templates/                               # Plantillas para nuevas especificaciones
├── src/
│   ├── core/                                    # Núcleo protegido: config Zod, errores de dominio, logger
│   └── modules/                                 # Módulos de dominio desacoplados
│       ├── auditoria/                           # Pistas de auditoría inmutables (Append-Only)
│       ├── autenticacion/                       # JWT, scrypt, RBAC y guardias Fastify
│       ├── catalogo/                            # Tipos de medidor y gestión de instalaciones
│       ├── incidentes/                          # Motor de anomalías y reglas de alerta
│       ├── lecturas/                            # Ingesta, validación de invariantes y batch sync
│       ├── mantenimiento/                       # Calibraciones, precintos y bajas técnicas
│       ├── medidores/                           # Directorio y estados de medidores físicos
│       ├── notificaciones/                      # Web Push VAPID y Telegram Bot
│       ├── reportes/                            # Conciliación de facturas y exportación CSV
│       ├── usuarios/                            # Directorio, CRUD y autoservicio de contraseñas
│       └── webhooks/                            # Despacho saliente con firma HMAC-SHA256
├── public/                                      # Aplicación Web SPA y recursos PWA
│   ├── app.js                                   # Lógica cliente y controladores de vista
│   ├── styles.css                               # Aurora Design System con Stacked Cards
│   ├── sw.js                                    # Service Worker para caching y push
│   └── manifest.webmanifest                     # Manifiesto de instalación PWA
├── tests/                                       # Pruebas unitarias e integración en Vitest (206 tests)
├── e2e/                                         # Pruebas sintéticas E2E en Playwright (37 tests)
├── scripts/
│   └── verify.sh                                # Calidad determinista (typecheck, lint, test)
├── docker-compose.yml                           # Despliegue de Producción (puerto 3000)
├── docker-compose.staging.yml                   # Despliegue de Staging (puerto 3001)
├── Dockerfile                                   # Multi-stage build (Alpine Linux)
├── docker-entrypoint.sh                         # Entrypoint determinista con prisma db push
├── AGENTS.md                                    # 19 Reglas de gobernanza operativa para agentes IA
└── STATE.md                                     # Memoria viva del estado del proyecto
```

---

## 🚀 Puesta en Marcha Rápida

### Requisitos Previos
- Node.js >= 20.x y npm >= 10.x
- Docker y Docker Compose (opcional, para ejecutar en contenedor)

### 1. Desarrollo Local (Rápido)
```bash
# 1. Instalar dependencias
npm ci

# 2. Configurar variables de entorno
cp .env.example .env

# 3. Generar cliente Prisma y sincronizar esquema
npx prisma generate
npx prisma db push

# 4. Iniciar servidor de desarrollo con recarga ágil
npm run dev
```
La aplicación estará disponible en [http://localhost:3000](http://localhost:3000).

---

### 2. Entorno de Staging (Docker Aislado)
El entorno de Staging corre contenerizado en el puerto **3001** con su propia base de datos aislada (`medidores-staging.db`):
```bash
# Iniciar Staging en segundo plano
npm run staging:up

# Ver logs del contenedor
docker logs -f sistema-medidores-staging

# Detener Staging
npm run staging:down
```
Accesible en [http://localhost:3001](http://localhost:3001).

---

### 3. Entorno de Producción (Docker)
```bash
# Iniciar Producción
npm run prod:up

# Detener Producción
npm run prod:down
```
Accesible en [http://localhost:3000](http://localhost:3000).

---

## 🧪 Verificación y Quality Gate

El proyecto cuenta con barreras de calidad deterministas que garantizan código de salida 0:

```bash
# 1. Verificación estricta de tipos (TypeScript + Prisma Client)
npm run typecheck

# 2. Linter y análisis estático (ESLint 9)
npm run lint

# 3. Suite completa de pruebas unitarias y de integración (Vitest - 206 pruebas)
npm test

# 4. Suite completa de pruebas E2E en navegador (Playwright - 37 pruebas)
npm run test:e2e

# 5. Ejecutar E2E contra el contenedor de Staging (puerto 3001)
BASE_URL=http://127.0.0.1:3001 npm run test:e2e

# 6. Quality Gate Determinista completo (ejecuta typecheck, lint y tests unitarios)
./scripts/verify.sh
```

---

## 🔑 Credenciales de Demostración (Semilla)

Al iniciar o restablecer el entorno mediante el botón en pantalla o ejecutando `POST /api/demo/seed`, se cargan los siguientes usuarios de prueba:

| Rol | Correo Electrónico | Contraseña | Alcance / Permisos |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | `admin@medidores.cl` | `demo1234` | Acceso irrestricto, auditoría, webhooks, backups y gestión de usuarios. |
| **`SUPERVISOR`** | `supervisor@medidores.cl` | `demo1234` | Supervisión de sedes asignadas (*Planta Industrial Norte*). |
| **`OPERADOR`** | `operador@medidores.cl` | `demo1234` | Captura en terreno y modo offline en sedes asignadas. |

---

## 📜 Licencia

Proyecto bajo licencia privada para gestión industrial y residencial de consumos de medidores.
Desarrollado y mantenido con metodología SDD y gobernanza agéntica estricta.
