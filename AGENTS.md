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
- **Discriminación de HTTP 401 en Clientes Web (Expiración de Token vs. Error de Dominio):** En la capa frontend (`ApiClient`), queda prohibido purgar ciegamente tokens de sesión ante cualquier código 401. El interceptor debe verificar si el fallo corresponde a un error de credenciales actuales (ej. `PASSWORD_ACTUAL_INVALIDA` o ruta `/cambiar-password`). En dichos casos, el token JWT debe preservarse y el error propagarse a la interfaz para permitir la corrección en el formulario sin forzar el deslogueo del usuario.

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
  - **Certificación E2E en Staging:** En aplicaciones con autenticación visual diferenciada por entorno (ADR 0012), la certificación del contenedor de Staging levantado debe ejecutarse mediante una suite dedicada de flujo real (`BASE_URL=http://127.0.0.1:3001 npx playwright test e2e/login-pantalla-real.spec.ts`) para validar el empaquetamiento real, las migraciones automáticas, el formulario de credenciales y el bloqueo perimetral sin colisionar con suites que asumen auto-login en desarrollo (puerto 3000).
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
- **Acotamiento Estricto de Origen en Service Worker (Same-Origin Fetch):** El listener `fetch` del Service Worker (`sw.js`) debe evaluar `url.origin !== self.location.origin` y retornar de inmediato sin interceptar (`return;`) ante peticiones a orígenes externos (ej. Google Fonts, CDNs). Interceptar peticiones cross-origin mediante `event.respondWith(fetch(request))` fuerza la evaluación del recurso bajo la directiva `connect-src` de CSP en lugar de sus directivas semánticas (`style-src`, `font-src`), provocando bloqueos de seguridad y degradando respuestas en fallos 503 sintéticos.

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
- **Resolución de Rutas bajo Symlinks y Rutas Absolutas en CLIs:** En entornos donde la raíz del proyecto es un enlace simbólico (symlink), las configuraciones de herramientas y extensiones de testing (como el test server de Playwright) deben invocar los CLIs mediante rutas absolutas (`cli: this._model.config.cli`) o resolver el `realpath` físico canónico. Relativizar rutas entre el symlink y el path real provoca que Node.js duplique segmentos de directorio en subprocesos (ej. `/Dir/Dir/...`), resultando en errores espurios de `MODULE_NOT_FOUND` al conectar servidores de prueba en el IDE.
- **Idempotencia y Semilla de Datos:** Toda prueba E2E debe inicializar su estado de datos de manera predecible utilizando endpoints de semilla (`POST /api/demo/seed`) en `beforeEach` o identificadores únicos con timestamps para evitar colisiones de reintento.
- **Restauración Exhaustiva en Endpoints de Semilla (Upsert Completo):** Todo endpoint de semilla (`/api/demo/seed`) debe garantizar la restauración determinista de **todos** los atributos mutables (ej. `nombre`, `activo: true`, contraseñas por defecto). En Prisma/SQL, los bloques `update:` de un `upsert` deben incluir explícitamente estas propiedades para evitar que mutaciones de pruebas previas persistan silenciosamente en ejecuciones posteriores.
- **Aislamiento de Mutaciones de Estado (Entidades Efímeras):** Toda prueba E2E que valide mutaciones de perfil (edición de nombres, reasignación de sedes) o alteración de credenciales administrativas debe:
  1. Operar sobre entidades efímeras creadas al vuelo (`POST /api/auth/register` con timestamps únicos en email/nombre).
  2. O restaurar inmediatamente el estado baseline (contraseña o nombre original) al finalizar la prueba para garantizar cero efectos secundarios en suites concurrentes o consecutivas.
