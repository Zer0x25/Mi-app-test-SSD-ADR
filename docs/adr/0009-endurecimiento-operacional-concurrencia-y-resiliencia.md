# ADR 0009: Endurecimiento Operacional, Concurrencia y Resiliencia de Producción

- **Fecha:** 2026-10-04
- **Estado:** Aceptado
- **Afecta a:** Persistencia (SQLite / Prisma), Servidor HTTP (Fastify, Señales de Proceso, Cabeceras de Seguridad), Frontend PWA (`SyncManager`, `ApiClient`, Aurora UI), Módulo de Administración y Auditoría.

---

## 1. Contexto y Problema

Con la conclusión de los primeros 11 hitos del sistema **Medidores**, la plataforma cuenta con una arquitectura completa de gestión metrológica: autenticación RBAC, conciliación de facturas, detección en vivo de incidentes, empaquetamiento Docker multi-entorno (Dev/Staging/Prod), captura offline en terreno vía PWA, observabilidad estructurada y notificaciones multicanal (Webhooks, Telegram Bot y Web Push W3C).

Sin embargo, ante el despliegue a producción y la operación simultánea de múltiples operadores de campo sincronizando lotes de lecturas, surgen vectores críticos de riesgo operacional:
1. **Contención y Bloqueo en Base de Datos (SQLite Concurrency):** Por defecto, SQLite en modo Rollback Journal bloquea la base de datos completa durante escrituras (`SQLITE_BUSY`), impidiendo lecturas concurrentes de dashboards, reportes o consultas de calibración mientras un operador registra lecturas.
2. **Respaldo sin Detención del Servicio (Zero-Downtime Hot Backup):** Para prevenir pérdida de datos o corrupción por copia física directa de un archivo SQLite abierto, se requiere un mecanismo atómico en caliente que capture el estado de la base de datos sin suspender la ingesta.
3. **Parada Ordenada del Proceso (Graceful Shutdown):** Al actualizar contenedores (`docker compose`) o reiniciar el host mediante señales `SIGTERM`/`SIGINT`, el corte abrupto del runtime Node.js puede abortar transacciones en vuelo o dejar sockets huérfanos.
4. **Cabeceras de Seguridad HTTP:** El servidor requiere endurecimiento perimetral mediante cabeceras HTTP estándar (Content Security Policy adaptada a la PWA, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).
5. **Resiliencia en Frontend & PWA:**
   - La sincronización en terreno (`SyncManager`) debe proteger al servidor y al dispositivo móvil frente a tormentas de reintentos mediante **retroceso exponencial con jitter**.
   - La expiración o revocación de tokens JWT (HTTP 401) debe interceptarse transversalmente para notificar al usuario y permitir la reactivación de credenciales sin perder el contexto de la aplicación.
   - Las vistas deben presentar estados de error informativos con opciones de reintento.

---

## 2. Decisión

Se decide implementar un conjunto integral de medidas de **Endurecimiento Operacional, Concurrencia y Resiliencia de Producción**:

### 2.1. Persistencia y Optimización de Concurrencia SQLite
Se crea un inicializador centralizado de pragmas en `src/core/database.ts`:
- **Modo WAL (`PRAGMA journal_mode = WAL;`):** Write-Ahead Logging desacopla lectores de escritores. Múltiples conexiones pueden leer simultáneamente sin bloquear la escritura y viceversa.
- **Busy Timeout (`PRAGMA busy_timeout = 5000;`):** En lugar de fallar inmediatamente con `SQLITE_BUSY`, SQLite espera hasta 5.000 ms a que finalicen escrituras concurrentes.
- **Integridad Referencial Forzada (`PRAGMA foreign_keys = ON;`):** Garantiza que las restricciones de clave foránea se verifiquen a nivel de motor de almacenamiento SQLite.
- **Sincronización Segura y Rápida (`PRAGMA synchronous = NORMAL;`):** En modo WAL, `NORMAL` provee integridad completa contra caídas del sistema operativo y máxima velocidad I/O.
- **Endpoint de Respaldo en Caliente (`POST /api/admin/backup`):** 
  - Ejecuta `VACUUM INTO '<ruta-backup>'` de SQLite, generando un snapshot consistente y compacto de la base de datos en caliente.
  - Exclusivo para el rol `ADMIN` bajo RBAC.
  - Registra el evento en la pista inmutable de auditoría (`AuditoriaEvento` con acción `BACKUP_SISTEMA`).

