# Spec: feat-002-catalogo-medidores

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Implementar el catálogo de tipos de medidor configurables (recurso, unidad, modo de medición) y la creación/gestión de medidores físicos asociados a instalaciones.
- **Archivos editables autorizados:**
  - `prisma/schema.prisma`
  - `src/modules/medidores/medidores.schema.ts`
  - `src/modules/medidores/medidores.service.ts`
  - `src/modules/medidores/medidores.repository.ts`
  - `src/modules/medidores/medidores.controller.ts`
  - `tests/modules/medidores/medidores.service.test.ts`
  - `tests/modules/medidores/medidores.controller.test.ts`
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/core/*`
  - `docs/adr/*`
  - Todo archivo fuera de `src/modules/medidores/` y `tests/modules/medidores/`

---

## 2. Contrato Funcional de Datos (Zod Schemas)

### A. Tipos de Medidor

```typescript
export const RecursoMedidorEnum = z.enum(["AGUA", "LUZ", "GAS", "PETROLEO", "OTRO"]);
export const UnidadMedidaEnum = z.enum(["LITROS", "M3", "KWH", "PORCENTAJE", "OTRO"]);
export const TipoMedicionEnum = z.enum(["ACUMULATIVO", "INSTANTANEO", "NIVEL"]);

export const CrearTipoMedidorInputSchema = z.object({
  nombre: z.string().trim().min(3).max(100),
  recurso: RecursoMedidorEnum,
  unidad: UnidadMedidaEnum,
  tipoMedicion: TipoMedicionEnum,
});

export type CrearTipoMedidorInput = z.infer<typeof CrearTipoMedidorInputSchema>;

export const TipoMedidorResponseSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  recurso: RecursoMedidorEnum,
  unidad: UnidadMedidaEnum,
  tipoMedicion: TipoMedicionEnum,
  activo: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TipoMedidorResponse = z.infer<typeof TipoMedidorResponseSchema>;
```

### B. Medidores Físicos

```typescript
export const CrearMedidorInputSchema = z.object({
  instalacionId: z.string().uuid("Identificador de instalación inválido"),
  tipoMedidorId: z.string().uuid("Identificador de tipo de medidor inválido"),
  codigo: z.string().trim().min(3, "El código debe tener al menos 3 caracteres").max(50),
  numeroSerie: z.string().trim().max(100).optional(),
  ubicacionInterna: z.string().trim().min(2).max(200),
});

export type CrearMedidorInput = z.infer<typeof CrearMedidorInputSchema>;

export const MedidorResponseSchema = z.object({
  id: z.string().uuid(),
  instalacionId: z.string().uuid(),
  tipoMedidorId: z.string().uuid(),
  codigo: z.string(),
  numeroSerie: z.string().nullable().optional(),
  ubicacionInterna: z.string(),
  activo: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  tipoMedidor: TipoMedidorResponseSchema.optional(),
});

export type MedidorResponse = z.infer<typeof MedidorResponseSchema>;
```

---

## 3. Catálogo de Errores de Dominio Tipados

```typescript
import { DomainError } from "../../core/errors.js";

export type MedidoresErrorCode =
  | "TIPO_MEDIDOR_NOT_FOUND"
  | "TIPO_MEDIDOR_NOMBRE_DUPLICADO"
  | "TIPO_MEDIDOR_INACTIVO"
  | "MEDIDOR_NOT_FOUND"
  | "MEDIDOR_CODIGO_DUPLICADO"
  | "INSTALACION_NOT_FOUND"
  | "INSTALACION_INACTIVA";

export class TipoMedidorNotFoundError extends DomainError {
  readonly code = "TIPO_MEDIDOR_NOT_FOUND";
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Tipo de medidor con ID '${id}' no encontrado.`, { id });
  }
}

export class TipoMedidorNombreDuplicadoError extends DomainError {
  readonly code = "TIPO_MEDIDOR_NOMBRE_DUPLICADO";
  readonly statusCode = 409;
  constructor(nombre: string) {
    super(`Ya existe un tipo de medidor con el nombre '${nombre}'.`, { nombre });
  }
}

export class TipoMedidorInactivoError extends DomainError {
  readonly code = "TIPO_MEDIDOR_INACTIVO";
  readonly statusCode = 422;
  constructor(id: string) {
    super(`El tipo de medidor '${id}' se encuentra inactivo.`, { id });
  }
}

export class MedidorNotFoundError extends DomainError {
  readonly code = "MEDIDOR_NOT_FOUND";
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Medidor con ID '${id}' no encontrado.`, { id });
  }
}

export class MedidorCodigoDuplicadoError extends DomainError {
  readonly code = "MEDIDOR_CODIGO_DUPLICADO";
  readonly statusCode = 409;
  constructor(codigo: string) {
    super(`Ya existe un medidor con el código '${codigo}'.`, { codigo });
  }
}
```

---

## 4. Invariantes del Negocio

### A. Invariantes Positivas (Garantías de Comportamiento)
1. **Identidad UUID v4:** Todo tipo de medidor y medidor físico se crea con UUID v4 único y timestamps UTC.
2. **Estado Activo Inicial:** Se crean con `activo: true` por defecto.
3. **Asociación Íntegra:** Todo medidor físico debe estar vinculado a una instalación válida y a un tipo de medidor válido.

### B. Invariantes Negativas (Prohibiciones Duras: Lo que NUNCA debe ocurrir)
1. **Unicidad:** Prohibido crear tipos de medidor con nombre duplicado (case-insensitive). Prohibido crear medidores con código identificador duplicado.
2. **Asociación a Entidades Inactivas:** Prohibido crear un medidor en una instalación inactiva o con un tipo de medidor inactivo.
3. **Borrado Físico Prohibido:** Medidores y tipos de medidores jamás se borran físicamente; solo se permite baja lógica (`activo: false`).
4. **Pureza de Capas:**
   - El controlador solo traduce HTTP y mapea DomainError.
   - El servicio contiene todas las validaciones e invariantes.
   - El repositorio solo persiste y consulta.

---

## 5. Criterios de Aceptación (Definition of Done)

- [x] **Tests de Esquemas de Validación (Zod):**
  - [x] Validación de enums permitidos (`recurso`, `unidad`, `tipoMedicion`).
  - [x] Validación de formato UUID y límites de longitud en códigos y ubicaciones.
- [x] **Tests de Servicio (Vitest / Agentic TDD):**
  - [x] `crearTipoMedidor`: crea exitosamente y rechaza nombres duplicados arrojando `TipoMedidorNombreDuplicadoError`.
  - [x] `listarTiposMedidor`: retorna todos los tipos de medidores activos.
  - [x] `crearMedidor`: crea medidor si instalación y tipo de medidor existen y están activos.
  - [x] `crearMedidor`: lanza `MedidorCodigoDuplicadoError` si el código ya existe.
  - [x] `crearMedidor`: lanza error si la instalación o el tipo de medidor están inactivos o no existen.
  - [x] `obtenerMedidorPorId`: retorna el medidor o lanza `MedidorNotFoundError`.
  - [x] `listarMedidoresPorInstalacion`: retorna los medidores activos de la instalación especificada con sus tipos asociados.
  - [x] `desactivarMedidor`: cambia `activo: false` sin borrado físico.
- [x] **Tests de Controlador HTTP (Fastify):**
  - [x] `POST /api/tipos-medidor` -> 201 Created / 409 Conflict.
  - [x] `GET /api/tipos-medidor` -> 200 OK.
  - [x] `POST /api/medidores` -> 201 Created / 404 / 409 / 422.
  - [x] `GET /api/medidores/:id` -> 200 OK / 404 Not Found.
  - [x] `GET /api/instalaciones/:instalacionId/medidores` -> 200 OK.
- [x] **Quality Gate Determinista (Salida obligatoria: Código 0):**
  - [x] `./scripts/verify.sh` superado al 100%.
