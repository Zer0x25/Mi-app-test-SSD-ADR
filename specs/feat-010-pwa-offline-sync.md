# Spec: feat-010 Modo Offline y PWA para Captura en Terreno

> **Instrucción para el Agente:** Este documento es un contrato cerrado bajo la metodología Spec-Driven Development (SDD) y Agentic TDD. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación.

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Dotar a la aplicación de capacidades PWA (Progressive Web App) y sincronización resiliente fuera de línea (Offline-First) para operadores de medidores en terreno sin cobertura de red. Permite capturar lecturas localmente en sótanos/zonas remotas, almacenarlas de forma segura en el cliente, y sincronizarlas de forma atómica o en lote mediante un endpoint dedicado (`POST /api/lecturas/batch-sync`) al restablecerse la conectividad.
- **Archivos editables autorizados:**
  - `src/modules/lecturas/lecturas.schema.ts`
  - `src/modules/lecturas/lecturas.service.ts`
  - `src/modules/lecturas/lecturas.controller.ts`
  - `tests/modules/lecturas/lecturas.service.test.ts`
  - `tests/modules/lecturas/lecturas.controller.test.ts`
  - `public/manifest.webmanifest`
  - `public/sw.js`
  - `public/js/sync-manager.js`
  - `public/js/api.js`
  - `public/index.html`
  - `public/app.js`
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/core/*`
  - `docs/adr/*`
  - Todo archivo fuera de las rutas explícitamente autorizadas arriba.

---

## 2. Contrato Funcional de Datos (Zod Schemas)

### A. Contrato de Entrada (Batch Sync Input DTO)
```typescript
import { z } from "zod";

export const BatchSyncItemSchema = z.object({
  localId: z.string().min(1, "localId requerido para trazabilidad local"),
  medidorId: z.string().uuid("Identificador de medidor inválido"),
  operadorId: z.string().uuid("Identificador de operador inválido"),
  valor: z.number().nonnegative("El valor no puede ser negativo"),
  fechaLectura: z.union([z.string().datetime(), z.date()]).optional(),
  notas: z.string().trim().max(255).optional(),
});

export const BatchSyncLecturasInputSchema = z.object({
  lecturas: z
    .array(BatchSyncItemSchema)
    .min(1, "Debe enviar al menos una lectura para sincronizar"),
});

export type BatchSyncItem = z.infer<typeof BatchSyncItemSchema>;
export type BatchSyncLecturasInput = z.infer<typeof BatchSyncLecturasInputSchema>;
```

### B. Contrato de Salida (Batch Sync Output DTO)
```typescript
import { z } from "zod";
import { LecturaResponseSchema } from "./lecturas.schema.js";

export const BatchSyncResultItemSchema = z.object({
  localId: z.string(),
  status: z.enum(["SYNCED", "REJECTED"]),
  lectura: LecturaResponseSchema.optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.any().optional(),
    })
    .optional(),
});

export const BatchSyncLecturasResponseSchema = z.object({
  total: z.number(),
  syncedCount: z.number(),
  rejectedCount: z.number(),
  results: z.array(BatchSyncResultItemSchema),
});

export type BatchSyncResultItem = z.infer<typeof BatchSyncResultItemSchema>;
export type BatchSyncLecturasResponse = z.infer<typeof BatchSyncLecturasResponseSchema>;
```

---

## 3. Catálogo de Errores y Comportamiento del Lote

El endpoint de sincronización en lote no falla con error HTTP global 4xx/5xx si una o varias lecturas individuales violan invariantes (como `LECTURA_DECRECIENTE_PROHIBIDA`). En su lugar:
1. Retorna siempre **HTTP 200 OK** con la estructura `BatchSyncLecturasResponse`.
2. Para cada lectura del lote:
   - Si cumple todas las invariantes: `status: "SYNCED"`, `lectura: LecturaResponse`.
   - Si viola una invariante: `status: "REJECTED"`, `error: { code: DomainErrorCode, message, details }`.
3. Esto permite que las lecturas válidas queden efectivamente registradas en base de datos sin ser bloqueadas por una lectura errónea, mientras que el cliente puede descartar de la cola local las aceptadas y alertar al operador sobre las rechazadas.

---

## 4. Invariantes del Negocio

### A. Invariantes Positivas (Garantías)
1. **Orden Cronológico en Lote:** Si en un mismo lote se envían múltiples lecturas para un mismo medidor, el servicio debe ordenarlas ascendentemente por `fechaLectura` antes de validarlas y persistirlas secuencialmente.
2. **Resiliencia Offline:** El frontend debe permitir el registro de una lectura aún cuando `navigator.onLine === false` o cuando la petición de red lance una excepción de conexión (`Failed to fetch`).
3. **Idempotencia y Trazabilidad:** Cada lectura encolada tiene un `localId` único. El cliente no duplica ítems si la sincronización se interrumpe a mitad de camino.
4. **Disponibilidad de Shell de Aplicación:** El Service Worker (`sw.js`) debe cachear los recursos estáticos esenciales (`/`, `/index.html`, `/app.css`, `/app.js`, `/css/*`, `/js/*`, `/manifest.webmanifest`) para permitir abrir la interfaz sin conectividad.

### B. Invariantes Negativas (Prohibiciones Duras)
1. **Prohibido eludir las Invariantes de Dominio:** Ninguna lectura offline sincronizada puede saltarse las validaciones de medidor inactivo, fechas futuras, operador no autorizado o lecturas decrecientes en medidores acumulativos.
2. **Prohibido cachear peticiones mutantes en Service Worker:** Las peticiones `POST`, `PATCH`, `PUT` y `DELETE` jamás deben ser interceptadas con `cache.put()` en el Service Worker. La gestión de cola offline es responsabilidad de la capa de aplicación (`SyncManager`).

---

## 5. Arquitectura Frontend PWA & SyncManager

1. **`public/manifest.webmanifest`**:
   - Nombre: `Sistema Medidores - Control Metrológico`
   - Nombre corto: `Medidores`
   - Display: `standalone`
   - Theme color: `#0ea5e9` (Cian Aurora)
   - Background color: `#0f172a` (Modo oscuro Aurora)
2. **`public/sw.js`**:
   - Estrategia de cache: Cache-First para assets estáticos con versionado `medidores-v1`.
   - Bypass transparente para llamadas a `/api/*`.
3. **`public/js/sync-manager.js`**:
   - Módulo desacoplado `SyncManager`.
   - Almacena en `localStorage` (clave `medidores_offline_queue`) los registros con `localId`, payload, timestamp local y estado `PENDING`.
   - Escucha los eventos globales `online` y `offline` para alternar el indicador de estado en la barra superior.
   - Al recuperar conexión, despacha automáticamente la sincronización en lote invocando `api.lecturas.sincronizarLote(...)`.
   - Si la sincronización es exitosa, notifica vía `window.Toast` y actualiza la vista.

---

## 6. Criterios de Aceptación (Definition of Done)

- [ ] **Tests de Esquemas (Zod):**
  - [ ] Validación de `BatchSyncLecturasInputSchema` (rechaza lotes vacíos o campos inválidos).
- [ ] **Tests de Servicio (Vitest / Agentic TDD):**
  - [ ] Sincronización exitosa de lote con múltiples lecturas ordenadas cronológicamente.
  - [ ] Procesamiento parcial: lecturas válidas pasan a `SYNCED` y lecturas con retroceso pasan a `REJECTED` con error tipado.
- [ ] **Tests de Controlador HTTP (Fastify Inject):**
  - [ ] `POST /api/lecturas/batch-sync` responde 200 OK con el reporte estructurado de `syncedCount` y `rejectedCount`.
- [ ] **Integración Frontend:**
  - [ ] Service Worker registrado en `index.html`.
  - [ ] Badge visual en Aurora UI indicando "En línea" / "Sin conexión" y contador de lecturas pendientes.
  - [ ] Botón de sincronización manual para el operador.
- [ ] **Quality Gate Determinista:**
  - [ ] `./scripts/verify.sh` superado con código de salida 0.
