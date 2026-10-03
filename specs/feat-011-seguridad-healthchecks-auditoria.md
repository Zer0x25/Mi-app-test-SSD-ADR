# Spec: Seguridad, Healthchecks Operativos y Pista de Auditoría Inmutable (Hito 8)

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Implementar rate limiting en autenticación (`POST /api/auth/login`), endpoints de salud operativa para orquestación de contenedores (`GET /healthz` y `GET /readyz`), y el módulo de pista de auditoría inmutable (`AuditoriaEvento`) con registro automático de eventos críticos y consulta restringida para administradores.
- **Archivos editables autorizados:**
  - `package.json`
  - `prisma/schema.prisma`
  - `src/server.ts`
  - `src/modules/auditoria/auditoria.schema.ts`
  - `src/modules/auditoria/auditoria.service.ts`
  - `src/modules/auditoria/auditoria.controller.ts`
  - `src/modules/auditoria/auditoria.repository.ts`
  - `src/modules/usuarios/usuarios.service.ts`
  - `src/modules/mantenimiento/mantenimiento.service.ts`
  - `tests/modules/auditoria/auditoria.service.test.ts`
  - `tests/modules/auditoria/auditoria.controller.test.ts`
  - `tests/server.test.ts`
  - `Dockerfile`
  - `docker-compose.yml`
  - `docker-compose.staging.yml`
  - `public/index.html`
  - `public/app.js`
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/core/config.ts` (a menos que se requiera validar variables de rate limit si se parametrizan)
  - `src/core/errors.ts`
  - `docs/adr/*` (inmutables una vez aceptados)

---

## 2. Contrato Funcional de Datos (Zod Schemas)

### A. Contrato de Entrada (Input DTOs)

```typescript
export const RegistrarAuditoriaInputSchema = z.object({
  usuarioId: z.string().uuid().optional().nullable(),
  accion: z.enum([
    "CAMBIO_ROL",
    "RESET_PASSWORD_ADMIN",
    "BAJA_MEDIDOR",
    "CAMBIO_PRECINTO",
    "LOGIN_FALLIDO",
  ]),
  entidad: z.string().trim().min(2).max(50),
  entidadId: z.string().trim().min(1),
  detalles: z.record(z.unknown()).optional().nullable(),
  ip: z.string().trim().optional().nullable(),
});

export const FiltroAuditoriaSchema = z.object({
  accion: z.string().optional(),
  entidad: z.string().optional(),
  entidadId: z.string().optional(),
  usuarioId: z.string().optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
```

### B. Contrato de Salida (Output DTOs / Respuestas HTTP)

```typescript
export const AuditoriaEventoResponseSchema = z.object({
  id: z.string().uuid(),
  usuarioId: z.string().nullable().optional(),
  accion: z.string(),
  entidad: z.string(),
  entidadId: z.string(),
  detalles: z.record(z.unknown()).nullable().optional(),
  ip: z.string().nullable().optional(),
  createdAt: z.date(),
});

export const HealthzResponseSchema = z.object({
  status: z.literal("ok"),
  uptime: z.number().nonnegative(),
  timestamp: z.string(),
});

export const ReadyzResponseSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  database: z.enum(["connected", "disconnected"]),
  timestamp: z.string(),
  error: z.string().optional(),
});
```

---

## 3. Catálogo de Errores de Dominio Tipados

```typescript
export type AuditoriaErrorCode =
  | "AUDITORIA_EVENTO_INVALIDO"
  | "ACCESO_DENEGADO"
  | "DATABASE_NOT_READY";

export class DatabaseNotReadyError extends DomainError {
  constructor(reason: string) {
    super(`Base de datos no disponible para atender solicitudes: ${reason}`, "DATABASE_NOT_READY");
    this.name = "DatabaseNotReadyError";
  }
}
```

- Cada error de dominio debe traducirse a un código HTTP semántico en el controlador:
  - `DatabaseNotReadyError` $\rightarrow$ HTTP 503 Service Unavailable
  - `AccesoDenegadoError` $\rightarrow$ HTTP 403 Forbidden
  - Errores de validación Zod $\rightarrow$ HTTP 400 Bad Request

---

## 4. Invariantes del Negocio

### A. Invariantes Positivas (Garantías de Comportamiento)
1. **Pista Append-Only:** Todo evento de auditoría registrado se almacena de forma inmutable con su timestamp en UTC y no puede ser alterado ni eliminado.
2. **Liveness Probe Inmediato (`GET /healthz`):** Responde HTTP 200 siempre que el event loop de Node.js esté activo, sin realizar consultas de base de datos.
3. **Readiness Probe Confiable (`GET /readyz`):** Realiza un ping activo a la base de datos (mediante `prisma.$queryRaw` o equivalente). Si la base de datos responde exitosamente devuelve HTTP 200 `{ status: "ready", database: "connected" }`. Si falla, devuelve HTTP 503 `{ status: "not_ready", database: "disconnected" }`.
4. **Protección de Fuerza Bruta:** El endpoint `POST /api/auth/login` restringe a máximo 5 intentos por minuto por dirección IP, respondiendo con HTTP 429 Too Many Requests una vez excedido el límite.
5. **Auditoría de Eventos Críticos:**
   - La modificación del rol o estado de un usuario genera automáticamente un evento `CAMBIO_ROL`.
   - El reseteo administrativo de contraseñas genera un evento `RESET_PASSWORD_ADMIN`.
   - La baja técnica o reemplazo de un medidor genera un evento `BAJA_MEDIDOR`.
   - La sustitución o alteración de un precinto de seguridad genera un evento `CAMBIO_PRECINTO`.
6. **Seguridad RBAC en Auditoría:** Solo usuarios con rol `ADMIN` pueden consultar `GET /api/auditoria`.

### B. Invariantes Negativas (Prohibiciones Duras)
1. **Prohibido el Borrado o Modificación de Auditoría:** Bajo ninguna circunstancia el servicio o repositorio de auditoría expondrá métodos `update`, `delete`, `deleteMany` o `truncate`.
2. **Prohibido Acceso sin Autorización:** Usuarios con rol `OPERADOR` o `SUPERVISOR` no pueden acceder al registro de auditoría (`GET /api/auditoria` debe retornar 403 Forbidden).
3. **Prohibido Bloqueo Indebido de Tráfico:** El rate limit debe aplicarse de forma estricta a `POST /api/auth/login` sin bloquear ni estrangular el tráfico de endpoints de lectura ni la sincronización offline en lote (`POST /api/lecturas/batch-sync`).

---

## 5. Criterios de Aceptación (Definition of Done)

- [ ] **Esquemas Zod & Modelado:**
  - [ ] Modelo `AuditoriaEvento` en `prisma/schema.prisma` y cliente Prisma regenerado.
  - [ ] Esquemas de entrada y salida validados en `src/modules/auditoria/auditoria.schema.ts`.
- [ ] **Tests de Auditoría (Agentic TDD):**
  - [ ] `tests/modules/auditoria/auditoria.service.test.ts`: registro append-only, filtros por rango de fecha, entidad, acción y paginación.
  - [ ] `tests/modules/auditoria/auditoria.controller.test.ts`: acceso restringido a `ADMIN`, rechazo con 403 a otros roles.
- [ ] **Instrumentación de Dominio:**
  - [ ] Integración en `UsuariosService` (cambio de rol, reset de contraseña).
  - [ ] Integración en `MantenimientoService` (baja de medidor, cambio de precinto).
- [ ] **Endpoints de Salud & Rate Limit:**
  - [ ] `GET /healthz` retorna 200 con status `ok` y `uptime`.
  - [ ] `GET /readyz` retorna 200 cuando la BD está lista y 503 cuando la BD no responde.
  - [ ] `POST /api/auth/login` aplica rate limit y devuelve 429 al superar 5 intentos por minuto.
  - [ ] `tests/server.test.ts` extendido para validar `/healthz`, `/readyz` y rate-limiting en `/api/auth/login`.
- [ ] **Integración Visual en Frontend:**
  - [ ] Nueva pestaña "Auditoría & Seguridad" en el Dashboard accesible solo para administradores.
  - [ ] Tabla con los eventos de auditoría registrados (fecha, actor, acción, entidad, detalles).
- [ ] **Actualización de Infraestructura:**
  - [ ] `Dockerfile`, `docker-compose.yml` y `docker-compose.staging.yml` actualizados con el healthcheck a `/readyz`.
- [ ] **Quality Gate Determinista:**
  - [ ] `./scripts/verify.sh` superado con código de salida 0 (100% tests pasando).