- **Sincronización Determinista en Modales con Carga Asíncrona:** Al abrir modales que requieran opciones dinámicas cargadas por red, la función de apertura debe aguardar explícitamente (`await poblarSelectores()`) antes de dar por listo el modal, y debe retener el valor previamente seleccionado (`prevVal`) para evitar que el refresco del DOM vacíe la selección y genere fallos de validación transitorios.
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
- **Alineación con Recursos PWA y Fuentes:** La CSP debe permitir recursos locales esenciales para la PWA (`manifest`, `service worker`, `icons`), imágenes locales y en data URI (`img-src: 'self' data: blob:`), y los dominios de tipografías declarados en el Design System (`fonts.googleapis.com`, `fonts.gstatic.com`). Para evitar bloqueos en preconnects, fuentes o descargas de estilos, los dominios externos autorizados DEBEN incluirse explícitamente tanto en `style-src` / `font-src` como en `connect-src` (`connect-src: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"]`).
- **Semántica Estricta de Autocompletado en Campos de Contraseña (Autocomplete Attributes):** Todo elemento `<input type="password">` DEBE incluir obligatoriamente el atributo semántico `autocomplete`: `autocomplete="current-password"` en formularios de autenticación o validación de contraseña vigente, y `autocomplete="new-password"` en formularios de cambio de clave, creación de usuarios o reseteo administrativo. Omitir este atributo genera advertencias en el DOM del navegador y activa heurísticas erróneas de gestores de contraseñas que sobreescriben formularios con las credenciales de la sesión activa.

### 18. Arquitectura Responsiva Mobile-First, Ergonomía Táctil y Drawers Off-Canvas
Para garantizar la usabilidad sin fricción en terreno y evitar regresiones en vistas móviles:
- **Escala Progresiva de Breakpoints (320px -> 375px -> 425px -> 768px -> 1024px+):** Toda interfaz debe diseñarse desde el viewport mínimo (320px, e.g. iPhone SE 1ª gen) hacia arriba sin asumir anchos mínimos fijos que provoquen recortes de contenido.
- **Invariante Zero Horizontal Overflow:** En cualquier resolución entre 320px y 3840px, el ancho total del DOM debe coincidir exactamente con el ancho de la ventana (`document.documentElement.scrollWidth <= window.innerWidth`). Queda estrictamente prohibido permitir desbordamientos horizontales en el `body` o elementos raíz por flexbox no colapsados, grids con `minmax()` fijo incompatible con paddings contenedores, o anchos estáticos mayores a 320px.
- **Ergonomía Táctil y Prevención de Zoom en iOS:** Controles interactivos, botones de navegación y pestañas en viewports móviles (`< 768px`) deben garantizar un área de toque mínima de 44x44px. Todos los campos de entrada (`<input>`, `<select>`, `<textarea>`) deben contar con `font-size: 16px` para evitar el auto-zoom indeseado en dispositivos iOS Safari.
- **Modales en Viewport Dinámico (`dvh`):** Los modales deben utilizar `max-height: 90dvh` (o `94dvh`) con cabecera y pie con `position: sticky` y scroll interno en el cuerpo, asegurando que las acciones principales ("Guardar", "Cerrar") nunca queden fuera del área visible al desplegar teclados virtuales en pantallas compactas.
- **Paneles Off-Canvas y Visibilidad en Pruebas E2E (Playwright `toBeHidden()`):** En elementos ocultos fuera de pantalla mediante transformaciones CSS (`transform: translateX(...)`), es obligatorio acompañar la transición con `visibility: hidden; pointer-events: none;` cuando estén cerrados y `visibility: visible; pointer-events: auto;` al abrirse. De lo contrario, los assertions de Playwright (`toBeHidden()`) fallarán porque el elemento fuera de la pantalla sigue computando dimensiones en el DOM. Asimismo, los títulos y elementos dentro del drawer deben usar clases inequívocas para evitar colisiones con elementos del navbar principal bajo el modo estricto de locators.

