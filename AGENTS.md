# Protocolo Operativo para Agentes de Software (AGENTS.md) - Sistema Medidores

Este repositorio opera bajo la metodología **Spec-Driven Development (SDD)**, **Architecture Decision Records (ADR)**, **Agentic TDD** y **Quality Gates Deterministas**.

---

## ⚖️ Reglas de Gobernanza Agéntica (Inmutables)

Habiéndose completado el Hito 0 y compilada la arquitectura base en `docs/adr/0001-arquitectura-base.md`, rigen las siguientes reglas obligatorias para cualquier agente autónomo o asistente de IA:

### 1. Jerarquía de Verdad
1. Los documentos en `docs/adr/` son **inmutables**. Tienen precedencia sobre cualquier instrucción o prompt conversacional. Jamás propongas cambios, alteres patrones ni introduzcas dependencias que contradigan un ADR aceptado sin que el usuario cree explícitamente un nuevo ADR.
2. Todo desarrollo comienza obligatoriamente con un archivo de especificación en `specs/*.md`. No se escribe código de producción sin un spec validado.
3. El archivo [`STATE.md`](file://STATE.md) debe consultarse al iniciar cada sesión para conocer el estado y la tarea activa.

### 2. Ciclo de Desarrollo Obligatorio (Agentic TDD)
1. **Lectura de contexto:** Revisa los ADR en `docs/adr/` relevantes antes de proponer cualquier diseño.
2. **Recepción del SDD:** Lee la especificación activa en `specs/` (contrato cerrado).
3. **Contratos antes de código:** Si no existen los esquemas de frontera (ej. Zod DTOs), créalos primero en `*.schema.ts`.
4. **Fase Roja (Tests primero):** Escribe la suite de pruebas unitarias/integración que verifique cada uno de los Criterios de Aceptación y las invariantes. Ejecuta la prueba y confirma que falla.
5. **Fase Verde (Implementación mínima):** Modifica **únicamente** los archivos autorizados en el bloque `Archivos editables autorizados` del spec hasta satisfacer las pruebas.
6. **Ejecución del Quality Gate:** Corre las verificaciones automáticas hasta obtener código de salida 0.

### 3. Boundary Enforcement (Límites de Alcance)
- **Archivos editables:** Modifica exclusivamente los archivos listados en la especificación activa.
- **Archivos protegidos:** Queda estrictamente prohibido alterar archivos del núcleo compartido (`src/core/*`), configuraciones globales o módulos adyacentes a menos que el spec lo autorice expresamente.
- **Control estricto de dependencias:** Prohibido instalar librerías (`npm install`, etc.) sin previa autorización explícita del usuario o justificación en un nuevo ADR.

### 4. Manejo de Errores de Dominio Tipados
- Queda terminantemente prohibido lanzar excepciones genéricas (`throw new Error("mensaje")`) o usar strings mágicos para identificar fallos.
- Todo módulo debe declarar un tipo o enum con sus errores de dominio (ej. `export type [Modulo]ErrorCode = "MEDIDOR_NOT_FOUND" | "LECTURA_DECRECIENTE_PROHIBIDA"`).
- Toda clase que herede de `DomainError` (`src/core/errors.ts`) debe implementar obligatoriamente las propiedades `readonly code: string` y `readonly statusCode: number`, pasando a `super(message, details)` únicamente el mensaje y metadata contextual opcional:
  ```typescript
  export class MiErrorDomain extends DomainError {
    readonly code = "MI_CODIGO_ERROR";
    readonly statusCode = 400; // o 401, 403, 404, 409, 422, 503
    constructor(motivo: string) {
      super(`Mensaje explicativo: ${motivo}`);
    }
  }
  ```
- Los controladores HTTP son responsables exclusivos de capturar estos errores de dominio y traducirlos a códigos HTTP semánticos (400, 401, 403, 404, 409, 422, 503).

### 5. Configuración y Secretos
- Prohibido acceder directamente a `process.env.*` en servicios, repositorios o controladores.
- Toda variable de entorno debe validarse mediante esquema Zod centralizado en `src/core/config.ts` y documentarse en [`.env.example`](file://.env.example).
- **Aprovisionamiento Determinista en Entornos Limpios:** Prohibido asumir la preexistencia física de `.env` en runners de CI, contenedores o clones nuevos. Todo script de Quality Gate (`scripts/verify.sh`) o workflow de CI (`.github/workflows/*.yml`) debe asegurar valores por defecto seguros de prueba (copiando `.env.example` a `.env` o inyectando variables en el runner) antes de instanciar la configuración de la aplicación.

### 6. Convención Estricta de Commits (Conventional Commits)
Todo commit generado por el agente debe apegarse al estándar Conventional Commits:
- `feat(<modulo>): [descripción en infinitivo]`
- `fix(<modulo>): [descripción de corrección]`
- `test(<modulo>): [suite o prueba añadida]`
- `refactor(<modulo>): [cambio estructural sin alterar comportamiento]`
- `chore(<scope>): [actualizaciones de dependencias o tooling]`
*(Prohibidos mensajes vagos como "update code", "fix error" o "changes")*.

### 7. Quality Gate Determinista
Ninguna tarea se considera terminada si no supera los scripts de validación con código de salida 0:
```bash
./scripts/verify.sh
```
O sus comandos equivalentes:
- Verificación estricta de tipos (con regeneración de tipos ORM): `npm run typecheck` (`prisma generate && tsc --noEmit`)
- Linter y formato: `npm run lint`
- Suite de pruebas: `npm test`

**Invariante de Generación y Sincronización de Artefactos Tipados:**
- **Configuración en package.json:** En proyectos con ORMs generativos (como Prisma), el script `"typecheck"` DEBE ser configurado explícitamente como `"prisma generate && tsc --noEmit"`. Prohibido delegar el typecheck únicamente a `tsc --noEmit` sin la re-emisión previa de tipos.
- **Tipado Explícito en Servidores y Servicios:** Toda instancia u opción que reciba o construya el cliente del ORM debe contar con anotación de tipo explícita (ej: `const prisma: PrismaClient = options.prisma ?? new PrismaClient();`) para evitar fallos de inferencia transitoria en el AST del editor.
- **Regeneración tras Modificación de Esquema:** Cada vez que el agente agregue o modifique modelos en `schema.prisma` u homólogo, debe ejecutar inmediatamente `npx prisma generate` en disco antes de tocar el código de los repositorios o controladores.
- **Manejo de Caché del Language Server (tsserver):** Ante desfases visuales residuales en el editor después de modificar esquemas de datos, el agente debe instruir o verificar la recarga del servidor de tipos (`TypeScript: Restart TS Server` / recarga de ventana).

### 8. Estrategia Multi-Entorno y Contenerización Segura (Dev, Staging, Prod)
Todo proyecto que adopte empaquetamiento Docker debe implementar y respetar la tríada de entornos desacoplados:
- **Desarrollo Local (Dev):** Ejecución sin contenedor mediante herramientas de recarga ágil (`tsx watch`, `vitest`). Máxima velocidad de feedback.
- **Staging / Pre-producción (Docker):**
  - Mapeo de puerto en host diferenciado (ej: `3001` para Staging frente a `3000` para Producción) para permitir la convivencia de ambos stacks en el mismo servidor sin colisiones de red.
  - Volumen de datos y archivo de base de datos completamente aislados (`*_staging_data` / `*-staging.db`). Prohibido compartir volúmenes entre Staging y Producción.
  - Validación tipada del entorno: La variable `NODE_ENV=staging` debe ser explícitamente permitida en el esquema Zod centralizado (`src/core/config.ts`).
- **Producción (Prod):** Despliegue productivo inmutable con volumen persistente dedicado y credenciales protegidas.
- **Arranque Determinista en Contenedor (Entrypoint):**
  - Cuando se utilicen motores de datos embebidos o migraciones automáticas, el script `docker-entrypoint.sh` debe garantizar la preparación y sincronización no destructiva del esquema antes de delegar la ejecución al proceso principal de Node.js.
- **Sincronización Determinista del Lockfile (`package-lock.json`):** Toda adición o modificación de librerías en `package.json` DEBE sincronizar inmediatamente el archivo `package-lock.json` (`npm install --package-lock-only` o `npm install`) y commitearse de forma atómica. Queda prohibido construir contenedores o ejecutar despliegues con un lockfile desfasado, ya que el comando estándar `npm ci` dentro de Dockerfiles aborta de forma determinista ante cualquier discrepancia entre `package.json` y `package-lock.json`.

### 9. Probes de Salud Operativa y Resiliencia en Contenedores (Liveness vs. Readiness)
Toda aplicación contenerizada o expuesta a orquestadores (Docker, Kubernetes) debe desacoplar estrictamente la vivacidad del proceso frente a la disponibilidad de sus dependencias:
- **Liveness Probe (`/healthz`):** Verificación instantánea del bucle de eventos y vivacidad del runtime de Node.js sin consultar bases de datos ni servicios externos. Responde HTTP 200 `{ status: "ok", uptime: number }`.
- **Readiness Probe (`/readyz`):** Verificación activa del motor de base de datos (ping/query raw) y dependencias críticas. Debe retornar HTTP 200 `{ status: "ready", database: "connected" }` si el almacenamiento responde, o HTTP 503 Service Unavailable `{ status: "not_ready", database: "disconnected" }` si la conexión se degrada.
- **Configuración en Contenedores:** La directiva `HEALTHCHECK` en `Dockerfile` y `docker-compose` DEBE evaluar obligatoriamente `/readyz` (no `/healthz` ni endpoints estáticos) para asegurar que el tráfico solo se dirija a réplicas operativas.

### 10. Invariante de Pistas de Auditoría Inmutables (Append-Only Audit Trail)
Todo sistema que registre eventos críticos o de trazabilidad normativa (cambios de rol, restablecimientos administrativos de contraseñas, bajas técnicas de equipos, aperturas o reemplazos de precintos de seguridad) debe respetar las siguientes invariantes duras:
- **Inmutabilidad Absoluta (Append-Only):** Queda estrictamente prohibido implementar o exponer métodos de modificación (`update`, `patch`) o eliminación física (`delete`, `destroy`) en repositorios, servicios o controladores de auditoría.
- **Instrumentación Obligatoria:** Todo servicio que ejecute una alteración de seguridad o metrología debe persistir de forma transaccional o coordinada el respectivo registro de auditoría (`AuditoriaEvento`) indicando actor (`usuarioId`), acción tipada, entidad afectada, metadatos en JSON e IP origen.
- **Restricción de Acceso:** La consulta de la bitácora de auditoría queda reservada con exclusividad al rol `ADMIN` bajo guardias preHandler de RBAC.

### 11. Protección Perimetral y Rate Limiting Diferenciado
- **Autenticación Protegida:** Los endpoints sensibles a ataques automatizados de fuerza bruta o robo de credenciales (`POST /api/auth/login`) deben implementar Rate Limiting por IP (umbral de 5 peticiones por minuto, respondiendo HTTP 429 Too Many Requests con cabecera `Retry-After`).
- **Respeto a Sincronización en Lote:** Los límites globales de tasa no deben asfixiar las peticiones de operadores en terreno tras períodos prolongados sin red; los endpoints de datos y sincronización en lote (`/api/lecturas/batch-sync`) deben contar con umbrales holgados o exenciones controladas.
- **Exención Segura para Pruebas E2E Sintéticas:** Los limitadores de tasa no deben asfixiar las suites de pruebas automatizadas sintéticas de navegador (Playwright); deben implementar una exención controlada (`allowList`) basada en cabeceras de prueba estrictas (ej. `x-e2e-client`) inyectadas únicamente por el runner en su configuración (`extraHTTPHeaders`), preservando el umbral de bloqueo de 5 peticiones/min para el tráfico regular y las pruebas de penetración.

### 12. Arquitectura PWA y Sincronización Resiliente (Offline-First)
En aplicaciones con soporte fuera de línea para trabajo en terreno:
- **Separación de Responsabilidades:** El Service Worker (`sw.js`) es responsable exclusivo del shell de navegación y recursos estáticos (`Cache-First` / `Network-First`). Queda terminantemente prohibido cachear peticiones HTTP mutantes (`POST`, `PATCH`, `DELETE`) en el Service Worker.
- **Gestión de Cola en Capa de Aplicación:** Las transacciones tomadas fuera de línea deben capturarse mediante un gestor de sincronización (`SyncManager`) en almacenamiento local del cliente (`localStorage` o `IndexedDB`).
- **Tolerancia a Fallos en Sincronización en Lote:** Los endpoints de sincronización en lote (`POST /api/.../batch-sync`) deben procesar los elementos ordenados cronológicamente y retornar un reporte discriminado por ítem (`SYNCED` vs `REJECTED`) para persistir los registros válidos sin que un error puntual de validación bloquee el lote entero.

### 13. Integraciones Salientes, Webhooks y Notificaciones Multicanal (Telegram y Web Push)
Todo sistema que emita notificaciones o eventos hacia sistemas externos vía HTTP Webhooks debe cumplir las siguientes invariantes:
- **Firma Criptográfica HMAC-SHA256:** En endpoints con secreto configurado, todo payload crudo debe ser firmado con HMAC-SHA256 y despachado con la cabecera `X-Webhook-Signature: sha256=<hex>` para autenticación perimetral del receptor.
- **Despacho Fail-Safe y Aislamiento de Fallos:** El despacho de webhooks salientes debe ser estrictamente asíncrono y tolerante a fallos (`Promise.allSettled`). La latencia, desconexión o respuesta errónea de un receptor jamás debe abortar transacciones de base de datos ni bloquear o degradar el ciclo de respuesta al usuario.
- **Timeout Estricto y Bitácora Inmutable de Entregas:** Toda petición saliente debe limitar su tiempo de espera a un máximo estricto (5000ms mediante `AbortController`) y registrar de forma inmutable cada intento (`WebhookEntrega`) con timestamp, código HTTP, duración en milisegundos y detalle de error si aplica.
- **Alertas a Humanos y Auto-Purga de Suscripciones (Web Push / Telegram):** El despacho hacia canales humanos debe ejecutarse bajo las mismas garantías de fail-safe y timeout. En Web Push (VAPID RFC 8292), el servicio debe autogenerar claves efímeras seguras en memoria si faltan en entornos de test/CI para evitar bloqueos del Quality Gate, y debe desactivar o purgar inmediatamente en base de datos toda suscripción que retorne HTTP 410 (Gone) o 404 para evitar envíos infructuosos. En Telegram, la integración debe permanecer 100% nativa (fetch HTTP directo) evitando dependencias pesadas innecesarias.

### 14. Observabilidad Estructurada, Correlación (reqId) y Manejo de Errores Críticos (5xx vs 4xx)
Para garantizar la trazabilidad operativa y el diagnóstico preventivo en entornos productivos:
- **Logs Estructurados y Correlación de Solicitudes:** La aplicación debe utilizar un logger nativo con salida JSON estructurada (Pino), correlacionando cada ciclo de vida de petición con un identificador único `request.id` (`reqId`) y adaptando dinámicamente el nivel de registro (`LOG_LEVEL`) según el entorno (`test`, `development`, `staging`, `production`).
- **Discriminación Estricta de Errores (4xx vs 5xx):** En el manejador global de errores (`app.setErrorHandler`), los errores de cliente o de dominio (`DomainError`, validaciones Zod 400, autenticación 401, autorización 403, no encontrado 404) deben retornar su código HTTP semántico y registrarse sin activar alarmas operativas ni generar fatiga de notificaciones.
- **Trigger Automático ante Excepciones Críticas (>= 500):** Todo fallo no controlado de servidor (`statusCode >= 500`) debe emitir un log de nivel `error` con traza completa y disparar asíncronamente un evento de error crítico (`sistema.error_critico`) hacia la infraestructura de monitoreo o webhooks, encapsulado en un bloque fail-safe para garantizar que la respuesta 500 al cliente jamás sea alterada ni demorada.

### 15. Convivencia y Desacoplamiento de Runners de Prueba (Vitest vs. Playwright)
En proyectos que integren pruebas unitarias/integración rápidas con pruebas sintéticas de navegador de extremo a extremo (E2E):
- **Aislamiento Estricto de Runners:** El runner unitario (Vitest) DEBE excluir explícitamente el directorio de pruebas E2E (`exclude: ['e2e/**']` en `vitest.config.ts`) para evitar colisiones de ejecución, dobles ejecuciones o fallos de entorno en suites no preparadas para navegador.
- **Arranque Determinista con WebServer:** La suite de Playwright debe utilizar la directiva `webServer` en `playwright.config.ts` para arrancar y validar la vivacidad del backend (`/readyz` o `/api/health`) antes de despachar tráfico de prueba.
- **Idempotencia y Semilla de Datos:** Toda prueba E2E debe inicializar su estado de datos de manera predecible utilizando endpoints de semilla (`POST /api/demo/seed`) en `beforeEach` o identificadores únicos con timestamps para evitar colisiones de reintento.
- **Manejo de Diálogos Nativos del Navegador:** En interacciones de usuario que activen diálogos del sistema (`window.confirm`, `window.alert`), las pruebas deben declarar obligatoriamente el manejador de eventos (`page.once('dialog', dialog => dialog.accept())`) antes del clic desencadenante, evitando cancelaciones silenciosas por defecto.
- **Exclusión en Artefactos de Producción:** El compilador de producción (`tsconfig.build.json`) DEBE excluir tanto `tests/**/*` como `e2e/**/*` para garantizar que la distribución final (`dist/`) quede limpia de código de prueba.
- **Delimitación de Selectores en Vistas Ocultas (DOM Scoping):** En aplicaciones Single Page (SPA) con múltiples paneles o pestañas en el DOM (`display: none`), queda prohibido utilizar selectores de texto genéricos (ej. `button:has-text('Refrescar')`). Todo selector interactivo DEBE estar acotado explícitamente al contenedor de la vista activa (ej. `#viewNotificaciones button:has-text('Refrescar')`) o contar con identificador único para evitar que Playwright seleccione elementos coincidentes pero no visibles de pestañas inactivas y aborte por timeout (30s).
- **Tipado Estricto de Contextos de Navegador (`page.evaluate` sin `any`):** En suites de Playwright, queda terminantemente prohibido utilizar casts genéricos a `any` (`(window as any)`) para interactuar con APIs globales del cliente en `page.evaluate()`, ya que violan la regla estricta `@typescript-eslint/no-explicit-any` del Quality Gate. Es obligatorio declarar interfaces tipadas (ej. `interface AppWindow extends Window { ... }`) o emplear `window as unknown as AppWindow` con propiedades tipadas, incluyendo los parámetros de funciones en callbacks.
- **Desacoplamiento de Invariantes Acumulativas frente a Semillas:** En pruebas que verifiquen invariantes estrictamente crecientes o decrecientes (como lecturas acumulativas de medidores), queda prohibido asumir valores estáticos fijos (magic numbers) dependientes de la semilla inicial. La prueba DEBE inspeccionar dinámicamente el valor base actual desde el DOM o respuesta de API (`valorBase`) y computar valores de prueba relativos (`valorBase - delta` para rechazo, `valorBase + delta` para aceptación), preservando la idempotencia absoluta ante ejecuciones repetidas o pruebas previas en el almacenamiento.

### 16. Concurrencia SQLite, Ejecución de PRAGMAs y Respaldo Atómico en Caliente
Al operar con motores de base de datos embebidos (SQLite) gestionados mediante Prisma ORM:
- **Diferenciación de Invocación Raw (queryRaw vs executeRaw):** En SQLite, las sentencias que configuran modos y timeouts (`PRAGMA journal_mode = WAL;`, `PRAGMA busy_timeout = 5000;`, `PRAGMA foreign_keys = ON;`) retornan filas de resultados. Es mandatorio ejecutarlas mediante `prisma.$queryRawUnsafe()` para evitar la excepción Prisma P2010 (`Execute returned results, which is not allowed in SQLite`). Por el contrario, sentencias de mantenimiento sin filas de salida (como `VACUUM INTO '<ruta>'`) deben ejecutarse mediante `prisma.$executeRawUnsafe()`.
- **Configuración de Concurrencia Obligatoria:** Todo inicio de servidor con SQLite debe garantizar modo WAL (`journal_mode = WAL`), espera ante contención de al menos 5.000 ms (`busy_timeout = 5000`), verificación forzada de claves foráneas (`foreign_keys = ON`) y sincronización `synchronous = NORMAL`.
- **Respaldo en Caliente con Pista de Auditoría:** El respaldo atómico de base de datos (`POST /api/admin/backup`) queda reservado con exclusividad al rol `ADMIN` y debe persistir inmediatamente un registro inmutable en `AuditoriaEvento` con acción tipada `BACKUP_SISTEMA`.

### 17. Endurecimiento Perimetral HTTP, Helmet CSP y Compatibilidad PWA
Para proteger la capa de transporte y los recursos servidos al navegador:
- **Permisividad de Atributos DOM en CSP (scriptSrcAttr):** Al registrar `@fastify/helmet` con Content Security Policy personalizada, la directiva `scriptSrcAttr` DEBE configurarse explícitamente como `scriptSrcAttr: ["'unsafe-inline'"]` si el HTML utiliza controladores de eventos en el marcado (`onclick`, `onchange`, `onsubmit`). Omitir esta directiva provoca que Helmet inyecte `script-src-attr 'none'`, bloqueando silenciosamente las acciones del usuario y los flujos sintéticos de Playwright.
- **Alineación con Recursos PWA y Fuentes:** La CSP debe permitir recursos locales esenciales para la PWA (`manifest`, `service worker`, `icons`), imágenes locales y en data URI (`img-src: 'self' data: blob:`), y los dominios de tipografías declarados en el Design System (`fonts.googleapis.com`, `fonts.gstatic.com`).
