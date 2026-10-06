# ADR 0015: Explorabilidad de Rutas, Identificación DOM Semántica y Observabilidad para Agentes de Navegador

- **Fecha:** 2026-10-05
- **Estado:** Aceptado
- **Afecta a:** Frontend (`public/index.html`, `public/app.js`, `public/js/api.js`, `public/js/components.js`), Suites E2E Playwright (`e2e/*`), Backend Semilla (`src/server.ts`).

---

## 1. Contexto y Problema

A medida que el sistema Medidores madura y se somete a flujos de auditoría automatizada y bug hunting mediante agentes de software autónomos basados en navegador (Browser Subagents, Playwright, Puppeteer y DevTools MCP), se identificaron varias fricciones de explorabilidad y testabilidad:

1. **Ausencia de enrutamiento enlazable (Deep Linking) y navegación rota en historial:**
   - La aplicación conmutaba vistas modificando clases CSS (`.active`) en el DOM sin sincronizar la URL (`window.location.hash`).
   - Al ejecutar recarga (`page.reload()` / F5) o utilizar los botones de atrás/adelante del navegador (`history.back()`, `history.forward()`), el agente perdía la pantalla activa y el contexto, reiniciándose a la vista por defecto.
   - Imposibilidad de navegar directamente a una pantalla específica mediante URL (ej. `/#/reportes`, `/#/alertas`, `/#/mantenimiento`).
2. **Localización frágil de controles en el DOM:**
   - Carencia de identificadores de prueba estables (`data-testid`) en paneles, modales, formularios, botones de acción y filtros, forzando a los agentes a depender de selectores de texto o clases CSS que pueden variar o colisionar con vistas inactivas.
3. **Falta de visibilidad de estados asíncronos y transicionales en el DOM:**
   - Estados de carga (*spinners* / *loading skeletons*), estados vacíos (*empty states* tras búsquedas sin resultados) y modales abiertos/cerrados no exponían atributos semánticos consistentes (`role="status"`, `role="region"`, `role="alert"`, `data-testid`, `data-state="open|closed"`), dificultando a los agentes determinar si una consulta o mutación seguía en curso o había finalizado.
4. **Opacidad diagnóstica ante errores de consola y peticiones fallidas:**
   - Los fallos de API no contaban con un canal unificado de diagnóstico enriquecido accesible programmaticamente por agentes de navegador (`window.__DIAGNOSTICS__`), dejando únicamente trazas parciales en `console.error` sin correlación de endpoint, método, código de error ni payload.
5. **Condiciones de carrera en sesiones y dependencia de datos acumulados:**
   - Se detectaron condiciones de carrera durante la inicialización de sesiones en pruebas sintéticas donde el DOM renderizaba temporalmente el contenedor de login antes de que la lógica de desarrollo resolviera la sesión, provocando timeouts esporádicos en localizadores.
   - Las pruebas requerían un mecanismo de datos de prueba determinista, repetible y limpio, sin acumulación infinita de lecturas previas.

---

## 2. Decisión

Se adopta el **Estándar de Explorabilidad, Identificación Semántica DOM y Observabilidad Agéntica**:

### 1. Sistema de Enrutamiento Hash Deep-Linking con Soporte de Historial
- Se implementa un enrutador hash cliente (`HashRouter`) en `public/app.js`:
  - Rutas canónicas: `#/login`, `#/dashboard` (con alias `#/admin`), `#/reportes`, `#/alertas`, `#/mantenimiento`, `#/usuarios`, `#/auditoria`, `#/webhooks`, `#/notificaciones`, `#/operador`.
  - Escucha activa del evento `hashchange` y `popstate`: la navegación atrás y adelante del navegador actualiza fluidamente la vista activa y los estados de navegación en navbar y menú móvil.
  - Soporte de recarga (`F5`): al cargar la página, se extrae el hash de la URL; si el usuario está autenticado y tiene permisos RBAC, se hidrata directamente la vista correspondiente; si no está autenticado, se retiene la ruta solicitada como destino post-login.
  - Sincronización bidireccional: invocar `switchRole(role)` actualiza la URL (`window.location.hash = ...`), y cambiar el hash en la barra de direcciones conmutará la vista y cargará sus datos.

### 2. Identificación Semántica y Atributos `data-testid` Estables
- Todo panel de vista principal incorpora `data-testid="view-[modulo]"`, `role="region"` y `aria-label`.
- Todo control de navegación principal (navbar y drawer móvil) cuenta con `data-testid="nav-[modulo]"` y `data-testid="mobile-nav-[modulo]"`.
- Todos los modales del sistema incorporan:
  - `data-testid="modal-[nombre]"`
  - `role="dialog"` y `aria-modal="true"`
  - `data-state="open"` (cuando está abierto) y `data-state="closed"` (cuando está cerrado)
  - Botón de cierre: `data-testid="btn-close-modal-[nombre]"`
  - Formulario interno: `data-testid="form-[nombre]"`
  - Botón de envío: `data-testid="btn-submit-[nombre]"`
