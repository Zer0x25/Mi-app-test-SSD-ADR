# ADR 0005: Despacho Estandarizado de Notificaciones y Eventos de Alerta vía Webhooks

- **Fecha:** 2026-10-03
- **Estado:** Aceptado
- **Afecta a:** Módulo Alertas, Módulo Mantenimiento, Servidor HTTP, Base de Datos (Prisma), Nuevo Módulo Webhooks

---

## 1. Contexto y Problema

El sistema **Medidores** genera eventos críticos de telemetría y metrología:
1. **Incidentes de consumo:** Fugas continuas (`FUGA_PROBABLE`), saltos atípicos (`SALTO_CONSUMO`) y anomalías de reporte (`SIN_REPORTE`).
2. **Ciclo de vida de alertas:** Apertura, revisión y resolución de incidentes.
3. **Mantenimiento metrológico:** Aviso preventivo para medidores con fecha de calibración periódica próxima a vencer (≤ 30 días) o vencida.

Para notificar al personal técnico y de operaciones, implementar conectores directos a canales propietarios individuales (ej. clientes de Slack, bots de Telegram, envíos SMTP de Email, SMS Twilio) introduce acoplamiento indebido, sobrecarga de dependencias de terceros y duplicación de reglas de distribución.

Para mantener una arquitectura limpia y estandarizada, se requiere desacoplar el origen del evento de su entrega final, delegando la distribución a un enrutador unificado (ej. router de mensajería `mismapp` u homólogo externo).

---

## 2. Decisión

Se decide implementar una **arquitectura de despacho saliente Webhook-First**:

### 2.1. Contrato de Eventos y Payload Estándar
Todo evento despachado hacia el exterior utilizará la siguiente estructura JSON inmutable:
```json
{
  "id": "uuid-v4-del-evento",
  "event": "alerta.incidente_detectado",
  "timestamp": "2026-10-03T18:50:00.000Z",
  "severity": "CRITICAL",
  "title": "Fuga continua detectada en Medidor AGUA-01",
  "message": "Posible fuga continua o flujo ininterrumpido en medidor...",
  "data": {
    "incidenteId": "...",
    "medidorId": "...",
    "medidorCodigo": "AGUA-01",
    "instalacionNombre": "Sede Central",
    "tipo": "FUGA_PROBABLE",
    "valorDetectado": 154.2
  }
}
```

### 2.2. Seguridad y Firma Criptográfica (HMAC-SHA256)
Para asegurar autenticidad, integridad y evitar suplantación en el receptor:
- Cada endpoint de webhook registrado puede contar con un secreto compartido (`secret`).
- El despachador calculará la firma HMAC-SHA256 del cuerpo JSON crudo.
- Cabeceras HTTP emitidas en cada solicitud:
  - `Content-Type: application/json`
  - `User-Agent: SistemaMedidores-Webhook-Dispatcher/1.0`
  - `X-Webhook-Event: <nombre_evento>`
  - `X-Webhook-Delivery-Id: <uuid_entrega>`
  - `X-Webhook-Timestamp: <iso_timestamp>`
  - `X-Webhook-Signature: sha256=<hex_hmac>` (si existe secreto)

### 2.3. Persistencia de Endpoints y Registro de Entregas
Se añaden dos modelos en `prisma/schema.prisma`:
- `WebhookEndpoint`: Almacena la URL destino, descripción, secreto de firma, filtros de eventos suscritos y estado activo.
- `WebhookEntrega`: Pista de trazabilidad de las peticiones salientes con código HTTP recibido, duración en milisegundos, éxito/fallo y mensaje de error si existió.

### 2.4. Resiliencia, Aislamiento y No-Bloqueo (Fail-Safe)
- El despacho de webhooks es **asíncrono y tolerante a fallos**: si el endpoint receptor no responde, se cae o retorna error HTTP 5xx/4xx, **jamás** se interrumpe ni se revierte la transacción de negocio principal (ej: el registro de lectura o la creación del incidente).
- Cada envío HTTP utiliza un timeout estricto (5000 ms) gestionado mediante `AbortController`.
- Los despachos a múltiples endpoints se ejecutan en paralelo con `Promise.allSettled`.

### 2.5. Diagnóstico y Prueba Inmediata (`test.ping`)
- Se habilita un endpoint administrativo (`POST /api/webhooks/:id/test`) para disparar un ping sintético al receptor y validar conectividad y tiempo de respuesta sin requerir que ocurra un incidente real.

---

## 3. Consecuencias

### Positivas
- Desacoplamiento total entre el sistema Medidores y los canales de mensajería (Slack, Discord, Email, SMS).
- Estandarización unificada con `mismapp` router para orquestar destinatarios y canales.
- Auditoría y trazabilidad completa de cada entrega saliente con latencias y códigos HTTP.
- Máxima resiliencia operativa: fallos en receptores no degradan el registro de lecturas ni la evaluación de alertas.

### Negativas / Mitigaciones
- El sistema receptor debe procesar idempotentemente los eventos si existiesen reintentos (se mitiga incluyendo el campo `id` único de evento).
