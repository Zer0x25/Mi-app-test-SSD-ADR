# Spec: Archivar (Soft Delete), Edición Segura y Ventana de Gracia / Marcha Blanca (30 días)

> **Instrucción para el Agente:** Este documento es un contrato cerrado de desarrollo bajo metodología Spec-Driven Development (SDD) y Agentic TDD. No se escribe código de producción sin antes escribir las pruebas unitarias e integración que satisfagan estos criterios de aceptación.

---

## 1. Propósito y Alcance de Negocio

El sistema requiere soportar el ciclo de vida completo de **Instalaciones** y **Medidores**, resolviendo la necesidad operativa de:
1. **Archivado (Soft Delete) y Restauración:** Ocultar entidades retiradas de servicio sin destruir su historial metrológico, lecturas históricas, alertas, órdenes de mantenimiento o facturas asociadas.
2. **Edición Resistente a Cambios de Nombre:** Permitir actualizar libremente nombres comerciales, descripciones o ubicaciones sin poner en riesgo las asignaciones ni relaciones de datos (las cuales permanecen blindadas mediante IDs inmutables).
3. **Identificador Humano Corto para Instalaciones:** Dotar a las Instalaciones de un campo `codigo` (ej. `INS-01`, `PLT-MAIPU`), sirviendo como identificador simple para humanos complementario al UUID interno.
4. **Ventana de Gracia / Marcha Blanca de Comisionamiento (30 Días):** Durante los primeros 30 días posteriores al alta (`createdAt`), permitir al rol `ADMIN` corregir errores tipográficos en los códigos identificadores o eliminar físicamente (Hard Delete) entidades creadas por error, siempre y cuando no comprometan datos productivos dependientes (0 lecturas / 0 medidores).
5. **Cristalización Definitiva (> 30 Días):** Vencida la marcha blanca, el código identificador se sella como 100% inmutable, el borrado físico queda terminantemente bloqueado y el único mecanismo para dar de baja la entidad es el **Archivado (Soft Delete)**.

---

## 2. Límites y Archivos Editables Autorizados

- **Archivos editables autorizados:**
  - `specs/feat-022-archivar-editar-comisionamiento.md`
  - `prisma/schema.prisma`
  - `src/modules/instalaciones/instalaciones.schema.ts`
  - `src/modules/instalaciones/instalaciones.service.ts`
  - `src/modules/instalaciones/instalaciones.repository.ts`
  - `src/modules/instalaciones/instalaciones.controller.ts`
  - `src/modules/medidores/medidores.schema.ts`
  - `src/modules/medidores/medidores.service.ts`
  - `src/modules/medidores/medidores.repository.ts`
  - `src/modules/medidores/medidores.controller.ts`
  - `src/server.ts`
  - `public/index.html`
  - `public/app.js`
  - `public/js/components.js`
  - `public/js/api.js`
  - `tests/modules/instalaciones/instalaciones.service.test.ts`
  - `tests/modules/medidores/medidores.service.test.ts`
  - `tests/server.comisionamiento-lifecycle.test.ts`
  - `STATE.md`
- **Archivos protegidos:**
  - `src/core/config.ts`
  - `src/core/errors.ts`
  - `docs/adr/*`

---

## 3. Modelo de Datos y Esquemas Zod

### 3.1 Esquema Prisma
En `model Instalacion`:
- Añadir `codigo String? @unique` (identificador humano corto).

### 3.2 DTOs Zod

#### Instalaciones
- `CrearInstalacionInputSchema`:
  - `nombre`: string (3-100 chars)
  - `codigo`: string (2-50 chars, opcional; si no se provee se deriva o genera automáticamente)
  - `ubicacion` / `direccion`: string (3-200 chars)
- `EditarInstalacionInputSchema`:
  - `nombre`: string (3-100 chars, opcional)
  - `codigo`: string (2-50 chars, opcional; solo modificable en periodo de gracia)
  - `ubicacion` / `direccion`: string (3-200 chars, opcional)
  - `activa`: boolean (opcional)
- `InstalacionResponseSchema`:
  - Incluye `id`, `codigo` (string o null), `nombre`, `ubicacion`, `direccion`, `activa`, `createdAt`, `updatedAt`, `enPeriodoGracia`: boolean (calculado: `<= 30 días`).

#### Medidores
- `EditarMedidorInputSchema`:
  - `codigo`: string (3-50 chars, opcional; solo modificable en periodo de gracia)
  - `numeroSerie`: string (opcional)
  - `ubicacionInterna`: string (2-200 chars, opcional)
  - `tipoMedidorId`: string (uuid, opcional; solo en periodo de gracia si 0 lecturas)
  - `activo`: boolean (opcional)
- `MedidorResponseSchema`:
  - Incluye `enPeriodoGracia`: boolean (calculado: `<= 30 días`).

---

## 4. Invariantes de Dominio y Errores Tipados

### 4.1 Errores Tipados
- `PeriodoGraciaExpiradoError`: `code: "PERIODO_GRACIA_EXPIRADO"`, `statusCode: 422`
  - Emitido cuando se intenta modificar el `codigo` de una instalación o medidor con antigüedad > 30 días.
- `EliminacionFisicaProhibidaError`: `code: "ELIMINACION_FISICA_PROHIBIDA"`, `statusCode: 422`
  - Emitido cuando se intenta ejecutar `DELETE` sobre una entidad con antigüedad > 30 días.