- Todos los botones de acción primarios, filtros de búsqueda, selectores y tablas incorporan `data-testid` estables e inequívocos (ej. `data-testid="btn-nueva-instalacion"`, `data-testid="table-usuarios"`, `data-testid="filter-search"`).

### 3. Estados Visibles e Identificables en el DOM
- **Carga (Loading):** Los contenedores en proceso de hidratación exponen `data-testid="loading-state"`, `role="status"` y `aria-live="polite"`.
- **Vacío (Empty State):** Contenedores sin resultados de búsqueda o tablas vacías incorporan `data-testid="empty-state"`, `role="region"` y mensaje legible.
- **Error (Error State):** Fallos de conexión o carga en paneles muestran `data-testid="error-state"`, `role="alert"` y botón de recuperación `data-testid="btn-retry"`.

### 4. Capa de Diagnósticos Estructurados y Observabilidad en Cliente (`window.__DIAGNOSTICS__`)
- `ApiClient` (`public/js/api.js`) emite logs de consola enriquecidos ante fallos:
  `[API FAIL] ${method} ${endpoint} -> HTTP ${status} (${code}): ${message}`.
- Se expone en el objeto global `window.__DIAGNOSTICS__`:
  - `activeRoute`: ruta hash actual.
  - `lastApiError`: último error de API capturado con endpoint, status, código, detalle y timestamp.
  - `apiErrors`: historial circular (últimos 20 errores).
  - `uncaughtErrors`: excepciones globales capturadas por `window.onerror` y `unhandledrejection`.
  - `currentUser`: perfil del usuario autenticado actual.
  - Métodos utilitarios: `clearErrors()`, `getSummary()`.
- Cualquier agente de pruebas o herramienta MCP puede inspeccionar `window.__DIAGNOSTICS__` mediante `page.evaluate()` para diagnosticar fallos de inmediato.

### 5. Semilla Determinista Idempotente y Pruebas E2E Dedicadas
- El endpoint `POST /api/demo/seed` garantiza un estado baseline repetible y devuelve un reporte estructurado de entidades disponibles para tests.
- Se implementa la suite E2E `e2e/explorabilidad-agentes.spec.ts` validando:
  - Deep linking directo por hash y preservación de vista tras recarga (`page.reload()`).
  - Navegación hacia atrás y adelante con `page.goBack()` y `page.goForward()`.
  - Localización de controles mediante `data-testid` y roles accesibles.
  - Detección de estados en el DOM (modales con `data-state`, loading, empty states y tablas).
  - Telemetría diagnóstica ante errores en `window.__DIAGNOSTICS__`.

---

## 3. Reglas Inmutables para Agentes de IA

- **Obligaciones:**
  1. Al añadir una nueva vista, modal, botón de acción clave o formulario, el agente DEBE incluir obligatoriamente su atributo `data-testid` correspondiente y registrar su ruta en el `HashRouter`.
  2. Todo modal DEBE sincronizar su atributo `data-state="open|closed"` junto con su clase `.open`.
  3. En pruebas automatizadas con Playwright, los agentes deben priorizar localizadores por `data-testid` (`page.getByTestId(...)`) o roles accesibles (`page.getByRole(...)`), evitando selectores frágiles por coincidencia de texto genérico en vistas inactivas.
  4. Los fallos en solicitudes de red frontend deben registrarse siempre en `window.__DIAGNOSTICS__`.
- **Prohibiciones:**
  1. Prohibido manipular la navegación interna sin sincronizar `window.location.hash`.
  2. Prohibido eliminar `data-testid` existentes bajo pretexto de simplificación de marcado.

---

## 4. Consecuencias

### Positivas
- **Explorabilidad Absoluta:** Los agentes de navegador pueden saltar directamente a cualquier sección usando URLs simples (`/#/modulo`).
- **Resiliencia ante Recargas:** La sesión y la pantalla activa persisten durante F5 y navegación de historial.
- **Diagnóstico Inmediato:** Trazas claras de errores HTTP y estado del sistema sin necesidad de inferir a ciegas.
- **Determinismo en Testing:** Cero carreras de sesión y localizadores robustos en todas las resoluciones.

### Negativas / Trade-offs
- Aumento menor en atributos de marcado HTML (atributos `data-testid` y `data-state`), con impacto nulo en rendimiento.
