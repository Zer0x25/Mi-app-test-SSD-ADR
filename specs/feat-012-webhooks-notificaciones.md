# Spec: Despacho Estandarizado de Notificaciones y Webhooks (Hito 9)

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Implementar la arquitectura de integraciones salientes Webhook-First: registro y administración CRUD de endpoints de webhook (`WebhookEndpoint`), trazabilidad de envíos (`WebhookEntrega`), cálculo de firma criptográfica HMAC-SHA256, despachador asíncrono y resiliente (`WebhookDispatcherService`), despacho de eventos ante incidentes detectados y resueltos (`alerta.incidente_detectado`, `alerta.incidente_resuelto`), aviso preventivo de calibraciones (`medidor.calibracion_proxima`), ping de diagnóstico sintético (`test.ping`), y panel de administración en frontend.
- **Archivos editables autorizados:**
  - `prisma/schema.prisma`
  - `src/server.ts`
  - `src/core/config.ts`
  - `.env.example`
  - `src/modules/webhooks/webhooks.schema.ts`
  - `src/modules/webhooks/webhooks.service.ts`
  - `src/modules/webhooks/webhooks.controller.ts`
  - `src/modules/webhooks/webhooks.repository.ts`
  - `src/modules/alertas/alertas.service.ts`
  - `src/modules/mantenimiento/mantenimiento.service.ts`
  - `tests/modules/webhooks/webhooks.service.test.ts`
  - `tests/modules/webhooks/webhooks.controller.test.ts`
  - `tests/modules/alertas/alertas.service.test.ts`
  - `public/index.html`
  - `public/app.js`
  - `public/js/api.js`
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/core/errors.ts`
  - `docs/adr/*` (inmutables una vez aceptados)

---

## 2. Contrato Funcional de Datos (Zod Schemas)

### A. Tipos de Eventos y Payload Estándar
```typescript
export const WebhookEventTypes = [
  "alerta.incidente_detectado",
  "alerta.incidente_resuelto",
  "medidor.calibracion_proxima",
  "medidor.calibracion_vencida",
  "test.ping",
] as const;

export type WebhookEventType = (typeof WebhookEventTypes)[number];

export interface WebhookPayload<T = unknown> {
  id: string; // UUID v4 del evento
  event: WebhookEventType;
  timestamp: string; // ISO 8601
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  data: T;
}
```

### B. Contrato de Entrada (Input DTOs)
```typescript
export const CrearWebhookInputSchema = z.object({
  url: z.string().url("URL de destino inválida"),
  descripcion: z.string().trim().min(3, "La descripción debe tener al menos 3 caracteres"),
  secret: z.string().trim().min(8, "El secret debe tener al menos 8 caracteres").optional().nullable(),
  eventos: z.array(z.string()).default(["*"]),
  activo: z.boolean().default(true),
});

export const ActualizarWebhookInputSchema = z.object({
  url: z.string().url("URL de destino inválida").optional(),
  descripcion: z.string().trim().min(3).optional(),
  secret: z.string().trim().min(8).optional().nullable(),
  eventos: z.array(z.string()).optional(),
  activo: z.boolean().optional(),
});

export const TestWebhookInputSchema = z.object({
  evento: z.enum(WebhookEventTypes).default("test.ping"),
});
```

### C. Contrato de Salida (Response DTOs)
```typescript
export interface WebhookEndpointResponse {
  id: string;
  url: string;
  descripcion: string;
  eventos: string[];
  activo: boolean;
  hasSecret: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEntregaResponse {
  id: string;
  webhookId: string;
  evento: string;
  url: string;
  statusCode: number | null;
  exitoso: boolean;
  error: string | null;
  duracionMs: number | null;
  createdAt: Date;
}

export interface TestWebhookResult {
  exitoso: boolean;
  statusCode: number | null;
  duracionMs: number;
  error: string | null;
}
```

---

## 3. Endpoints HTTP y Reglas de Autorización

| Método | Ruta | Rol Requerido | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/webhooks` | `ADMIN` | Listar endpoints de webhooks registrados |
| `POST` | `/api/webhooks` | `ADMIN` | Crear un nuevo endpoint de webhook |
| `GET` | `/api/webhooks/:id` | `ADMIN` | Obtener detalle de un endpoint |
| `PATCH` | `/api/webhooks/:id` | `ADMIN` | Actualizar configuración de un endpoint |
| `DELETE` | `/api/webhooks/:id` | `ADMIN` | Eliminar un endpoint de webhook |
| `POST` | `/api/webhooks/:id/test` | `ADMIN` | Disparar evento de prueba (`test.ping`) hacia el webhook |
| `GET` | `/api/webhooks/:id/entregas` | `ADMIN` | Listar historial de entregas de un endpoint |
| `POST` | `/api/webhooks/check-calibraciones` | `ADMIN`, `SUPERVISOR` | Disparar evaluación de calibraciones próximas a vencer (≤ 30 días) y despachar eventos |

---

## 4. Invariantes y Reglas de Negocio Duras

1. **Firma Criptográfica Segura:** Si el endpoint tiene un `secret` configurado, la petición saliente debe incluir la cabecera `X-Webhook-Signature: sha256=<hmac_hex>`, calculada con HMAC-SHA256 sobre el cuerpo exacto del payload JSON.
2. **Cabeceras Estándar:** Cada despacho debe enviar `Content-Type: application/json`, `User-Agent: SistemaMedidores-Webhook-Dispatcher/1.0`, `X-Webhook-Event`, `X-Webhook-Delivery-Id` y `X-Webhook-Timestamp`.
3. **Resiliencia Operativa (Fail-Safe):** La falla o demora en la respuesta de un webhook no debe interrumpir, bloquear ni revertir la transacción de negocio que originó el evento.
4. **Timeout Estricto:** Cada petición HTTP hacia un webhook debe tener un timeout máximo de 5000 ms implementado con `AbortController`.
5. **Filtrado por Eventos:** Un endpoint solo recibe eventos a los que está suscrito (o todos si contiene `*`).
6. **Trazabilidad de Entregas:** Toda tentativa de entrega (exitosa o fallida) debe persistirse en `WebhookEntrega` con código HTTP, duración y mensaje de error si existió.
7. **Restricción RBAC:** La administración de webhooks y el desencadenamiento manual de tests de webhook queda reservada al rol `ADMIN`.

---

## 5. Criterios de Aceptación (Suite de Pruebas TDD)

- [ ] **CA-01:** Creación, lectura, actualización y eliminación de `WebhookEndpoint` por un usuario `ADMIN`.
- [ ] **CA-02:** Rechazo de acceso a usuarios `OPERADOR` o `SUPERVISOR` para modificar webhooks (HTTP 403 Forbidden).
- [ ] **CA-03:** Cálculo exacto de firma HMAC-SHA256 verificable con la cabecera `X-Webhook-Signature`.
- [ ] **CA-04:** El despachador envía solicitudes a todos los webhooks activos suscritos al evento emitido.
- [ ] **CA-05:** Los webhooks inactivos o no suscritos a dicho evento no reciben la petición.
- [ ] **CA-06:** Ante un fallo del servidor receptor (ej: HTTP 500 o timeout de red), el despachador registra `exitoso = false`, guarda el error y no lanza excepción que interrumpa el flujo del llamador.
- [ ] **CA-07:** La ejecución de `evaluarReglas()` en `AlertasService` dispara automáticamente eventos `alerta.incidente_detectado` a los webhooks suscritos.
- [ ] **CA-08:** La resolución de un incidente en `AlertasService` dispara el evento `alerta.incidente_resuelto`.
- [ ] **CA-09:** El endpoint `POST /api/webhooks/:id/test` emite un payload de prueba y retorna el resultado de la conexión.
- [ ] **CA-10:** Verificación completa del Quality Gate determinista (`./scripts/verify.sh`) con código de salida 0.
