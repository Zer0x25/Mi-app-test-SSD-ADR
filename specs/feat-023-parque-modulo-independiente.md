# Spec: feat-023-parque-modulo-independiente — Dashboard informativo y Módulo Sedes & Medidores

> **Instrucción para el Agente:** Este documento es un contrato cerrado bajo SDD + Agentic TDD. No se escribe código de producción sin antes escribir las pruebas que satisfagan los criterios de aceptación. Modificar exclusivamente los archivos autorizados.

---

## 1. Propósito y Alcance de Negocio

El Dashboard actual mezcla dos responsabilidades incompatibles:

1. **Información ejecutiva** (KPIs, desatendidos >24h, consumos netos, actividad reciente).
2. **Gestión del parque** (altas, edición, archivado/restauración y borrado físico de Instalaciones y Medidores + tipos).

Esto genera confusión operativa, sobrecarga visual y viola el principio de separación de responsabilidades (feat-004 define Dashboard como módulo de solo lectura).

**Objetivo:** convertir el Dashboard en un lugar puramente informativo y dotar a la creación/edición de Instalaciones y Medidores de su propia página/módulo independiente ("Sedes & Medidores" / Parque).

---

## 2. Límites y Archivos Editables Autorizados

- **Archivos editables autorizados:**
  - `specs/feat-023-parque-modulo-independiente.md`
  - `public/index.html`
  - `public/app.js`
  - `e2e/parque-modulo.spec.ts`
  - `e2e/catalogo-aprovisionamiento.spec.ts`
  - `e2e/explorabilidad-agentes.spec.ts`
  - `e2e/login-rbac.spec.ts`
  - `e2e/responsive-mobile.spec.ts`
  - `STATE.md`
- **Archivos protegidos (prohibido modificar):**
  - `src/core/*`
  - `docs/adr/*`
  - `src/modules/*`
  - `prisma/schema.prisma`
  - `public/js/api.js`
  - `public/js/components.js`

> Sin cambios de backend, contratos Zod, Prisma o reglas de dominio. Reorganización 100% frontend + navegación.

---

## 3. Diseño Funcional

### 3.1 Dashboard (viewAdmin) — Solo informativo

La vista `#/dashboard` (`#viewAdmin`, `data-testid="view-admin"`) DEBE contener únicamente:

- `view-header` con título "Tablero Ejecutivo de Medición" y descripción, SIN botones de alta (`btn-nuevo-medidor`, `btn-nueva-instalacion`, `btn-nuevo-tipo` eliminados de esta vista).
- `kpi-grid` (instalaciones, medidores, lecturas, desatendidos).
- `dashboard-columns` (desatendidos + consumos).
- Feed `listaActividadReciente`.
- Queda PROHIBIDO renderizar `#seccionGestionParque`, `#tablaGestionInstalaciones`, `#tablaGestionMedidores` dentro de `#viewAdmin`.

### 3.2 Nuevo Módulo Parque (viewParque) — Gestión del parque

Nueva vista `#viewParque` con:

- `data-testid="view-parque"`, `role="region"`, `aria-label="Gestión de Sedes y Medidores"`, `aria-labelledby="headingParque"`.
- `view-header` con título "Sedes & Medidores", descripción operativa y `view-actions` con los 3 botones de alta trasladados:
  - `#btnOpenModalMedidor` (`data-testid="btn-nuevo-medidor"`)
  - `#btnOpenModalInstalacion` (`data-testid="btn-nueva-instalacion"`)
  - `#btnOpenModalTipo` (`data-testid="btn-nuevo-tipo"`)
- Card `#seccionGestionParque` (`data-testid="seccion-gestion-parque"`) trasladada íntegra (tabs Sedes/Medidores, `filtroParqueEstado`, `btnRefrescarParque`, `tablaGestionInstalaciones`, `tablaGestionMedidores`, tbodys) sin alterar IDs ni testids para preservar `createInstalacionRow` / `createMedidorRow`, `data-label`, `.cell-stacked`, `.badges-wrapper` y modales de edición (`modalEditarInstalacion`, `modalEditarMedidor`).
- Los modales de alta/edición (`modalInstalacion`, `modalTipo`, `modalMedidor`, `modalEditarInstalacion`, `modalEditarMedidor`) permanecen a nivel `body` (no duplicar).

