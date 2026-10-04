# Spec: Blindaje Perimetral Zero-Trust en API REST y Matriz RBAC Fail-Closed (Hito 15)

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Propósito y Alcance de Negocio

Implementar el modelo de seguridad **Zero-Trust Perimetral** y **Fail-Closed** a nivel de transporte HTTP en Fastify ([src/server.ts](file:///home/zer0x/proyectos/Mi-app-test-SSD-ADR/src/server.ts)), en cumplimiento estricto con el [ADR 0013](file:///home/zer0x/proyectos/Mi-app-test-SSD-ADR/docs/adr/0013-blindaje-perimetral-api-zero-trust-y-matriz-rbac.md).

El objetivo es erradicar de raíz la vulnerabilidad de acceso directo a la API mediante herramientas externas (`curl`, Postman, bots) o inspectores de red, garantizando que:
1. Toda ruta privada bajo `/api/*` sea rechazada con `HTTP 401 Unauthorized` si no cuenta con un token JWT válido.
2. La matriz RBAC sea aplicada de forma exhaustiva para los roles `ADMIN`, `SUPERVISOR` y `OPERADOR`.
3. Ningún operador en terreno pueda consultar métricas de dashboard, reportes consolidados o reglas de alertas corporativas (HTTP 403).

---

## 2. Límites y Archivos Autorizados

- **Archivos editables autorizados:**
  - `src/server.ts`
  - `tests/server.test.ts`
  - `tests/server.rbac-perimeter.test.ts`
  - `docs/adr/0013-blindaje-perimetral-api-zero-trust-y-matriz-rbac.md`
  - `AGENTS.md`
  - `STATE.md`
- **Archivos protegidos:**
  - `src/core/config.ts`
  - `src/core/errors.ts`
  - `prisma/schema.prisma`
  - `docs/adr/0001-*.md` a `docs/adr/0012-*.md`

---

## 3. Matriz de Autorización y Respuestas HTTP

| Endpoint / Prefijo | Público | `ADMIN` | `SUPERVISOR` | `OPERADOR` |
| :--- | :--- | :--- | :--- | :--- |
| `/healthz`, `/readyz`, `/api/health` | ✅ 200 OK | ✅ 200 OK | ✅ 200 OK | ✅ 200 OK |
| `/api/config` | ✅ 200 OK | ✅ 200 OK | ✅ 200 OK | ✅ 200 OK |
| `/api/auth/login`, `/api/auth/register` | ✅ 200/201 | ✅ 200/201 | ✅ 200/201 | ✅ 200/201 |
| `/api/demo/seed` | ✅ 200 OK | ✅ 200 OK | ✅ 200 OK | ✅ 200 OK |
| `POST /api/instalaciones` | ❌ 401 | ✅ 201 | ❌ 403 | ❌ 403 |
| `GET /api/instalaciones` | ❌ 401 | ✅ 200 | ✅ 200 | ✅ 200 |
| `POST /api/medidores` | ❌ 401 | ✅ 201 | ✅ 201 (asignada) / ❌ 403 | ❌ 403 |
| `GET /api/medidores/tipos` | ❌ 401 | ✅ 200 | ✅ 200 | ✅ 200 |
| `GET /api/dashboard/*` | ❌ 401 | ✅ 200 | ✅ 200 (filtrado) | ❌ 403 |
| `GET /api/reportes/*` | ❌ 401 | ✅ 200 | ✅ 200 | ❌ 403 |
| `GET /api/alertas/*` | ❌ 401 | ✅ 200 | ✅ 200 | ❌ 403 |
| `GET /api/mantenimiento/*` | ❌ 401 | ✅ 200 | ✅ 200 | ❌ 403 |
| `POST /api/lecturas` | ❌ 401 | ✅ 201 | ✅ 201 | ✅ 201 (asignada) |
| `/api/usuarios/*` | ❌ 401 | ✅ 200/201 | ❌ 403 | ❌ 403 |
| `/api/auditoria/*` | ❌ 401 | ✅ 200 | ❌ 403 | ❌ 403 |
| `/api/webhooks/*` (gestión) | ❌ 401 | ✅ 200/201 | ❌ 403 | ❌ 403 |
| `/api/webhooks/check-calibraciones` | ❌ 401 | ✅ 200 | ✅ 200 | ❌ 403 |
| `/api/admin/backup` | ❌ 401 | ✅ 200 | ❌ 403 | ❌ 403 |

---

## 4. Criterios de Aceptación (Agentic TDD)

### CA1: Protección Perimetral Fail-Closed (HTTP 401)
- Toda solicitud a `/api/*` privada sin cabecera `Authorization` o con token inválido debe retornar inmediatamente `HTTP 401 Unauthorized` con el cuerpo `{ error: "UNAUTHORIZED", message: "..." }`.

### CA2: Exención Estricta de Allow-List Pública
- Rutas públicas (`/healthz`, `/readyz`, `/api/health`, `/api/config`, `/api/auth/login`, `/api/auth/register`, `/api/demo/seed`) deben responder exitosamente sin exigir token.

### CA3: Preservación de Códigos HTTP 404
- Rutas bajo `/api/` que no existan en el enrutador de Fastify (`request.is404 === true`) deben resolverse como `HTTP 404 Not Found` en lugar de ser enmascaradas con 401.

### CA4: Blindaje RBAC de Modificación de Infraestructura (Instalaciones y Medidores)
- `POST /api/instalaciones` solo puede ser ejecutado por `ADMIN`. Rechaza a `SUPERVISOR` y `OPERADOR` con `HTTP 403 Forbidden`.
- `POST /api/medidores` deniega a `OPERADOR` con 403. Permite a `SUPERVISOR` solo en instalaciones asignadas (rechazando con 403 si no está asignado).

### CA5: Blindaje RBAC de Módulos de Gestión (Dashboard, Reportes, Alertas, Mantenimiento)
- `OPERADOR` es rechazado con `HTTP 403 Forbidden` al intentar consultar `/api/dashboard/*`, `/api/reportes/*`, `/api/alertas/*` o `/api/mantenimiento/*`.
- `ADMIN` y `SUPERVISOR` pueden consultar dichos módulos normalmente.

### CA6: Blindaje de Módulos Críticos (Usuarios, Auditoría, Backups)
- Exclusivos para `ADMIN` (403 para cualquier otro rol).

---

## 5. Calidad y Certificación

- **Quality Gate:** `./scripts/verify.sh` con código de salida 0 (207+ tests de vitest pasando, typecheck y eslint).
- **Certificación Staging:** Reconstrucción de la imagen Docker en puerto 3001 y ejecución de las pruebas Playwright.
