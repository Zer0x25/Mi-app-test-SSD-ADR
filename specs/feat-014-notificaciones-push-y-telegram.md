# Spec: Notificaciones Push (Web Push API) y Alertas por Telegram (Hito 11)

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Implementar el módulo centralizado de Notificaciones Multicanal para humanos ante eventos críticos (anomalías de telemetría `FUGA_PROBABLE`, `SALTO_CONSUMO`, `SIN_REPORTE`, incidencias resueltas y fallos 5xx críticos). Incluye:
  1. Despachador de Telegram Bot (HTTP nativo con timeout y formato enriquecido).
  2. Despachador de Web Push (W3C Push API / RFC 8292 VAPID) con soporte en Service Worker (`public/sw.js`).
  3. Gestión de suscripciones Push por usuario/navegador (`SuscripcionPush`).
  4. Bitácora inmutable de despachos (`NotificacionHistorial`).
  5. Despacho fail-safe asíncrono (`Promise.allSettled`, timeout 5000 ms) sin bloqueo de transacciones principales.
  6. Panel de gestión y pruebas en la interfaz web (suscripción Push en un clic y diagnóstico de Telegram).
- **Archivos editables autorizados:**
  - `package.json`
  - `prisma/schema.prisma`
  - `src/core/config.ts`
  - `.env.example`
  - `src/server.ts`
  - `src/modules/notificaciones/notificaciones.schema.ts`
  - `src/modules/notificaciones/notificaciones.repository.ts`
  - `src/modules/notificaciones/notificaciones.service.ts`
  - `src/modules/notificaciones/notificaciones.controller.ts`
  - `src/modules/alertas/alertas.service.ts`
  - `tests/modules/notificaciones/notificaciones.service.test.ts`
  - `tests/modules/notificaciones/notificaciones.controller.test.ts`
  - `public/sw.js`
  - `public/index.html`
  - `public/app.js`
  - `public/js/api.js`
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/core/errors.ts`
  - `docs/adr/*` (inmutables una vez aceptados)

---

## 2. Contrato Funcional de Datos (Zod Schemas)

### A. Tipos de Canales y Eventos
```typescript
export const CanalNotificacionTypes = ["TELEGRAM", "WEB_PUSH"] as const;
export type CanalNotificacionType = (typeof CanalNotificacionTypes)[number];

export const NotificacionEventTypes = [
  "alerta.incidente_detectado",
  "alerta.incidente_resuelto",
  "sistema.error_critico",
  "notificacion.test",
] as const;
export type NotificacionEventType = (typeof NotificacionEventTypes)[number];

export interface NotificacionMensaje {
  evento: NotificacionEventType;
  severidad: "INFO" | "WARNING" | "CRITICAL";
  titulo: string;
  mensaje: string;
  datos?: Record<string, unknown>;
  url?: string;
}
```

### B. Contratos de Entrada (Input DTOs)
```typescript
export const SuscripcionPushSchema = z.object({
  endpoint: z.string().url("Endpoint de suscripción debe ser una URL válida"),
  keys: z.object({
    p256dh: z.string().min(1, "Clave p256dh requerida"),
    auth: z.string().min(1, "Clave auth requerida"),
  }),
});
export type SuscripcionPushDTO = z.infer<typeof SuscripcionPushSchema>;

export const DesuscripcionPushSchema = z.object({
  endpoint: z.string().url("Endpoint requerido para desuscribir"),
});
export type DesuscripcionPushDTO = z.infer<typeof DesuscripcionPushSchema>;

export const TelegramTestSchema = z.object({
  chatId: z.string().optional(),
  mensaje: z.string().default("Mensaje de prueba desde Sistema Medidores"),
});
export type TelegramTestDTO = z.infer<typeof TelegramTestSchema>;
```

### C. Contratos de Salida (Output DTOs)
```typescript
export const VapidPublicKeyResponseSchema = z.object({
  publicKey: z.string().min(1),
});

export const NotificacionHistorialItemSchema = z.object({
  id: z.string().uuid(),
  canal: z.enum(CanalNotificacionTypes),
  destinatario: z.string(),
  evento: z.string(),
  severidad: z.string(),
  titulo: z.string(),
  exitoso: z.boolean(),
  statusCode: z.number().nullable(),
  error: z.string().nullable(),
  duracionMs: z.number().nullable(),
  createdAt: z.date(),
});
export type NotificacionHistorialItem = z.infer<typeof NotificacionHistorialItemSchema>;
```

---

## 3. Criterios de Aceptación (Acceptance Criteria)

- **CA-1: Gestión de Suscripciones Web Push (PWA)**
  - `GET /api/notificaciones/vapid-public-key` retorna la clave pública VAPID en base64url.
  - `POST /api/notificaciones/push/subscribe` recibe `endpoint`, `keys.p256dh` y `keys.auth`, persistiendo o reactivando la suscripción asociada al usuario autenticado.
  - `POST /api/notificaciones/push/unsubscribe` desactiva o elimina la suscripción del endpoint.
  - El Service Worker (`public/sw.js`) captura el evento `push`, desencadena `showNotification`, y en `notificationclick` enfoca o abre la aplicación.

- **CA-2: Despachador de Telegram Bot (Nativo)**
  - Si `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` están configurados, el despachador realiza un `fetch` hacia `https://api.telegram.org/bot<TOKEN>/sendMessage`.
  - El mensaje se envía en formato HTML con título en negrita, severidad destacada con emojis semánticos y detalles clave.
  - Si las credenciales no están configuradas, el canal se salta sin lanzar excepción (`TELEGRAM_DISABLED`).
  - Endpoint de prueba `POST /api/notificaciones/telegram/test` permite validar la integración en vivo y retorna el estado de entrega.

- **CA-3: Despacho Asíncrono Fail-Safe y Aislamiento**
  - Todas las notificaciones a Telegram y Web Push se ejecutan concurrentemente con `Promise.allSettled`.
  - Cada petición individual utiliza un timeout de 5000 ms con `AbortController`.
  - Un error en Telegram o un fallo en Web Push (ej. endpoint 410 Gone de navegador) jamás interrumpe ni retrasa la creación de alertas, lecturas ni respuestas HTTP al usuario.
  - Si un endpoint de Web Push retorna HTTP 404 o 410 (Gone), la suscripción se desactiva automáticamente en la base de datos.

- **CA-4: Bitácora Inmutable de Envíos (`NotificacionHistorial`)**
  - Cada intento de notificación (exitoso o fallido) registra: canal (`TELEGRAM` o `WEB_PUSH`), destinatario (chatId o endpoint abreviado), evento, severidad, título, éxito (`true`/`false`), `statusCode`, `duracionMs` y detalle de error si existió.
  - `GET /api/notificaciones/historial` expone los últimos registros para inspección administrativa (rol `ADMIN` o `SUPERVISOR`).

- **CA-5: Integración Automática con Detección de Incidentes**
  - Cuando `AlertasService.evaluarReglas` detecta una anomalía de severidad `WARNING` o `CRITICAL` (`FUGA_PROBABLE`, `SALTO_CONSUMO`), se invoca de forma fail-safe `notificacionesService.despacharNotificacion({ evento: "alerta.incidente_detectado", ... })`.
  - Cuando un incidente se resuelve (`AlertasService.resolverIncidente`), se despacha la notificación de resolución.

- **CA-6: Interfaz Gráfica y Controles de Usuario**
  - Panel o sección en la aplicación para activar/desactivar notificaciones Web Push en el navegador actual mediante `Notification.requestPermission()`.
  - Botón para disparar notificación Push de prueba.
  - Botón para disparar mensaje de prueba por Telegram.
  - Visor de historial reciente de notificaciones despachadas.

---

## 4. Invariantes de Calidad y Gobernanza

1. **Alineación con AGENTS.md:**
   - Cumplimiento de regla 4 (Errores de dominio tipados si aplica).
   - Cumplimiento de regla 5 (Configuración centralizada en `src/core/config.ts` y `.env.example`).
   - Cumplimiento de regla 7 (Quality Gate determinista 0 en `./scripts/verify.sh`).
   - Cumplimiento de regla 13 (Aislamiento fail-safe de integraciones salientes).
2. **Dependencias:**
   - Adición justificada de `web-push` y `@types/web-push` en `package.json` para cifrado VAPID RFC 8292. Telegram permanece 100% nativo sin dependencias externas.