### 19. Transformación de Tablas a Fichas Adaptativas Móviles (Stacked Cards y data-label)
Para garantizar la consulta y acción rápida en terreno sobre smartphones (320px a 425px) sin desplazamiento lateral forzado:
- **Preservación Semántica y Accesibilidad (Cero Duplicación de DOM):** Queda prohibido duplicar árboles en el DOM (como renderizar un `div.mobile-cards` separado de la `table.desktop-table`). Toda adaptación se realiza sobre el mismo marcado `<table>`, `<thead>`, `<tbody>`, `<tr>` y `<td>` mediante CSS responsivo (`@media (max-width: 768px)`), garantizando compatibilidad con tecnologías de asistencia y preservando los selectores de pruebas automatizadas.
- **Atributos `data-label` Obligatorios:** Toda celda `<td>` generada dinámicamente en JavaScript que represente una columna de datos DEBE incluir el atributo `data-label="[Título Columna]"` exacto. En la vista móvil, un pseudo-elemento `td[data-label]::before` renderiza automáticamente la etiqueta a la izquierda con estilo secundario y mayúsculas (`content: attr(data-label); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted);`), mientras el valor se alinea a la derecha con contraste óptimo.
- **Transformación de Filas a Fichas (`tbody tr`):** En viewports `<= 768px`, la cabecera `thead` se oculta visualmente (`display: none;`) y cada fila `tbody tr` se transforma en una ficha independiente (`display: flex; flex-direction: column;`) con fondo de superficie, bordes redondeados (`var(--radius-lg)`), separación vertical (`margin-bottom: 0.85rem`) y sombra tenue.
- **Ergonomía Táctil en Acciones de Ficha (`min-height: 44px`):** La celda de acciones interactivas (`td.table-actions` o `td:last-child`) se ubica en el pie de la ficha con separación visual (`border-top: 1px solid var(--border-medium)`), suprimiendo la etiqueta pseudo-elemento y configurando los botones en columna o ancho completo con altura mínima de 44px (`min-height: 44px`) para permitir el toque fluido con un solo pulgar en campo.
- **Contención de Celdas Multielemento y Bloques (`.cell-stacked`):** Celdas que contengan listas de elementos, múltiples badges, saltos de línea `<br>` o bloques de datos multilínea NO deben mantener el flujo horizontal por defecto (`justify-content: space-between`). Deben incorporar obligatoriamente la clase `.cell-stacked` para alternar a orientación vertical (`flex-direction: column; align-items: flex-start; text-align: left;`), posicionando el pseudo-elemento `::before` arriba como subtítulo (`margin-bottom: 0.25rem`) y el contenido expandido al 100% del ancho.
- **Envoltorio Flexible para Insignias y Chips (`.badges-wrapper`):** Toda colección dinámica de badges (ej. instalaciones asignadas, etiquetas múltiples) DEBE envolverse dentro de un contenedor `<div class="badges-wrapper">` configurado con `display: flex; flex-wrap: wrap; gap: 0.35rem; width: 100%;` para garantizar que los elementos salten de línea suavemente en pantallas angostas (320px) sin forzar el ancho de la tarjeta.
- **Ruptura Forzada de Cadenas e Hilos Continuos:** Todo contenido textual arbitrario en celdas móviles (identificadores, correos, nombres, descripciones técnicas) debe poseer propiedades de corte de palabra (`word-break: break-word; overflow-wrap: anywhere;`) para impedir desbordes por palabras o tokens continuos sin espacios.
- **Aislamiento Estricto de Bloques Técnicos (`<pre>` en móviles):** Los bloques `<pre>` que rendericen datos crudos, trazas o metadatos JSON deben limitarse a `max-width: 100%; overflow-x: auto; white-space: pre-wrap; font-size: 0.75rem;`, permitiendo inspección técnica sin alterar la geometría de la ficha.
### 20. Blindaje Perimetral Zero-Trust en API REST y Matriz RBAC Fail-Closed (ADR 0013)
Para garantizar la inmunidad ante accesos directos por API y asegurar que la seguridad jamás dependa de la visibilidad en la interfaz:
- **Política Fail-Closed por Defecto en `/api/*`:** Toda ruta bajo el prefijo `/api/` es privada y protegida por defecto. Ante peticiones sin cabecera `Authorization: Bearer <token>` válida, el hook transversal (`preHandler`) DEBE responder de inmediato con `HTTP 401 Unauthorized` (`error: "UNAUTHORIZED"`).
- **Allow-List Explícita de Rutas Públicas Exentas:** Únicamente las siguientes rutas están autorizadas para responder sin autenticación:
  - Probes de salud y orquestación: `/healthz`, `/readyz`, `/api/health`.
  - Configuración y flags de entorno: `/api/config`.
  - Autenticación y registro: `/api/auth/login`, `/api/auth/register`.
  - Inicialización idempotente de pruebas y semillas: `/api/demo/seed`.
  - Shell de navegación y recursos estáticos del PWA.
