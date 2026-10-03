# Spec: feat-009 - Bitácora de Mantenimiento Físico, Calibración y Precintos de Medidores

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Propósito y Alcance de Negocio

El sistema Medidores requiere un módulo formal de control metrológico y bitácora técnica:
1. **Registro de Calibración:**
   - Registro de calibraciones periódicas con laboratorio/certificado, fecha de calibración y fecha de vencimiento/próxima calibración.
   - Actualización automática de `fechaUltimaCalibracion` y `fechaProximaCalibracion` en la ficha del medidor.
2. **Control de Precintos de Seguridad:**
   - Registro y trazabilidad de sustitución de precintos numerados anti-manipulación (`numeroPrecintoAnterior`, `numeroPrecintoNuevo`).
   - Actualización atómica de `precintoActual` en el medidor.
3. **Bajas Técnicas y Reemplazos de Equipos:**
   - Registro de lectura final de retiro del equipo (invariante dura: debe ser >= última lectura registrada en caso de medidores acumulativos).
   - En caso de baja o reemplazo, el medidor retirado pasa automáticamente a `activo = false` para impedir que se le sigan imputando lecturas rutinarias.
   - En reemplazos, vinculación y referencia al código del nuevo medidor instalado.
4. **Consulta de Historial y Bitácora:**
   - Consulta cronológica de intervenciones por medidor o por sede.

---

## 2. Archivos Editables Autorizados

- `specs/feat-009-mantenimiento-y-calibracion.md`
- `src/modules/mantenimiento/mantenimiento.schema.ts`
- `src/modules/mantenimiento/mantenimiento.service.ts`
- `src/modules/mantenimiento/mantenimiento.repository.ts`
- `src/modules/mantenimiento/mantenimiento.controller.ts`
- `src/server.ts`
- `tests/modules/mantenimiento/mantenimiento.service.test.ts`
- `tests/modules/mantenimiento/mantenimiento.controller.test.ts`
- `STATE.md`

---

## 3. Contratos de Datos y Esquemas Zod

```typescript
export const TipoMantenimientoEnum = z.enum([
  "CALIBRACION",
  "CAMBIO_PRECINTO",
  "REEMPLAZO_EQUIPO",
  "INSPECCION",
  "BAJA_TECNICA",
]);
export type TipoMantenimiento = z.infer<typeof TipoMantenimientoEnum>;

export const RegistrarMantenimientoInputSchema = z.object({
  medidorId: z.string().uuid(),
  tipo: TipoMantenimientoEnum,
  fechaMantenimiento: z.coerce.date().default(() => new Date()),
  tecnicoResponsable: z.string().trim().min(3, "El nombre del técnico debe tener al menos 3 caracteres"),
  numeroPrecintoAnterior: z.string().trim().optional().nullable(),
  numeroPrecintoNuevo: z.string().trim().optional().nullable(),
  proximaCalibracion: z.coerce.date().optional().nullable(),
  certificadoCalibracion: z.string().trim().optional().nullable(),
  lecturaRetiro: z.number().nonnegative().optional().nullable(),
  motivoBaja: z.string().trim().optional().nullable(),
  nuevoMedidorCodigo: z.string().trim().optional().nullable(),
  observaciones: z.string().trim().max(1000).optional().nullable(),
});
export type RegistrarMantenimientoInput = z.infer<typeof RegistrarMantenimientoInputSchema>;

export const FiltroMantenimientosSchema = z.object({
  medidorId: z.string().uuid().optional(),
  instalacionId: z.string().uuid().optional(),
  tipo: TipoMantenimientoEnum.optional(),
});
export type FiltroMantenimientos = z.infer<typeof FiltroMantenimientosSchema>;
```

---

## 4. Errores de Dominio Tipados

- `MedidorMantenimientoNotFoundError` (HTTP 404): Al intentar registrar mantenimiento sobre un medidor inexistente.
- `LecturaRetiroInvalidaError` (HTTP 422): Si la lectura de retiro es inferior a la última lectura registrada del medidor acumulativo.
- `PrecintoNuevoRequeridoError` (HTTP 400): Si en un evento `CAMBIO_PRECINTO` no se indica el nuevo precinto.

---

## 5. Criterios de Aceptación y Pruebas Unitarias (Agentic TDD)

### Suite de Servicio (`mantenimiento.service.test.ts`):
1. **Calibración Exitosa:** Registra evento y actualiza `fechaUltimaCalibracion` y `fechaProximaCalibracion` en el medidor.
2. **Cambio de Precinto:** Exige `numeroPrecintoNuevo`, registra la bitácora y actualiza `precintoActual` en el medidor.
3. **Baja y Reemplazo de Equipo:** Desactiva el medidor (`activo: false`), valida lectura de retiro consistente con el historial y registra el evento con el código del medidor sustituto.
4. **Rechazo de Lectura de Retiro Inválida:** Si la lectura de retiro es menor a la última lectura del medidor acumulativo, lanza `LecturaRetiroInvalidaError`.
5. **Historial de Bitácora:** Retorna los mantenimientos ordenados cronológicamente descendente.

### Suite de Controlador (`mantenimiento.controller.test.ts`):
1. `POST /api/mantenimiento`: Registra evento y retorna 201 Created.
2. `GET /api/mantenimiento`: Retorna 200 con la bitácora filtrada por medidor o sede.
3. `GET /api/mantenimiento/medidor/:id`: Retorna 200 con la ficha técnica y bitácora del medidor.
