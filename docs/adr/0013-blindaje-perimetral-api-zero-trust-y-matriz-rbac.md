# ADR 0013: Blindaje Perimetral API REST Zero-Trust y Matriz RBAC Fail-Closed

- **Fecha:** 2026-10-04
- **Estado:** Aceptado
- **Afecta a:** `src/server.ts`, `src/modules/*`, `specs/feat-019-*.md`, seguridad perimetral de red y controladores HTTP

---

## 1. Contexto y Problema

Durante la auditoría del flujo de autenticación formal (Hito 14 / ADR 0012), se identificó una brecha de seguridad perimetral de severidad alta en la capa backend (`src/server.ts`):
1. **Condicional Vulnerable `if (user)`:** Las guardias RBAC de módulos esenciales como `POST /api/instalaciones` y `POST /api/medidores` evaluaban los permisos únicamente si `user` estaba definido (`if (user) { ... }`). Ante peticiones HTTP enviadas directamente (vía `curl`, Postman o scripts) **sin cabecera `Authorization`**, `user` resultaba `undefined`, omitiendo la evaluación y permitiendo la creación anónima de entidades metrológicas y territoriales sin credenciales.
2. **Fugas de Lectura (Data Leaking):** Endpoints de agregación ejecutiva y telemetría sensible (`/api/dashboard/*`, `/api/reportes/*`, `/api/alertas/*`, `/api/mantenimiento/*`, `/api/lecturas`) no contaban con bloqueo universal de autenticación, respondiendo `HTTP 200 OK` con información del negocio ante peticiones anónimas si se burlaba la interfaz de usuario.
3. **Falsa Sensación de Seguridad Frontend-Only:** Ocultar visualmente la barra de navegación o botones en el cliente web es insuficiente; el servidor debe aplicar una política estricta de *Zero-Trust* y *Fail-Closed* independientemente de la procedencia del cliente.

---

## 2. Decisión

Se adopta formalmente el principio de **Arquitectura Zero-Trust Perimetral con Matriz RBAC Fail-Closed** en el servidor Fastify:

1. **Política Fail-Closed por Defecto en `/api/*`:**
   Toda petición HTTP dirigida a rutas bajo el prefijo `/api/` requiere obligatoriamente una cabecera `Authorization: Bearer <token>` válida, respondiendo de forma inmediata y determinista con **HTTP 401 Unauthorized** (`error: "UNAUTHORIZED"`):
   ```json
   {
     "error": "UNAUTHORIZED",
     "message": "Cabecera Authorization con formato Bearer <token> requerida."
   }
   ```

2. **Allow-List Explícita de Rutas Públicas Exentas:**
   Únicamente las siguientes rutas están autorizadas para responder sin cabecera de autenticación:
   - Probes de orquestación y vivacidad: `/healthz`, `/readyz`, `/api/health`.
   - Configuración de entorno y feature flags de interfaz: `/api/config`.
   - Autenticación y emisión de tokens: `/api/auth/login`, `/api/auth/register`.
   - Inicialización idempotente de pruebas y semillas: `/api/demo/seed`.
   - Shell de navegación y assets estáticos: `/sw.js`, `/manifest.webmanifest`, `/icon.svg`, `/css/*`, `/js/*`, `/index.html`, `/app.css`.

3. **Preservación de Semántica HTTP 404 (Route Lookup):**
   Las rutas inexistentes en el árbol de Fastify (`request.is404 === true`) no deben ser interceptadas por el guardia 401, permitiendo que el manejador `setNotFoundHandler` retorne limpiamente `HTTP 404 Not Found`.

4. **Enforzamiento Determinista de la Matriz RBAC:**
   Una vez verificado el token JWT del usuario, el hook transversal aplica los siguientes niveles de autorización:
   - **`ADMIN`:** Acceso irrestricto a todos los módulos y operaciones del sistema.
   - **`SUPERVISOR`:** Acceso a Dashboard, Reportes, Alertas, Mantenimiento y Medidores de sus sedes asignadas. **Denegado estrictamente (HTTP 403 Forbidden)** en:
     - Creación/modificación de instalaciones (`/api/instalaciones`).
     - Creación de medidores en instalaciones que no tiene asignadas.
     - Directorio y asignación de usuarios (`/api/usuarios`).
     - Bitácora inmutable de auditoría (`/api/auditoria`).
     - Respaldos atómicos en caliente (`/api/admin/backup`).
     - Configuración de webhooks (excepto evaluación manual de calibraciones).
   - **`OPERADOR`:** Exclusivo para Modo Terreno. Puede consultar instalaciones y medidores asignados y registrar lecturas (`POST /api/lecturas`, `POST /api/lecturas/batch-sync`). **Denegado estrictamente (HTTP 403 Forbidden)** en:
     - Dashboard ejecutivo (`/api/dashboard/*`).
     - Reportes de consumo y facturación (`/api/reportes/*`).
     - Centro de alertas e incidentes (`/api/alertas/*`).
     - Mantenimiento y calibración (`/api/mantenimiento/*`).
     - Creación de instalaciones o medidores.
     - Usuarios, auditoría, webhooks, notificaciones y backups.

---

## 3. Reglas Inmutables para Agentes de IA

- **Obligaciones:**
  - El hook `preHandler` en `src/server.ts` debe evaluar primero `isPublicApiRoute` y rechazar con `HTTP 401` toda petición no pública que carezca de token válido antes de invocar cualquier controlador.
  - Al añadir cualquier endpoint nuevo bajo `/api/`, el agente debe asumir que es **privado y protegido por defecto**, a menos que un nuevo ADR apruebe explícitamente su inclusión en la allow-list pública.
  - Toda prueba de integración que interactúe con endpoints privados debe proveer cabeceras de autorización tipadas con tokens emitidos vía `signJwt` o `api.auth.login`.
- **Prohibiciones:**
  - Queda estrictamente prohibido utilizar condicionales permisivos tipo `if (user) { ... }` para validar permisos mutantes o sensibles. Las guardias deben validar primero la existencia del usuario (`if (!user) return 401;`) y luego su rol (`if (user.rol !== ...) return 403;`).
  - Prohibido delegar la seguridad del sistema a la ocultación visual de elementos en el cliente web. La seguridad del backend debe ser autónoma, autosuficiente y verificable por pruebas HTTP perimetrales.

---

## 4. Consecuencias

### Positivas
- **Inmunidad ante ataques directos por API:** Peticiones forjadas por herramientas externas (`curl`, Postman, bots) no pueden leer métricas ni inyectar datos en la base de datos sin un token válido.
- **Aislamiento riguroso por Rol:** Los operadores en terreno no tienen acceso a paneles analíticos ni a información corporativa de facturación o fallas.
- **Auditoría completa:** Cada operación realizada en la API queda irrevocablemente vinculada al `userId` del token autenticado.

### Negativas / Trade-offs
- Mayor disciplina en tests unitarios/E2E: Cualquier prueba que consuma endpoints privados debe generar e inyectar tokens JWT válidos.
