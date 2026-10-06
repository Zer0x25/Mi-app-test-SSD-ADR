# Spec: Explorabilidad de Rutas, Localización DOM y Observabilidad para Agentes de Navegador (feat-020)

> **Instrucción para el Agente:** Este documento constituye el contrato cerrado para el **Hito 15.3**. Todo el desarrollo debe ejecutarse bajo Agentic TDD y someterse a la barrera determinista `./scripts/verify.sh` y la suite E2E de Playwright.

---

## 1. Alcance y Límites de Archivos

- **Objetivo:**
  1. Dotar a la aplicación web de enrutamiento por hash (`#/dashboard`, `#/reportes`, `#/alertas`, etc.) enlazable, compatible con recarga (`F5`) y navegación atrás/adelante (`history.back()`, `history.forward()`).
  2. Implementar atributos `data-testid` estables, roles semánticos y etiquetas accesibles en paneles de vista, botones de navegación, modales, formularios, tablas y filtros.
  3. Asegurar que los estados de carga (`role="status"`, `data-testid="loading-state"`), estados vacíos (`data-testid="empty-state"`), estados de error con reintento (`data-testid="error-state"`, `data-testid="btn-retry"`) y modales (`data-state="open|closed"`) sean inequívocos en el DOM.
  4. Instrumentar el cliente HTTP (`ApiClient`) y la ventana global (`window.__DIAGNOSTICS__`) para registrar y exponer errores estructurados de consola y solicitudes fallidas con contexto enriquecido.
  5. Asegurar datos de prueba deterministas en `POST /api/demo/seed` y crear una suite E2E automatizada (`e2e/explorabilidad-agentes.spec.ts`) para certificar los recorridos principales.

- **Archivos editables autorizados:**
  - `public/index.html`
  - `public/app.js`
  - `public/js/api.js`
  - `public/js/components.js`
  - `src/server.ts`
  - `e2e/explorabilidad-agentes.spec.ts` (Nuevo)
  - `e2e/login-pantalla-real.spec.ts` (Corrección de carrera en inicialización)
  - `STATE.md`

- **Archivos protegidos (solo lectura):**
  - `src/core/*`
  - `docs/adr/*`

---

## 2. Criterios de Aceptación (Definition of Done)

### CA-1: Enrutamiento Hash Enlazable, Historial y Recarga
- Al invocar `switchRole(role)` o interactuar con las pestañas de navegación (navbar o drawer móvil), la URL debe actualizarse automáticamente con el hash correspondiente:
  - `#/login` para la pantalla de login.
  - `#/dashboard` (o `#/admin`) para el Dashboard ejecutivo.
  - `#/reportes` para la vista de Reportes y Facturas.
  - `#/alertas` para la vista de Alertas e Incidentes.
  - `#/mantenimiento` para la vista de Mantenimiento y Calibración.
  - `#/usuarios` para el Directorio de Usuarios.
  - `#/auditoria` para la Pista de Auditoría.
  - `#/webhooks` para la Gestión de Webhooks.
  - `#/notificaciones` para las Notificaciones Push y Telegram.
  - `#/operador` (o `#/terreno`) para el Modo Terreno.
- Al navegar hacia atrás (`history.back()`) o adelante (`history.forward()`), el listener `hashchange` debe conmutar automáticamente la vista en el DOM y actualizar los botones activos.
- Al recargar la página (`page.reload()` / F5) en una ruta específica (ej. `/#/reportes`), la aplicación debe inicializarse en dicha vista y no regresar forzosamente a la pantalla por defecto.
- Si un usuario no autenticado intenta acceder a una ruta protegida (ej. `/#/reportes`), se debe mostrar la vista `#/login`. Tras un inicio de sesión exitoso, se debe redirigir a la ruta solicitada inicialmente.

### CA-2: Localización de Controles (`data-testid`, Roles y Etiquetas Accesibles)
- Los paneles de vista deben contener `data-testid="view-[modulo]"`, `role="region"` y `aria-label`.
- Los botones de navegación principales (desktop y móvil) deben incluir `data-testid="nav-[modulo]"` y `data-testid="mobile-nav-[modulo]"`.
- Todos los modales deben tener `data-testid="modal-[nombre]"`, `role="dialog"`, `aria-modal="true"` y atributos `data-state="open"` / `data-state="closed"`.
- Los formularios dentro de los modales deben incluir `data-testid="form-[nombre]"` y sus botones de envío `data-testid="btn-submit-[nombre]"`.
- Los botones de apertura de modales y acciones principales deben tener identificadores claros (ej. `data-testid="btn-nuevo-medidor"`, `data-testid="btn-nueva-instalacion"`, `data-testid="btn-nuevo-tipo"`, `data-testid="btn-backup-sistema"`).
- Las tablas deben incluir `data-testid="table-[modulo]"` y los filtros principales `data-testid="filtro-[nombre]"`.

### CA-3: Estados DOM Consistentes (Carga, Vacío, Error y Modales)
- Los contenedores que cargan datos asíncronamente deben exponer temporalmente `data-testid="loading-state"`, `role="status"` o `aria-busy="true"`.
- Cuando no haya registros en un listado o búsqueda, debe renderizarse un contenedor con `data-testid="empty-state"` y `role="region"`.
- En caso de fallo de conexión o error en una carga, debe renderizarse `data-testid="error-state"`, `role="alert"` y el botón `data-testid="btn-retry"`.
- Al abrir un modal mediante `ModalManager.open()`, el elemento debe actualizar su atributo a `data-state="open"`; al cerrarse (`ModalManager.close()`), debe actualizar a `data-state="closed"`.

### CA-4: Diagnóstico Estructurado de Consola y Solicitudes Fallidas (`window.__DIAGNOSTICS__`)
- Ante un error HTTP (status >= 400), `ApiClient` debe registrar en consola un log formateado:
  `[API FAIL] [METHOD] [ENDPOINT] -> HTTP [STATUS] ([CODE]): [MESSAGE]`.
- Se debe exponer en `window.__DIAGNOSTICS__`:
  - `activeRoute`: ruta activa actual.
  - `lastApiError`: detalle del último error de red.
  - `apiErrors`: array circular con los últimos 20 errores capturados.
  - `uncaughtErrors`: excepciones capturadas por manejadores globales.
  - Métodos `clearErrors()` y `getSummary()`.

### CA-5: Datos Repetibles y Suite E2E de Recorridos Principales (`e2e/explorabilidad-agentes.spec.ts`)
- `POST /api/demo/seed` en `src/server.ts` debe asegurar lecturas y medidores baseline limpios y predecibles, retornando un objeto descriptivo `seedData`.
- La suite `e2e/explorabilidad-agentes.spec.ts` debe certificar:
  1. Navegación directa por hash a todas las pantallas clave y preservación de vista tras recarga (`page.reload()`).
  2. Navegación hacia atrás y adelante con `page.goBack()` y `page.goForward()`.
  3. Localización e interacción fluida con modales usando `data-testid` y verificación de `data-state="open|closed"`.
  4. Reconocimiento de estados vacíos (`data-testid="empty-state"`) ante filtros sin resultados.
  5. Registro y consulta de diagnósticos en `window.__DIAGNOSTICS__` ante solicitudes fallidas.
- Corrección de la condición de carrera en `e2e/login-pantalla-real.spec.ts` para asegurar 100% verde en toda la suite E2E.

---

## 3. Invariantes y Quality Gate
- El Quality Gate `./scripts/verify.sh` debe superarse con código de salida 0 (100% tests Vitest pasando).
- La suite completa de Playwright `npm run test:e2e` debe ejecutarse con 100% de pruebas pasando.
