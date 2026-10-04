# ADR 0008: Notificaciones Push (Web Push API) y Alertas Multicanal por Telegram

- **Fecha:** 2026-10-03
- **Estado:** Aceptado
- **Afecta a:** Módulo Alertas, Módulo Usuarios, Servidor HTTP, Base de Datos (Prisma), PWA Service Worker (`public/sw.js`), Nuevo Módulo Notificaciones

---

## 1. Contexto y Problema

El sistema **Medidores** genera alertas operativas y metrológicas críticas:
1. **Detección temprana de anomalías:** Probabilidad de fuga continua (`FUGA_PROBABLE`), saltos atípicos de consumo (`SALTO_CONSUMO > 50%`) y medidores sin transmisión reciente (`SIN_REPORTE > 48h`).
2. **Alertas de mantenimiento metrológico:** Vencimiento inminente de calibraciones y precintos alterados.
3. **Excepciones críticas de runtime:** Errores de servidor HTTP 5xx que comprometen la telemetría.

Actualmente, el sistema despacha eventos hacia sistemas externos mediante Webhooks HTTP (ADR 0005). Sin embargo, los operadores en terreno y los supervisores no interactúan directamente con endpoints de API ni mantienen abierta la consola administrativa de forma ininterrumpida. 

Para lograr tiempos de respuesta inmediatos ante fallas o fugas graves, se requiere alertar directamente a las personas a través de dos canales en tiempo real:
- **Telegram Bot:** Entrega inmediata en smartphones/desktops a canales o chats de técnicos y supervisores sin requerir instalación de software corporativo especial.
- **Web Push API (W3C / RFC 8291 / RFC 8292):** Notificaciones emergentes nativas en el sistema operativo mediante el Service Worker de la PWA, incluso si el navegador está cerrado o la aplicación en segundo plano.

---

## 2. Decisión

Se decide implementar un módulo centralizado y desacoplado de **Notificaciones Multicanal** (`src/modules/notificaciones`):

### 2.1. Arquitectura Multicanal

```
                          ┌───> Webhooks (ADR 0005: Sistemas Externos)
                          │
  [Motor de Alertas] ─────┼───> [Notificaciones Service] (Fail-Safe / allSettled)
  [Error Handler 5xx]     │         │
                          │         ├───> Telegram Dispatcher (Native fetch)
                          │         │         └──> Telegram Bot API (/sendMessage)
                          │         │
                          │         └───> Web Push Dispatcher (VAPID / RFC 8292)
                          │                   └──> Browser Push Services (SW push event)
```

### 2.2. Canal Telegram (100% Nativo)
- Se implementa mediante el cliente HTTP nativo (`fetch` de Node.js) con timeout estricto de 5000 ms controlado por `AbortController`.
- **Cero dependencias externas:** No requiere librerías propietarias de Telegram; interactúa directamente con `https://api.telegram.org/bot<TOKEN>/sendMessage`.
- **Formato:** Mensajes en formato HTML con diseño limpio, severidad tipada con emojis semánticos (🚨 CRITICAL, ⚠️ WARNING, ℹ️ INFO), código de medidor, sede afectada, valor anómalo y timestamp.
- **Variables de configuración:** `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` (opcionales en `src/core/config.ts`). Si no están configuradas, el canal se omite silenciosamente sin arrojar error.
- **Diagnóstico:** Endpoint `POST /api/notificaciones/telegram/test` para enviar mensaje sintético de verificación.

### 2.3. Canal Web Push (W3C Push API & VAPID)
- Se adopta la librería estándar `web-push` para la gestión criptográfica de firmas VAPID (RFC 8292) y cifrado de payload ECDH P-256 (RFC 8291).
- **Justificación de Dependencia:** `web-push` y `@types/web-push` proporcionan la implementación de referencia auditada para la generación de claves y cifrado del estándar Web Push, evitando la fragilidad de recrear manualmente el envelope binario RFC 8291 en `node:crypto`.
- **Claves VAPID:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` configuradas en `src/core/config.ts`. Si faltan en desarrollo/test, se generan claves efímeras seguras en memoria para no romper entornos locales o de pruebas.
- **Suscripciones de Usuario:** Modelo `SuscripcionPush` en base de datos para almacenar `endpoint`, claves criptográficas `p256dh` y `auth`, asociadas opcionalmente al `usuarioId`.
- **Endpoints:**
  - `GET /api/notificaciones/vapid-public-key`: Exposición de la clave pública para que el navegador cree la suscripción con `pushManager.subscribe()`.
  - `POST /api/notificaciones/push/subscribe`: Registro o actualización de la suscripción del navegador.
  - `POST /api/notificaciones/push/unsubscribe`: Eliminación lógica o física de la suscripción.
  - `POST /api/notificaciones/push/test`: Envío sintético de notificación de prueba al usuario actual.

### 2.4. Service Worker PWA (`public/sw.js`)
- Se implementan los controladores de eventos `push` y `notificationclick` en el Service Worker.
- El evento `push` decodifica el payload JSON `{ title, body, icon, badge, data }` y dispara `self.registration.showNotification()`.
- El evento `notificationclick` enfoca la ventana abierta de la aplicación o navega hacia la ruta correspondiente (ej. pestaña `#alertas`).

### 2.5. Resiliencia, Aislamiento y No-Bloqueo (Fail-Safe)
- Todo despacho saliente a Telegram y Web Push se ejecuta de forma asíncrona mediante `Promise.allSettled`.
- La indisponibilidad de la API de Telegram, la expiración de un endpoint de Web Push (HTTP 404/410 Gone) o la lentitud de red **jamás interrumpirán ni demorarán** las operaciones de negocio (ingesta de lecturas, cambios de estado en incidentes, autenticación).
- Ante respuestas HTTP 410 o 404 en Web Push, la suscripción se marca automáticamente como inactiva o se purga de la base de datos para evitar envíos futuros infructuosos.
- Bitácora inmutable de despachos (`NotificacionHistorial`) para auditar canal, destinatario, evento, estado de entrega, duración y errores.

---

## 3. Consecuencias

### Positivas
- Notificación instantánea en tiempo real a humanos (operadores y supervisores) sin depender de que tengan la pantalla del panel abierta.
- Soporte nativo de notificaciones Push en teléfonos móviles (Android/iOS) y laptops a través de la PWA ya existente.
- Canal de contingencia mediante Telegram que no requiere credenciales de usuario ni apertura del navegador.
- Totalmente desacoplado y tolerante a fallos: los fallos externos no degradan el sistema central.

### Negativas / Mitigaciones
- Adición de `web-push` al `package.json` (justificada formalmente en este ADR por seguridad y estandarización criptográfica).
- Se requiere que el usuario otorgue permisos de notificación en el navegador (`Notification.requestPermission()`). Si los deniega, el sistema opera con normalidad y el canal Telegram permanece activo.
