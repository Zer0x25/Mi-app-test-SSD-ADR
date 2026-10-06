# Spec: Aislamiento Territorial y Filtrado de Sedes Asignadas en Matriz RBAC (Location Scoping)

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias e integración que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Propósito y Alcance de Negocio

Habiéndose formalizado en ADR 0013 y `feat-005` la matriz RBAC para los roles `ADMIN`, `SUPERVISOR` y `OPERADOR`, se detectó una brecha de aislamiento territorial (*Location Scoping*): mientras que el Modo Terreno y el Alta de Medidores respetan estrictamente las instalaciones asignadas (`AsignacionOperador`), los módulos de Dashboard, Reportes, Alertas, Mantenimiento y los listados generales de Instalaciones y Medidores exponen la totalidad de los datos de la empresa sin filtrar por las sedes asignadas al usuario autenticado.

Esta especificación implementa el principio de **Menor Privilegio (Least Privilege)** y **Aislamiento Multisede Determinista**:
1. **`ADMIN`:** Ámbito global irrestricto. Consulta y opera sobre todas las instalaciones del sistema.
2. **`SUPERVISOR`:** Ámbito limitado estrictamente a sus instalaciones asignadas.
   - **Dashboard (`/api/dashboard/*`):** KPIs, medidores desatendidos, consumos y telemetría reciente calculados exclusivamente sobre sus instalaciones asignadas.
   - **Reportes (`/api/reportes/*`):** Consumos consolidados y facturas filtrados por sus instalaciones asignadas; bloqueo con HTTP 403 si intenta consultar o registrar facturas de sedes ajenas.
   - **Alertas (`/api/alertas/*`):** Incidentes y resúmenes de severidad limitados a sus instalaciones asignadas; bloqueo con HTTP 403 si intenta resolver incidentes de sedes ajenas.
   - **Mantenimiento (`/api/mantenimiento/*`):** Bitácora, fichas y registro de intervenciones limitados a medidores de sus instalaciones asignadas; bloqueo con HTTP 403 ante medidores ajenos.
   - **Catálogo General (`GET /api/instalaciones`, `GET /api/medidores`):** Retorna únicamente las instalaciones y medidores de sus sedes asignadas.
3. **`OPERADOR`:** Ámbito limitado a sus instalaciones asignadas.
   - Acceso exclusivo a Modo Terreno (`#/operador`).
   - `GET /api/instalaciones` y `GET /api/medidores` limitados a sus instalaciones asignadas.
   - Redirección y contención estricta en frontend para evitar cualquier fuga visual o retención de vistas administrativas residuales.

---

## 2. Límites y Archivos Editables Autorizados

- **Archivos editables autorizados:**
  - `specs/feat-021-aislamiento-territorial-rbac-multi-sede.md`
  - `src/server.ts`
  - `src/modules/dashboard/dashboard.repository.ts`
  - `src/modules/dashboard/dashboard.service.ts`
  - `src/modules/dashboard/dashboard.controller.ts`
  - `src/modules/reportes/reportes.repository.ts`
  - `src/modules/reportes/reportes.service.ts`
  - `src/modules/reportes/reportes.controller.ts`
  - `src/modules/alertas/alertas.repository.ts`
  - `src/modules/alertas/alertas.service.ts`
  - `src/modules/alertas/alertas.controller.ts`
  - `src/modules/mantenimiento/mantenimiento.repository.ts`
  - `src/modules/mantenimiento/mantenimiento.service.ts`
  - `src/modules/mantenimiento/mantenimiento.controller.ts`
  - `src/modules/medidores/medidores.repository.ts`
  - `src/modules/medidores/medidores.service.ts`
  - `src/modules/medidores/medidores.controller.ts`
  - `src/modules/instalaciones/instalaciones.repository.ts`
  - `public/app.js`
  - `tests/modules/dashboard/dashboard.service.test.ts`
  - `tests/modules/reportes/reportes.service.test.ts`
  - `tests/modules/alertas/alertas.service.test.ts`
  - `tests/modules/mantenimiento/mantenimiento.service.test.ts`
  - `tests/server.location-scoping.test.ts`
  - `STATE.md`
- **Archivos protegidos:**
  - `src/core/config.ts`
  - `src/core/errors.ts`
  - `docs/adr/*`

---

## 3. Contratos de Datos y Esquemas