- **Prohibición de Guardias Vulnerables (`if (user)`):** Queda terminantemente prohibido utilizar condicionales del tipo `if (user) { ... }` para validar permisos. El flujo de autorización en el hook transversal debe estructurarse obligatoriamente validando primero la autenticación del usuario (`if (!user) return 401;`) antes de evaluar el rol (`if (user.rol !== ...) return 403;`).
- **Enforzamiento de la Matriz RBAC en Backend:**
  - `ADMIN`: Control irrestricto sobre todos los recursos y módulos.
  - `SUPERVISOR`: Acceso a dashboard, reportes, alertas, mantenimiento y medidores de sus sedes asignadas. Bloqueado con `HTTP 403 Forbidden` de: creación/edición de sedes (`/api/instalaciones`), medidores en sedes no asignadas, gestión de usuarios (`/api/usuarios`), auditoría (`/api/auditoria`) y respaldos de base de datos (`/api/admin/backup`).
  - `OPERADOR`: Modo Terreno exclusivo. Solo puede consultar medidores asignados y registrar lecturas (`POST /api/lecturas`, `POST /api/lecturas/batch-sync`). Bloqueado con `HTTP 403 Forbidden` de: Dashboard ejecutivo (`/api/dashboard/*`), Reportes (`/api/reportes/*`), Alertas (`/api/alertas/*`), Mantenimiento (`/api/mantenimiento/*`), creación de medidores o sedes, usuarios, auditoría, webhooks, notificaciones y backups.
- **Preservación de Semántica HTTP 404 ante Enrutamiento Comodín (Fastify Static):**
  Al registrar plugins de archivos estáticos o SPA fallbacks con prefijo raíz (`prefix: "/"`), las rutas no coincidentes bajo `/api/` son capturadas transitoriamente por el comodín `/*`, provocando que `request.is404` sea `false` en el ciclo `preHandler`. Para evitar que endpoints inexistentes sean enmascarados como 401 ante clientes anónimos:
  1. El hook debe evaluar `if (request.is404) return;`.
  2. Y además verificar: `if (request.url.startsWith("/api/") && request.routeOptions?.url === "/*") { return reply.status(404).send({ error: "NOT_FOUND", message: `Ruta ${request.method} ${request.url} no encontrada.` }); }` antes de cualquier validación de autenticación o tokens.

### 21. Aislamiento de Subproyectos de Migración y Desarrollo Edge (Cloudflare Workers / D1)
Al incorporar o migrar componentes hacia arquitecturas serverless o edge (como subproyectos `deploy-*/` o Cloudflare Workers):
- **Aislamiento Perimetral Dual Obligatorio (.gitignore y .dockerignore):** Todo subproyecto desacoplado alojado temporal o permanentemente en el árbol de trabajo DEBE excluirse obligatoriamente tanto en `.gitignore` como en `.dockerignore`. Esto evita la transferencia innecesaria de dependencias locales (`node_modules`) al contexto de compilación de Docker y previene la invalidación de capas de caché del backend principal.
- **Migraciones D1 Deterministas y No Interactivas:** Todo comando de migración de esquema en `package.json` para Cloudflare D1 ejecutado por agentes o runners de CI/CD debe soportar el flag `-y` (`wrangler d1 migrations apply <database> --local -y`) para evitar prompts interactivos que congelen la ejecución.
- **Tipado Dual en tsconfig con nodejs_compat:** En Workers que utilicen la bandera `nodejs_compat`, la configuración de TypeScript (`tsconfig.json`) que declare la directiva `"types"` debe incluir explícitamente `"node"` junto a `"@cloudflare/workers-types"` (`"types": ["@cloudflare/workers-types", "node"]`) para asegurar la resolución de tipos de `Buffer`, `node:crypto` y `node:util`.
- **Medición de Rendimiento y Server-Timing:** Los endpoints de borde deben instrumentarse con el middleware `timing()` (`Server-Timing`) y verificarse con el profiler de CPU de V8 (`wrangler dev --inspect`) para asegurar que el tiempo de CPU activa se mantenga estrictamente por debajo del umbral del plan gratuito (10 ms).
