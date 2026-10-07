# Spec: feat-026 — Edición y eliminación de tipos de medidor con bloqueo por uso + reasignación

> **Instrucción para el Agente:** Contrato cerrado bajo SDD + Agentic TDD. No escribir código de producción sin pruebas rojas previas. Modificar exclusivamente los archivos autorizados.

## 1. Propósito

Hoy `TipoMedidor` solo tiene alta y listado (`POST`/`GET /api/tipos-medidor`): no se puede editar ni eliminar desde API ni UI (`src/modules/medidores/medidores.controller.ts:30-54`). Se implementa el ciclo de vida completo con la regla pedida por el usuario:

- **Bloqueo por uso:** si el tipo tiene ≥1 medidor asociado (activo o archivado), la edición, el archivado y la eliminación física se rechazan con error tipado.
- **Vía de escape:** el medidor puede **reasignarse** a otro tipo (`PATCH /medidores/:id` acepta `tipoMedidorId`), liberando el tipo original para editar/eliminar.

## 2. Archivos editables autorizados

- `specs/feat-026-tipos-edicion-eliminacion-reasignacion.md`
- `src/modules/medidores/medidores.schema.ts`
- `src/modules/medidores/medidores.service.ts`
- `src/modules/medidores/medidores.repository.ts`
- `src/modules/medidores/medidores.controller.ts`
- `src/modules/auditoria/auditoria.schema.ts`
- `src/server.ts` (solo regla RBAC tipos + cómputo ya existente)
- `public/js/api.js`
- `public/index.html`
- `public/app.js`
- `tests/modules/medidores/medidores.service.test.ts`
- `tests/modules/medidores/medidores.controller.test.ts` (solo sincronización del mock `IMedidoresRepository` exigida por regla 25)
- `e2e/tipos-gestion.spec.ts`
- `STATE.md`

Protegidos: `src/core/*`, `docs/adr/*`, resto de `src/modules/*`.

## 3. Modelo y Zod

Sin cambios Prisma (se reutiliza `TipoMedidor.activo` + relación `medidores`).

- `EditarTipoMedidorInputSchema`: todos opcionales, al menos 1 campo: `nombre` (3–100), `recurso`, `unidad`/`unidadMedida`, `multiplicador` (positive, ≤1e6), `capacidadMaxima` (positive nullable, `null` la limpia).
- `EditarMedidorInputSchema`: añade `tipoMedidorId: uuid opcional` (reasignación).
- Errores nuevos en `medidores.schema.ts`:
  - `TipoMedidorEnUsoError`: `code "TIPO_MEDIDOR_EN_USO"`, `statusCode 409`. Mensaje: `No se puede <operación> el tipo '<nombre>' porque tiene <n> medidor(es) asociado(s). Reasigne los medidores a otro tipo primero.` + `details { tipoId, count, operacion }`.
  - `TipoMedidorConMedidoresNoEliminableError`: `code "TIPO_MEDIDOR_CON_MEDIDORES_NO_ELIMINABLE"`, `statusCode 422`, para borrado físico con medidores (incluye archivados).
- `MedidoresErrorCode`: añadir ambos códigos.
- Auditoría (`auditoria.schema.ts`): añadir `TIPO_MEDIDOR_EDITADO`, `TIPO_MEDIDOR_ARCHIVADO`, `TIPO_MEDIDOR_RESTAURADO`, `TIPO_MEDIDOR_ELIMINADO`. La reasignación de medidor reutiliza `MEDIDOR_EDITADO` con `antes/después.tipoMedidorId`.

## 4. Invariantes

1. **Bloqueo por uso (edición):** `editarTipoMedidor` cuenta `countMedidoresByTipo(id)` (todos los estados); si >0 → `TipoMedidorEnUsoError(operacion="editar")`. Sin medidores: valida nombre duplicado (otro id → 409), aplica patch, audita `TIPO_MEDIDOR_EDITADO` con antes/después.
2. **Bloqueo por uso (archivado/restauración/eliminación):** `archivarTipo`/`eliminarTipoFisico` con count>0 → `TipoMedidorEnUsoError(operacion="archivar"|"eliminar")` / `TipoMedidorConMedidoresNoEliminableError` en borrado. Sin medidores: archivar (`activo=false`), restaurar (`activo=true`), borrado físico (`delete`). Borrado físico además exige ADMIN (vía RBAC) y audita snapshot.
3. **Reasignación:** `editarMedidor` acepta `tipoMedidorId` distinto al actual: verifica existencia del nuevo tipo y `activo=true` (si no → `TipoMedidorNotFoundError`/`TipoMedidorInactivoError`), actualiza y audita el cambio de tipo dentro de `MEDIDOR_EDITADO`. No toca lecturas históricas (conservan `multiplicadorAplicado` original); futuras lecturas usan el factor efectivo del nuevo tipo.
4. **RBAC (fail-closed):** mutaciones de tipos (`POST`/`PATCH`/`DELETE /api/tipos-medidor*`) solo `ADMIN` (nueva regla en `server.ts` espejo de instalaciones; 403 `ACCESO_DENEGADO` para otros). Reasignación cubierta por regla existente `PATCH /api/medidores` solo ADMIN.
5. **Listado con estado:** `GET /api/tipos-medidor?estado=activos|archivados|todos` (ADMIN ve según filtro; no-ADMIN siempre activos).

## 5. Criterios de aceptación (Agentic TDD)

### Suite 1 — Bloqueo por uso (unit, `medidores.service.test.ts`)
- Crear tipo A, crear medidor con tipo A → `editarTipoMedidor(A, {nombre})` rechaza `TipoMedidorEnUsoError`; `archivarTipo(A)` rechaza; `eliminarTipoFisico(A)` rechaza 422.
- Reasignar medidor a tipo B vía `editarMedidor(id, {tipoMedidorId: B})` → ok, auditoría con cambio de tipo.
- Tras reasignar (count A = 0): `editarTipoMedidor(A)` ok (read-after-write vía `findTipoById`), `eliminarTipoFisico(A)` ok y `findTipoById(A)` → null.
- `editarMedidor` a tipo inexistente → `TipoMedidorNotFoundError`; a tipo archivado → `TipoMedidorInactivoError`.

### Suite 2 — E2E `e2e/tipos-gestion.spec.ts` (ADMIN, `#/parque`)
- Crear tipo E2E + medidor con ese tipo → intentar editar tipo vía `window.api` → 409 `TIPO_MEDIDOR_EN_USO`; reasignar medidor a tipo seed vía UI/API → editar tipo ok (verificado con GET) → archivar → aparece en filtro archivados → eliminar físico ok (GET 404).
- Prohibición de `any` en `page.evaluate` (interfaces tipadas).

### Quality Gate
- `npm run typecheck`, `npm run lint`, `npx vitest run tests/modules/medidores/`, `npx playwright test e2e/tipos-gestion.spec.ts` verdes; `./scripts/verify.sh` salida 0 sin regresiones.
