# Spec: Endurecimiento Operacional, Concurrencia y Resiliencia de Producción (Hito 12)

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias e integración que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Blindar la base de datos (SQLite WAL, busy timeout, foreign keys y hot backup con auditoría), el servidor HTTP (graceful shutdown ante SIGTERM/SIGINT, cabeceras seguras con Helmet y validación Zod) y el cliente PWA (backoff exponencial con jitter en SyncManager, captura global de 401 por expiración de sesión y estados de recuperación en UI).
- **Archivos editables autorizados:**
  - `package.json` (dependencia `@fastify/helmet`)
  - `src/core/database.ts` (nuevo: configuración de pragmas SQLite y backup caliente)
  - `src/core/config.ts` (opcional: variable BACKUP_DIR con valor por defecto seguro)
  - `src/server.ts` (inicialización de pragmas, helmet, endpoint `/api/admin/backup`, validación Zod en endpoints complementarios)
  - `src/index.ts` (manejo de señales SIGINT/SIGTERM para graceful shutdown)
  - `public/js/sync-manager.js` (algoritmo de retroceso exponencial con jitter)
  - `public/js/api.js` (intercepción de 401 y disparo de evento de expiración de sesión)
  - `public/js/components.js` y/o `public/app.js` (manejador de expiración de sesión y componente de error con reintento)
  - `tests/core/database.test.ts` (pruebas de pragmas y backup)
  - `tests/core/concurrencia.test.ts` (pruebas de estrés de escritura y lectura concurrente)
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `docs/adr/*` (inmutables una vez creados)
  - `src/modules/*` excepto llamadas coordinadas a repositorios/servicios existentes

---

## 2. Contratos Funcionales de Datos (Zod Schemas)

### A. Contrato de Respaldo en Caliente (Hot Backup DTO)
```typescript
import { z } from "zod";

export const BackupRequestSchema = z.object({
  nombreArchivo: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_\-\.]+$/, "Nombre de archivo inválido")
    .optional(),
});

export type BackupRequest = z.infer<typeof BackupRequestSchema>;

export const BackupResponseSchema = z.object({
  status: z.literal("ok"),
  archivo: z.string(),
  rutaAbsoluta: z.string(),
  tamanoBytes: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
});

export type BackupResponse = z.infer<typeof BackupResponseSchema>;
```

### B. Contrato de Validación de Parámetros Complementarios
```typescript
export const LecturasRecientesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
```

---

## 3. Catálogo de Errores de Dominio Tipados

```typescript
import { DomainError } from "../../core/errors";

export class BackupError extends DomainError {
  readonly code = "BACKUP_FAILED";
  readonly statusCode = 500;

  constructor(motivo: string, detalles?: unknown) {
    super(`Fallo al generar respaldo en caliente de la base de datos: ${motivo}`, detalles);
  }
}
```

---

## 4. Criterios de Aceptación e Invariantes

### Fase 1: SQLite, Concurrencia y Backup
1. **Pragmas SQLite:** Al instanciar o arrancar el servidor con Prisma, se debe verificar que:
   - `journal_mode` es `wal`.
   - `busy_timeout` es de al menos 5.000 ms.
   - `foreign_keys` está habilitado (`ON`).
   - `synchronous` está fijado en `NORMAL`.
2. **Hot Backup (`POST /api/admin/backup`):**
   - Requiere autenticación y rol `ADMIN`.
   - Ejecuta `VACUUM INTO` hacia un archivo con marca de tiempo UTC en el directorio de backups (ej: `./backups/backup-YYYY-MM-DD-HHmmss.db`).
   - Registra de forma transaccional o coordinada un evento en `AuditoriaEvento` (`accion: "BACKUP_SISTEMA"`, `entidad: "SISTEMA"`, `detalles` con ruta y bytes generados).
   - Retorna HTTP 200 con el esquema `BackupResponseSchema`.

### Fase 2: Servidor, Graceful Shutdown y Seguridad
3. **Graceful Shutdown:**
   - La aplicación en `src/index.ts` debe registrar listeners para `SIGTERM` y `SIGINT`.
   - Ante la señal, ejecuta `await app.close()` y luego `await prisma.$disconnect()`.
   - Previene salida abrupta permitiendo drenar peticiones activas.
4. **Cabeceras de Seguridad HTTP:**
   - Registro de `@fastify/helmet` con CSP configurada para permitir scripts locales y tipografías externas necesarias para la PWA, impidiendo clickjacking e inyección de contenido no autorizado.
5. **Validación Zod en Endpoints de Servidor:**
   - Todo parámetro en endpoints montados en `src/server.ts` (como `/api/lecturas/recientes?limit=...`) debe validarse mediante `LecturasRecientesQuerySchema`.

### Fase 3: Frontend PWA y Resiliencia
6. **Backoff Exponencial en `SyncManager`:**
   - Si la llamada a `/api/lecturas/batch-sync` falla por error de red o de servidor (5xx / 429), la cola no debe reintentarse en un bucle cerrado inmediato.
   - Debe calcularse el tiempo de espera: `delay = Math.min(60000, 2000 * Math.pow(2, intentos)) * (1 + (Math.random() * 0.3 - 0.15))`.
   - Actualizar el estado visual de la UI para reflejar el estado de reconexión/reintento programado.
7. **Manejo Global de 401 en `ApiClient`:**
   - Si cualquier petición HTTP responde 401 Unauthorized, `ApiClient` debe invocar `clearToken()`, disparar el evento `window.dispatchEvent(new CustomEvent('medidores:session-expired'))` y emitir una alerta visible al usuario indicando expiración de sesión.
   - La interfaz debe abrir el modal de login de forma amigable.
8. **Componente de Error con Reintento:**
   - Proveer helper en `components.js` (`renderErrorState(container, message, onRetry)`) con diseño Aurora (icono, texto explicativo y botón interactivo "Reintentar").

### Fase 4: Validación de Estrés y Quality Gate
9. **Suite de Pruebas de Concurrencia:**
   - Test con al menos 20 peticiones concurrentes de inserción y lectura simultáneas sin arrojar `SQLITE_BUSY`.
10. **Quality Gate:**
    - `./scripts/verify.sh` debe finalizar exitosamente con código `0`.