- `MedidorConLecturasNoEliminableError`: `code: "MEDIDOR_CON_LECTURAS_NO_ELIMINABLE"`, `statusCode: 422`
  - Emitido cuando se intenta eliminar físicamente un medidor que ya tiene lecturas registradas (debe archivarse).
- `InstalacionConMedidoresNoEliminableError`: `code: "INSTALACION_CON_MEDIDORES_NO_ELIMINABLE"`, `statusCode: 422`
  - Emitido cuando se intenta eliminar físicamente una instalación que tiene medidores (debe archivarse).
- `InstalacionTieneMedidoresActivosError`: `code: "INSTALACION_TIENE_MEDIDORES_ACTIVOS"`, `statusCode: 422`
  - Emitido cuando se intenta archivar (`activa = false`) una instalación que aún cuenta con medidores activos.

### 4.2 Invariantes de Negocio
1. **Regla de 30 Días:** `enPeriodoGracia = (Date.now() - createdAt.getTime()) <= 30 * 24 * 60 * 60 * 1000`.
2. **Autorización:** Modificación de `codigo`, reactivación y eliminación física (`DELETE`) son exclusivas de `ADMIN`.
3. **Hard Delete Seguro:**
   - Medidor: Solo si `enPeriodoGracia` es true Y conteo de lecturas = 0.
   - Instalación: Solo si `enPeriodoGracia` es true Y conteo de medidores = 0.
   - En ambos casos, se debe persistir obligatoriamente un snapshot en `AuditoriaEvento` (`MEDIDOR_ELIMINADO_GRACIA` / `INSTALACION_ELIMINADA_GRACIA`).
4. **Soft Delete (Archivar/Restaurar):**
   - No destruye registros relacionales.
   - Medidor archivado (`activo = false`) rechaza nuevas lecturas (`MedidorInactivoError: 422`).
   - Registra evento en `AuditoriaEvento` (`MEDIDOR_ARCHIVADO`, `MEDIDOR_RESTAURADO`, `INSTALACION_ARCHIVADA`, `INSTALACION_RESTAURADA`).
5. **Filtrado:**
   - `GET /api/instalaciones?estado=activas|archivadas|todas` (por defecto `activas`).
   - `GET /api/medidores?estado=activos|archivados|todos` (por defecto `activos`).
   - Para roles `OPERADOR` y `SUPERVISOR`, siempre se restringe a activas y sedes asignadas.

---

## 5. Criterios de Aceptación (Agentic TDD)

### Suite 1: Ciclo de Vida de Instalaciones
1. `InstalacionesService.editarInstalacion`:
   - Permite actualizar `nombre` y `ubicacion` libremente en cualquier momento.
   - Permite actualizar `codigo` si la instalación tiene ≤ 30 días.
   - Rechaza con `PeriodoGraciaExpiradoError` si tiene > 30 días y se intenta cambiar `codigo`.
2. `InstalacionesService.archivarInstalacion`:
   - Falla con `InstalacionTieneMedidoresActivosError` si la instalación posee medidores con `activo: true`.
   - Marca `activa: false` si no tiene medidores activos y registra auditoría.
3. `InstalacionesService.restaurarInstalacion`:
   - Marca `activa: true` y registra auditoría.
4. `InstalacionesService.eliminarInstalacionFisica`:
   - Falla con `EliminacionFisicaProhibidaError` si tiene > 30 días.
   - Falla con `InstalacionConMedidoresNoEliminableError` si tiene medidores asociados.
   - Elimina físicamente si tiene ≤ 30 días y 0 medidores, registrando snapshot en auditoría.

### Suite 2: Ciclo de Vida de Medidores
1. `MedidoresService.editarMedidor`:
   - Permite actualizar `ubicacionInterna` y `numeroSerie` libremente.
   - Permite actualizar `codigo` si tiene ≤ 30 días.
   - Rechaza con `PeriodoGraciaExpiradoError` si tiene > 30 días y se intenta cambiar `codigo`.
2. `MedidoresService.archivarMedidor`:
   - Marca `activo: false` y registra auditoría.
   - Verifica que un medidor archivado rechaza nuevas lecturas.
3. `MedidoresService.restaurarMedidor`:
   - Marca `activo: true` y registra auditoría.
4. `MedidoresService.eliminarMedidorFisico`:
   - Falla con `EliminacionFisicaProhibidaError` si tiene > 30 días.
   - Falla con `MedidorConLecturasNoEliminableError` si tiene lecturas registradas.
   - Elimina físicamente si tiene ≤ 30 días y 0 lecturas, registrando snapshot en auditoría.

### Suite 3: Endpoints HTTP y Permisos
1. `PATCH /api/instalaciones/:id`: Rol `ADMIN` edita campos autorizados.
2. `DELETE /api/instalaciones/:id`: Aplica reglas de periodo de gracia y conteo de dependencias.
3. `PATCH /api/medidores/:id`: Rol `ADMIN` edita campos autorizados.
4. `DELETE /api/medidores/:id`: Aplica reglas de periodo de gracia y conteo de lecturas.
5. `GET /api/instalaciones` y `GET /api/medidores`: Soportan parámetro `estado=activas|archivadas|todas` para `ADMIN`.
