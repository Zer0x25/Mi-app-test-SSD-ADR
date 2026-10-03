# Spec: Observabilidad con Logs Estructurados (Pino) y Triggers de Webhooks ante Errores Críticos (Hito 9 Extendido)

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Implementar la observabilidad y trazabilidad operativa de acuerdo a `ADR 0006`:
  1. Integración del logger nativo estructurado de Fastify (Pino) configurado con `LOG_LEVEL` según el entorno, con soporte de inyección en `buildServer({ logger })` y silencio por defecto en `NODE_ENV === "test"`.
  2. Identificación y trazabilidad correlacionada de solicitudes HTTP mediante `request.id` (`reqId`).
  3. Manejador centralizado de errores en Fastify (`app.setErrorHandler`) para capturar excepciones no controladas de servidor (`statusCode >= 500`).
  4. Disparo automático y asíncrono (fail-safe) de webhooks hacia los endpoints suscritos con el evento `"sistema.error_critico"`.
  5. Discriminación de errores de cliente/dominio (4xx): ningún error 4xx debe disparar notificaciones de error crítico a los webhooks.
- **Archivos editables autorizados:**
  - `src/modules/webhooks/webhooks.schema.ts`
  - `src/server.ts`
  - `tests/server.test.ts`
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/core/errors.ts`
  - `docs/adr/*` (inmutables)

---

## 2. Contrato Funcional de Datos

### A. Tipos de Eventos de Webhooks
En `src/modules/webhooks/webhooks.schema.ts`, se añade `"sistema.error_critico"` a la tupla `WebhookEventTypes`:
```typescript
export const WebhookEventTypes = [
  "alerta.incidente_detectado",
  "alerta.incidente_resuelto",
  "medidor.calibracion_proxima",
  "medidor.calibracion_vencida",
  "sistema.error_critico",
  "test.ping",
] as const;
```

### B. Payload del Evento de Error Crítico
```typescript
export interface SistemaErrorCriticoPayload {
  reqId?: string;
  method: string;
  url: string;
  statusCode: number;
  errorName: string;
  timestamp: string;
}
```

El evento despachado a los webhooks cumple con la estructura estándar `WebhookPayload<SistemaErrorCriticoPayload>`:
```json
{
  "id": "uuid-v4",
  "event": "sistema.error_critico",
  "timestamp": "2026-10-03T19:30:00.000Z",
  "severity": "CRITICAL",
  "title": "Error Crítico de Servidor en GET /api/ejemplo",
  "message": "Mensaje descriptivo del fallo",
  "data": {
    "reqId": "req-1",
    "method": "GET",
    "url": "/api/ejemplo",
    "statusCode": 500,
    "errorName": "Error",
    "timestamp": "2026-10-03T19:30:00.000Z"
  }
}
```

---

## 3. Criterios de Aceptación (Invariantes Duras)

- **CA-1: Configuración de Logger Flexible y por Entorno**
  - `buildServer(options)` debe configurar el logger de Fastify respetando:
    `options.logger ?? (config.NODE_ENV === "test" ? false : { level: config.LOG_LEVEL })`.
  - En tests se mantiene silencioso por defecto, pero permite inyectar `{ level: "error" }` o un logger mock/espía cuando se desee verificar emisiones.

- **CA-2: Captura y Registro Estructurado de Errores >= 500**
  - Todo error capturado por `app.setErrorHandler` cuyo código HTTP sea `>= 500` debe ser logueado mediante el logger de la solicitud (`request.log.error` o `app.log.error`) incluyendo mensaje y traza.

- **CA-3: Despacho Asíncrono de Webhook ante Errores Críticos**
  - Ante cualquier error HTTP `>= 500` ocurrido en una ruta de la API, el manejador debe llamar a `webhooksService.despacharEvento(...)` con:
    - `event: "sistema.error_critico"`
    - `severity: "CRITICAL"`
    - `title: Error Crítico de Servidor en <METHOD> <URL>`
    - `message: <error.message>`
    - `data: { reqId, method, url, statusCode, errorName, timestamp }`

- **CA-4: Resiliencia y No-Bloqueo (Fail-Safe)**
  - Si el despacho del webhook arroja una excepción o falla la conexión con el endpoint destino, el error debe ser atrapado silenciosamente (`catch(() => {})`) para no alterar ni demorar la respuesta HTTP al usuario final.
  - La respuesta HTTP debe ser status `500` con JSON `{ statusCode: 500, error: "INTERNAL_SERVER_ERROR", message: "..." }`.

- **CA-5: Aislamiento de Errores de Cliente / Dominio (4xx)**
  - Peticiones que resulten en 400 (Zod validation), 401 (Unauthorized), 403 (Forbidden RBAC), 404 (Not Found) o cualquier `DomainError` con `statusCode < 500` **NO** deben disparar el webhook de error crítico `"sistema.error_critico"`.

- **CA-6: Quality Gate Determinista**
  - Todas las pruebas unitarias y de integración deben pasar con 100% de éxito y `./scripts/verify.sh` debe finalizar con código de salida 0.
