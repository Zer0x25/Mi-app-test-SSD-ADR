# ADR 0004: Seguridad, Probes de Salud Operativa y Pista de Auditoría Inmutable

- **Fecha:** 2026-10-03
- **Estado:** Aceptado
- **Afecta a:** Servidor HTTP, Núcleo de Seguridad, Modelo de Datos (Prisma), Módulo de Auditoría y Probes de Contenedor

---

## 1. Contexto y Problema

Tras la consolidación funcional de los módulos de negocio y la resiliencia offline (Hitos 1 al 7), el sistema **Medidores** procesa datos operativos críticos de consumo de recursos y operaciones técnicas de campo. 

Para operar en entornos de producción con alta confiabilidad y cumplimiento normativo, se identifican tres requerimientos arquitectónicos indispensables:

1. **Protección contra Ataques de Fuerza Bruta (DDoS / Credential Stuffing):**
   - El endpoint de autenticación `POST /api/auth/login` debe estar protegido contra ataques automatizados de adivinación de contraseñas mediante límites de tasa (Rate Limiting).
2. **Observabilidad y Probes de Salud Estándar en Contenedores (Liveness & Readiness):**
   - Los orquestadores de contenedores (Docker Swarm, Kubernetes, etc.) requieren distinguir entre la vivacidad del proceso (`/healthz`: liveness) y la capacidad efectiva de atender tráfico con la base de datos operativa (`/readyz`: readiness).
   - Se debe mantener retrocompatibilidad con el endpoint existente `/api/health`.
3. **Trazabilidad y No-Repudio (Pista de Auditoría Inmutable / Audit Trail):**
   - Las acciones críticas de seguridad y metrología (cambios de rol de usuarios, restablecimientos administrativos de contraseñas, bajas técnicas de medidores y aperturas o reemplazos de precintos de seguridad) deben persistirse en una pista de auditoría inmutable de solo inserción (*append-only*).
   - Ningún usuario o administrador debe tener la capacidad de alterar o eliminar físicamente registros de auditoría históricos.
   - El acceso al historial de auditoría debe estar restringido exclusivamente al rol `ADMIN`.

---

## 2. Decisión

Se aprueba formalmente la implementación de las siguientes medidas:

### 2.1. Mitigación de Fuerza Bruta con `@fastify/rate-limit`
- Se autoriza la incorporación de la dependencia oficial `@fastify/rate-limit`.
- Se configurará rate limiting con políticas diferenciadas:
  - **Ruta sensible `POST /api/auth/login`:** Máximo 5 peticiones por minuto por dirección IP. Al exceder el umbral, Fastify responderá con código `429 Too Many Requests`, cabecera `Retry-After` y mensaje de error semántico.
  - **Endpoints globales de API:** Límites amplios para proteger el servicio sin entorpecer la sincronización de lecturas en lote de operadores.

### 2.2. Probes de Salud Operativa (`/healthz` y `/readyz`)
- **`GET /healthz` (Liveness Probe):**
  - Responde con HTTP 200 `{ status: "ok", uptime: number }` de forma instantánea sin tocar la base de datos, garantizando que el bucle de eventos de Node.js no está bloqueado.
- **`GET /readyz` (Readiness Probe):**
  - Ejecuta una verificación activa contra Prisma (`prisma.$queryRaw` o verificación de conexión SQLite).
  - Si la base de datos responde exitosamente: HTTP 200 `{ status: "ready", database: "connected" }`.
  - Si la base de datos no está accesible o hay fallo de E/S: HTTP 503 Service Unavailable `{ status: "not_ready", database: "disconnected" }`.
- **Retrocompatibilidad:** Se preserva el endpoint existente `GET /api/health`.

### 2.3. Modelo y Módulo de Auditoría Inmutable (`AuditoriaEvento`)
- Se incorpora en `prisma/schema.prisma` el modelo inmutable `AuditoriaEvento`:
  ```prisma
  model AuditoriaEvento {
    id        String   @id @default(uuid())
    usuarioId String?  // ID del actor que ejecutó la acción (null si es del sistema)
    accion    String   // CAMBIO_ROL, RESET_PASSWORD_ADMIN, BAJA_MEDIDOR, CAMBIO_PRECINTO, etc.
    entidad   String   // USUARIO, MEDIDOR, MANTENIMIENTO, etc.
    entidadId String   // ID del registro auditado
    detalles  String?  // JSON string con metadata contextual o estado anterior/nuevo
    ip        String?  // IP origen de la petición si está disponible
    createdAt DateTime @default(now())

    @@index([entidad, entidadId])
    @@index([accion])
    @@index([createdAt(sort: Desc)])
    @@map("auditoria_eventos")
  }
  ```
- **Invariante Dura de Auditoría:** El repositorio y servicio de auditoría implementarán exclusivamente el método `registrar` (*insert-only*) y `listar` (*read-only*). Queda vetada cualquier operación de `update` o `delete` sobre `AuditoriaEvento`.
- **Control de Acceso RBAC:** El endpoint `GET /api/auditoria` estará protegido para que exclusivamente usuarios con rol `ADMIN` puedan consultar la bitácora.
- **Instrumentación de Eventos Críticos:**
  - `UsuariosService.editarUsuario`: Registra evento `CAMBIO_ROL` cuando se altera el rol o activación de un usuario.
  - `UsuariosService.resetPasswordAdmin`: Registra evento `RESET_PASSWORD_ADMIN`.
  - `MantenimientoService.registrarMantenimiento`: Registra evento `BAJA_MEDIDOR` cuando se formaliza una `BAJA_TECNICA` o `REEMPLAZO_EQUIPO`, y `CAMBIO_PRECINTO` cuando se sustituye un precinto numerado.

### 2.4. Actualización del Healthcheck de Contenedores
- El `Dockerfile` y `docker-compose.yml` se actualizarán para apuntar el comando `HEALTHCHECK` a `http://localhost:3000/readyz`, asegurando que el contenedor solo se reporte como *healthy* cuando la base de datos esté lista para recibir transacciones.

---

## 3. Consecuencias

### Positivas
- Protección robusta contra ataques de fuerza bruta en el portal de acceso.
- Diagnóstico automatizado y auto-remediación facilitada en clústeres de contenedores mediante probes estándar (`/healthz`, `/readyz`).
- Cumplimiento de estándares de seguridad y trazabilidad forense: cualquier acción administrativa o técnica crítica queda asentada de forma permanente y verificable.

### Negativas / Trade-offs
- Ligero consumo adicional de almacenamiento en disco por el crecimiento acumulativo de la tabla `auditoria_eventos` (mitigado al almacenar únicamente eventos críticos y no cada lectura periódica individual).