### 3.3 Navegación y Routing (ADR 0015)

- Nuevo botón desktop `#tabParqueBtn` (`data-testid="nav-parque"`, `onclick="switchRole('parque')"`) ubicado inmediatamente después de Dashboard.
- Nuevo botón móvil `#mobileTabParqueBtn` (`data-testid="mobile-nav-parque"`) en el drawer, misma posición.
- `ROUTE_HASH_MAP`: `parque: "#/parque"`. `parseRouteKeyFromHash` reconoce `"parque"`. `getHashForRouteKey("parque")` retorna `"#/parque"`. Alias legacy no requeridos.
- `switchRole("parque")`: activa tab desktop+móvil, muestra `#viewParque`, invoca `cargarParqueAdmin()` (y `cargarSelectsGlobales()` si caches vacíos). Resto de rutas intactas.
- `hashchange`, `redirect_after_login`, `window.__DIAGNOSTICS__.activeRoute` y `document.body.dataset.appReady` preservados.
- Deep-linking: `/#/parque` directo + `F5` mantiene vista; back/forward sincroniza tabs.

### 3.4 RBAC y Permisos UI (matriz ADR 0013 intacta)

- `aplicarPermisosUI()`:
  - `btnNuevaInstalacion` / `btnNuevoTipo`: visibles solo `ADMIN`.
  - `btnNuevoMedidor`: visible `ADMIN` + `SUPERVISOR`.
  - `tabParqueBtn` / `mobileTabParqueBtn`: visibles para `ADMIN` y `SUPERVISOR`, ocultos (`display:none`) para `OPERADOR` (igual que Dashboard/Reportes).
  - `OPERADOR` conmutando a `parque` es redirigido a `operador` con Toast de permisos (misma guardia que resto de vistas admin).
  - `cargarParqueAdmin()` solo se invoca desde vista parque o tras mutaciones; `cargarDashboard()` deja de invocar `cargarParqueAdmin()` (dashboard ya no lo contiene).
- Tras `submitNuevaInstalacion`, `submitNuevoTipo`, `submitNuevoMedidor`, `submitEditarInstalacion/Medidor`, `archivar/restaurar/eliminar`: refrescar `cargarParqueAdmin()` (+ `cargarSelectsGlobales()` y `cargarDashboard()` en segundo plano si dashboard visible o para KPIs), nunca romper si `#viewAdmin` no contiene parque.

### 3.5 Responsive y Accesibilidad

- Sin cambios de CSS: la card y tablas reutilizan `.data-table`, stacked-cards `@media (max-width:768px)`, `min-height:44px` en acciones, `zero horizontal overflow` (Reglas 18-19).
- Drawer cerrado usa `visibility:hidden` (Regla 18) — reutilizar patrón existente.
- Todos los botones nuevos con `min-height:44px` en móvil vía clases existentes.

---

## 4. Invariantes (lo que NUNCA debe ocurrir)

1. **Dashboard sin mutaciones:** `#viewAdmin` jamás contiene botones de alta ni tablas de gestión. Es solo lectura.
2. **Sin duplicación de IDs:** cada `id` (`seccionGestionParque`, `tablaGestion*`, `btnOpenModal*`) existe exactamente una vez en el DOM (en `#viewParque`).
3. **Sin regresión funcional:** altas, edición con gracia/cristalizado, archivado, restauración y borrado físico siguen operando con los mismos `ApiClient` y `Components`.
4. **Sin ruptura de rutas:** `#/dashboard`, `#/reportes`, `#/alertas`, `#/mantenimiento`, `#/usuarios`, `#/auditoria`, `#/webhooks`, `#/notificaciones`, `#/operador`, `#/login` conservan comportamiento.
5. **Sin fugas RBAC:** `OPERADOR` nunca ve ni navega al parque; `SUPERVISOR` nunca ve botones de sede/tipo.