Los esquemas Zod existentes se mantienen compatibles hacia atrás. En los servicios y repositorios se añade el parámetro opcional `allowedInstalacionIds?: string[]`:
- Si `allowedInstalacionIds` es `undefined`, el repositorio/servicio opera en modo **ADMIN** (sin filtro de sede).
- Si `allowedInstalacionIds` es un arreglo de strings (ej: `['inst-1', 'inst-2']`), el repositorio/servicio filtra las entidades correspondientes con `instalacionId: { in: allowedInstalacionIds }`.
- Si `allowedInstalacionIds` es un arreglo vacío `[]` (usuario sin sedes asignadas), retorna resultados vacíos (KPIs en 0, listas vacías).

---

## 4. Errores de Dominio Tipados

- `AccesoDenegadoError` (HTTP 403 - `src/core/errors.ts`)
- `InstalacionNoAsignadaError` (HTTP 403 - `src/modules/instalaciones/instalaciones.schema.ts` / `src/modules/usuarios/usuarios.schema.ts`)

---

## 5. Criterios de Aceptación (Agentic TDD)

### Suite 1: Dashboard Scoping
1. `DashboardService.obtenerKpis(allowedIds)` debe computar instalaciones, medidores y lecturas restringidas exclusivamente a los IDs autorizados.
2. `DashboardService.obtenerMedidoresDesatendidos(horas, allowedIds)` debe listar medidores desatendidos únicamente de las instalaciones autorizadas.
3. `DashboardService.obtenerConsumoPorInstalacion(allowedIds)` debe agrupar consumos solo de las instalaciones autorizadas.
4. `DashboardService.obtenerActividadReciente(limit, allowedIds)` debe listar lecturas solo de medidores pertenecientes a las instalaciones autorizadas.

### Suite 2: Reportes Scoping
1. `ReportesService.obtenerConsumoConsolidado(filtro, allowedIds)` debe rechazar con 403 si `filtro.instalacionId` no pertenece a `allowedIds`. Si no se pasa `filtro.instalacionId`, debe filtrar por todas las sedes de `allowedIds`.
2. `ReportesService.obtenerFacturas(allowedIds)` debe listar facturas únicamente de las instalaciones en `allowedIds`.
3. `ReportesService.registrarFactura(input, allowedIds)` debe rechazar con 403 si `input.instalacionId` no está en `allowedIds`.

### Suite 3: Alertas y Mantenimiento Scoping
1. `AlertasService.listarIncidentes(filtro, allowedIds)` debe filtrar incidentes solo de las instalaciones en `allowedIds`.
2. `AlertasService.resolverIncidente(id, notas, allowedIds)` debe rechazar con 403 si el incidente pertenece a una instalación ajena.
3. `MantenimientoService.listarMantenimientos(filtro, allowedIds)` debe retornar bitácoras solo de medidores en instalaciones de `allowedIds`.
4. `MantenimientoService.obtenerFichaMedidor(medidorId, allowedIds)` debe rechazar con 403 si el medidor pertenece a una instalación ajena.
5. `MantenimientoService.registrarMantenimiento(input, allowedIds)` debe rechazar con 403 si el medidor pertenece a una instalación ajena.

### Suite 4: Endpoints HTTP y Servidor (Integración)
1. `GET /api/instalaciones`: `ADMIN` recibe todas las instalaciones activas; `SUPERVISOR` y `OPERADOR` reciben únicamente sus instalaciones asignadas.
2. `GET /api/medidores`: `ADMIN` recibe todos los medidores; `SUPERVISOR` y `OPERADOR` reciben únicamente medidores de sus instalaciones asignadas.
3. `GET /api/dashboard/*`: `SUPERVISOR` recibe métricas solo de sus sedes asignadas.
4. `GET /api/reportes/consumos`: `SUPERVISOR` recibe consumos solo de sus sedes asignadas.
5. `GET /api/alertas/incidentes`: `SUPERVISOR` recibe incidentes solo de sus sedes asignadas.
6. `GET /api/mantenimiento`: `SUPERVISOR` recibe mantenimientos solo de sus sedes asignadas.

### Suite 5: Frontend y Resiliencia de Sesión
1. Al iniciar sesión como `OPERADOR`, la interfaz debe conmutar deterministamente a `#/operador`, garantizando que ninguna vista administrativa quede activa ni visible.
2. Los selectores de sede en Reportes y Mantenimiento para `SUPERVISOR` deben contener únicamente sus sedes asignadas.