### 2.2. Servidor HTTP, Cabeceras de Seguridad y Parada Ordenada (Graceful Shutdown)
1. **Graceful Shutdown:**
   - Se interceptan las señales del sistema operativo `SIGTERM` y `SIGINT` en `src/index.ts`.
   - Flujo de terminación:
     1. Detener la recepción de nuevas conexiones HTTP (`await app.close()`).
     2. Permitir que las solicitudes en curso finalicen dentro de un tiempo de gracia (máximo 10 segundos).
     3. Desconectar de forma ordenada el cliente del ORM (`await prisma.$disconnect()`).
     4. Salida limpia con código `0` (o `1` si ocurre error durante el drenaje).
2. **Cabeceras de Seguridad HTTP:**
   - Se integra `@fastify/helmet` (v13 compatible con Fastify v5) con directivas de Content Security Policy (CSP) ajustadas para convivir con los recursos locales de la PWA (Service Worker `/sw.js`, manifiesto, estilos locales y tipografías Google Fonts):
     - `default-src: 'self'`
     - `script-src: 'self' 'unsafe-inline'`
     - `style-src: 'self' 'unsafe-inline' https://fonts.googleapis.com`
     - `font-src: 'self' https://fonts.gstatic.com`
     - `img-src: 'self' data: blob:`
     - `connect-src: 'self'`
     - `frame-ancestors: 'none'` (anti-clickjacking)
     - `X-Content-Type-Options: nosniff`
     - `Referrer-Policy: strict-origin-when-cross-origin`
3. **Validación Zod Exhaustiva:**
   - Todos los endpoints de `src/server.ts` y controladores se auditan para validar de manera estricta query params, parámetros de ruta y cuerpos de petición con esquemas Zod centralizados.

### 2.3. Frontend PWA Resiliente y Manejo de Errores
1. **Backoff Exponencial con Jitter en `SyncManager`:**
   - Fórmula: `delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, intentos)) * (1 + jitterFactor)`.
   - `baseDelayMs`: 2.000 ms.
   - `maxDelayMs`: 60.000 ms.
   - `jitterFactor`: varianza aleatoria entre -0.15 y +0.15 para desincronizar peticiones simultáneas de operadores reconectados.
   - Control de reintentos máximos y descarte controlado de lecturas irrecuperables con notificación al operador.
2. **Manejo Global de Expiración de Sesión (401 en `ApiClient`):**
   - Intercepción centralizada de respuestas con código 401.
   - Eliminación del token local (`medidores_auth_token`).
   - Disparo de evento global en `window` (`medidores:session-expired`).
   - Feedback inmediato con `Toast.warning("Su sesión ha expirado...")` y apertura automática del modal de inicio de sesión sin refrescar la página ni perder el estado del trabajo en curso.
3. **Estados Visuales de Error con Recuperación:**
   - Componente UI reutilizable para vistas con problemas de red o datos que presenta un estado visual consistente con botón de acción "Reintentar".

### 2.4. Validación de Concurrencia y Calidad
- Suite de pruebas de estrés/concurrencia en `tests/core/concurrencia.test.ts` ejecutando ráfagas simultáneas de inserción de lecturas y transacciones en paralelo (`Promise.all`) para validar la ausencia de bloqueos `SQLITE_BUSY`.
- Aprobación completa del Quality Gate determinista `./scripts/verify.sh`.

---

## 3. Consecuencias

### Positivas
- **Concurrencia Desbloqueada:** El modo WAL permite que los paneles de administración y las alertas sigan operando mientras múltiples operadores envían lecturas de terreno.
- **Protección de Datos:** Copias de seguridad atómicas en caliente sin detener el servidor y con auditoría normativa inmutable.
- **Cero Sockets Huérfanos:** El ciclo de vida en contenedores y despliegues CI/CD no interrumpe transacciones a mitad de ejecución.
- **Experiencia de Usuario Continua:** La PWA tolera fallos de red transitorios sin saturar el ancho de banda y gestiona la renovación de credenciales de forma amigable.

### Trade-offs y Mitigaciones
- El modo WAL genera archivos auxiliares `.db-wal` y `.db-shm` junto al archivo `.db`. Los volúmenes Docker ya persisten la carpeta completa (`medidores_data/`), por lo que estos archivos quedan protegidos.
- Las cabeceras de seguridad CSP requieren permitir `unsafe-inline` para scripts y estilos existentes en `index.html`. Se restringen al origen local y a los dominios autorizados de fuentes.
