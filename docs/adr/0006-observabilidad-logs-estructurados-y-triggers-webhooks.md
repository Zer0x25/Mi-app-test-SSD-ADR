# ADR 0006: Observabilidad con Logs Estructurados (Pino) y Triggers de Webhooks ante Errores Críticos

- **Fecha:** 2026-10-03
- **Estado:** Aceptado
- **Afecta a:** Servidor HTTP (`src/server.ts`), Módulo Webhooks (`src/modules/webhooks/`), Configuración (`src/core/config.ts`), Error Handler Central
- **Relacionado con:** ADR 0001 (Arquitectura Base), ADR 0004 (Seguridad y Auditoría), ADR 0005 (Webhooks Salientes)

---

## 1. Contexto y Problema

El sistema **Medidores** procesa ingesta continua de lecturas, cálculos de desvío, validaciones de seguridad (RBAC) y mantenimiento metrológico. En entornos productivos y de pre-producción (Docker / Staging / Prod):
1. Se requiere **visibilidad operativa en tiempo real** del comportamiento de los servicios y del ciclo de vida de las peticiones HTTP sin degradar el rendimiento del bucle de eventos (*Event Loop*).
2. Cuando ocurre una falla no controlada del sistema (excepciones de runtime, fallos inesperados de persistencia SQLite/ORM, errores HTTP 500), el equipo de operaciones o guardia necesita ser notificado de inmediato en los canales correspondientes sin depender de inspección manual de consolas.
3. Para evitar sobrecargar la aplicación con dependencias pesadas de terceros (agentes APM o SaaS propietarios como Sentry, Datadog o New Relic), el sistema debe apegarse al principio de **no reinventar la rueda** aprovechando las capacidades nativas de Fastify y la infraestructura saliente de Webhooks hacia el enrutador corporativo (`mismapp`).

---

## 2. Decisión

Se adopta una estrategia de **Observabilidad Integrada y Basada en Eventos**:

### 2.1. Logs Estructurados Nativos con Pino en Fastify
- Se activa el logger nativo de Fastify (basado en **Pino**, el logger JSON de más alto rendimiento en Node.js).
- Cumplimiento estricto con el principio de *Twelve-Factor App* (Logs como flujo de eventos): los logs estructurados se emiten exclusivamente a `stdout` en formato JSON, permitiendo su recolección natural por Docker (`docker logs`), fluentd, Loki o el daemon del host.
- **Configuración por Entorno:**
  - En `production`, `staging` y `development`, el logger se inicializa con el nivel configurado en `config.LOG_LEVEL` (por defecto `info`).
  - En entorno de pruebas unitarias/integración (`test`), el logger se deshabilita por defecto (`logger: false`) para mantener una salida de consola limpia y determinista en Vitest, pero la fábrica `buildServer({ logger })` permite inyectar opciones de logger para pruebas específicas.

### 2.2. Trazabilidad y Correlación de Peticiones (`reqId`)
- Fastify asigna automáticamente un identificador único por solicitud (`request.id`).
- Todo log emitido en el ciclo de vida de una petición incluye este `reqId`, facilitando la correlación entre la petición del cliente y los eventos internos.

### 2.3. Manejador Central de Errores (`app.setErrorHandler`) y Trigger de Webhooks
Se implementa un manejador global de errores en `src/server.ts` con las siguientes responsabilidades:
1. **Discriminación de Errores:**
   - **Errores de Dominio (4xx):** Si el error hereda de `DomainError` o su código HTTP es menor a 500 (ej. 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Unprocessable), se registra a nivel advertencia/info y se devuelve la respuesta semántica estructurada sin disparar notificaciones de webhook (previniendo fatiga de alertas).
   - **Errores de Servidor Inesperados (5xx):** Si el error es una excepción no controlada (`statusCode >= 500`), se registra inmediatamente en los logs estructurados con nivel `error` incluyendo `stack trace`, `reqId`, `method`, `url` y detalles contextuales.
2. **Trigger Automático a Webhooks (`sistema.error_critico`):**
   - Ante cualquier error HTTP >= 500 capturado por el manejador central, el servidor invoca asíncronamente `webhooksService.despacharEvento(...)` con el nuevo tipo de evento tipado `"sistema.error_critico"`.
   - Payload del evento:
     ```json
     {
       "event": "sistema.error_critico",
       "severity": "CRITICAL",
       "title": "Error Crítico de Servidor en POST /api/...",
       "message": "Mensaje del error no controlado",
       "data": {
         "reqId": "req-1a2b",
         "method": "POST",
         "url": "/api/...",
         "statusCode": 500,
         "errorName": "Error",
         "timestamp": "2026-10-03T19:30:00.000Z"
       }
     }
     ```
3. **Aislamiento y Resiliencia (Fail-Safe):**
   - El despacho del webhook de error crítico se ejecuta con captura interna (`catch(() => {})`), garantizando que un fallo o lentitud en el endpoint receptor de webhooks jamás impida o altere la entrega de la respuesta HTTP 500 al cliente.

---

## 3. Consecuencias

### Positivas
- **Cero dependencias externas:** No requiere instalar librerías adicionales ni pagar suscripciones SaaS; utiliza Pino nativo de Fastify y el despachador de webhooks ya construido en el Hito 9.
- **Detección instantánea de incidentes:** `mismapp` recibe el webhook inmediatamente ante un fallo 500 y puede alertar a los canales de guardia designados (Slack, Telegram, SMS, etc.).
- **Trazabilidad de punta a punta:** El campo `reqId` permite vincular el webhook recibido por el equipo técnico con la línea exacta de log en `stdout`.
- **Sin fatiga de alertas:** Los errores de validación de entrada o permisos (4xx) no disparan webhooks críticos.

### Negativas / Mitigaciones
- Si ocurriese una tormenta masiva de errores 500 simultáneos, el sistema despacharía múltiples eventos de webhook. Esto se mitiga delegando la deduplicación, agregación y *rate limiting* de alertas al enrutador central de mensajería (`mismapp`).