---

## 5. Criterios de Aceptación (Agentic TDD — Fase Roja luego Verde)

### Suite E2E nueva `e2e/parque-modulo.spec.ts`

- [ ] **CA-1 Dashboard informativo:** en `#/dashboard`, `view-admin` visible; `seccion-gestion-parque` inexistente (`count==0`); `btn-nuevo-medidor`, `btn-nueva-instalacion`, `btn-nuevo-tipo` inexistentes en dashboard.
- [ ] **CA-2 Módulo parque navegable:** clic en `nav-parque` muestra `view-parque`, URL contiene `#/parque`, tab activo; acceso directo `/#/parque` + `reload()` mantiene `view-parque` visible.
- [ ] **CA-3 Gestión operativa en parque:** en `#/parque`, `seccion-gestion-parque` visible; ambas tablas existen; `btn-nueva-instalacion` abre `modal-instalacion` con `data-state="open"` y cierra a `"closed"`; `btn-nuevo-medidor` abre `modal-medidor` igual; filtro `filtro-parque-estado` conmuta y recarga filas.
- [ ] **CA-4 Alta end-to-end desde parque:** crear sede con timestamp único vía `btn-nueva-instalacion` muestra `toast-success`, cierra modal y la fila aparece en `tbody-gestion-instalaciones`; crear medidor análogo aparece en `tbody-gestion-medidores`.
- [ ] **CA-5 RBAC:** como `OPERADOR`, `nav-parque` oculto y `goto("/#/parque")` redirige a `view-operador`; como `SUPERVISOR`, parque visible pero `btn-nueva-instalacion` y `btn-nuevo-tipo` ocultos y `btn-nuevo-medidor` visible.
- [ ] **CA-6 Regresión dashboard informativo:** KPIs (`kpiTotalInstalaciones`), `listaDesatendidos`, `listaConsumos`, `listaActividadReciente` siguen cargando datos reales en `#/dashboard`.

### Suites E2E existentes actualizadas (sin cambio de intención, solo de ubicación)

- [ ] `catalogo-aprovisionamiento.spec.ts`: navega primero a `#/parque` (o clic `nav-parque`) antes de usar botones de alta.
- [ ] `explorabilidad-agentes.spec.ts`: CA-2/CA-3 buscan botones de alta en `#/parque`, no en dashboard; CA-1 incluye `#/parque` en recorrido hash + back/forward.
- [ ] `login-rbac.spec.ts`: aserciones de visibilidad de botones de alta se evalúan en `#/parque`.
- [ ] `responsive-mobile.spec.ts`: localiza `btn-nuevo-medidor` dentro de `#viewParque`.

### Quality Gate

- [ ] `npm run typecheck` (sin cambios backend, debe seguir verde).
- [ ] `npm run lint` limpio (sin `any` en `page.evaluate`, selectores acotados a vista activa).
- [ ] `npx playwright test e2e/parque-modulo.spec.ts` verde.
- [ ] `./scripts/verify.sh` salida 0 (Vitest + E2E completos sin regresiones).

---

## 6. Plan de Implementación (Fase Verde, solo archivos autorizados)

1. `public/index.html`: añadir nav desktop+móvil parque; eliminar `view-actions` de `#viewAdmin`; eliminar `#seccionGestionParque` de `#viewAdmin`; insertar nueva `section#viewParque` con header + card trasladada.
2. `public/app.js`: extender `ROUTE_HASH_MAP` + `parseRouteKeyFromHash`; añadir rama `parque` en `switchRole` (+ tabs/views arrays); actualizar `aplicarPermisosUI` (parque tabs + botones ahora en parque); desacoplar `cargarParqueAdmin()` de `cargarDashboard()`; re-rutear `submit*` y `archivar/restaurar/eliminar` a refrescar parque primero.
3. E2E: crear `e2e/parque-modulo.spec.ts` (Fase Roja primero, debe fallar); luego actualizar 4 suites legacy.
4. `STATE.md`: registrar hito al cierre.
