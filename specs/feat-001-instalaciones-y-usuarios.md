# Spec: feat-001-instalaciones-y-usuarios

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Implementar la gestión de Instalaciones/Dependencias (creación, consulta, desactivación lógica) y la asignación de Operadores a instalaciones para delimitar el acceso a los medidores.
- **Archivos editables autorizados:**
  - `prisma/schema.prisma`
  - `src/modules/instalaciones/instalaciones.schema.ts`
  - `src/modules/instalaciones/instalaciones.service.ts`
  - `src/modules/instalaciones/instalaciones.repository.ts`
  - `src/modules/instalaciones/instalaciones.controller.ts`
  - `tests/modules/instalaciones/instalaciones.service.test.ts`
  - `tests/modules/instalaciones/instalaciones.controller.test.ts`
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/core/*`
  - `docs/adr/*`
  - Cualquier archivo fuera de `src/modules/instalaciones/` y `tests/modules/instalaciones/`

---

## 2. Contrato Funcional de Datos (Zod Schemas)

### A. Crear Instalación (Input DTO)
```typescript
export const CrearInstalacionInputSchema = z.object({
  nombre: z.string().trim().min(3, "El nombre debe tener al menos 3 caracteres").max(100),
  ubicacion: z.string().trim().min(3, "La ubicación debe tener al menos 3 caracteres").max(200),
});

export type CrearInstalacionInput = z.infer<typeof CrearInstalacionInputSchema>;
```

### B. Respuesta Instalación (Output DTO)
```typescript
export const InstalacionResponseSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  ubicacion: z.string(),
  activa: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type InstalacionResponse = z.infer<typeof InstalacionResponseSchema>;
```

### C. Asignar Operador a Instalación (Input DTO)
```typescript
export const AsignarOperadorInputSchema = z.object({
  instalacionId: z.string().uuid("Identificador de instalación inválido"),
  usuarioId: z.string().uuid("Identificador de usuario inválido"),
});

export type AsignarOperadorInput = z.infer<typeof AsignarOperadorInputSchema>;
```

### D. Respuesta Asignación (Output DTO)
```typescript
export const AsignacionResponseSchema = z.object({
  id: z.string().uuid(),
  instalacionId: z.string().uuid(),
  usuarioId: z.string().uuid(),
  createdAt: z.date(),
});

export type AsignacionResponse = z.infer<typeof AsignacionResponseSchema>;
```

---

## 3. Catálogo de Errores de Dominio Tipados

```typescript
import { DomainError } from "../../core/errors.js";

export type InstalacionErrorCode =
  | "INSTALACION_NOT_FOUND"
  | "INSTALACION_NOMBRE_DUPLICADO"
  | "INSTALACION_INACTIVA"
  | "ASIGNACION_DUPLICADA";

export class InstalacionNotFoundError extends DomainError {
  readonly code = "INSTALACION_NOT_FOUND";
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Instalación con ID '${id}' no encontrada.`, { id });
  }
}

export class InstalacionNombreDuplicadoError extends DomainError {
  readonly code = "INSTALACION_NOMBRE_DUPLICADO";
  readonly statusCode = 409;
  constructor(nombre: string) {
    super(`Ya existe una instalación con el nombre '${nombre}'.`, { nombre });
  }
}

export class InstalacionInactivaError extends DomainError {
  readonly code = "INSTALACION_INACTIVA";
  readonly statusCode = 422;
  constructor(id: string) {
    super(`La instalación '${id}' está inactiva y no permite nuevas asignaciones u operaciones.`, { id });
  }
}

export class AsignacionDuplicadaError extends DomainError {
  readonly code = "ASIGNACION_DUPLICADA";
  readonly statusCode = 409;
  constructor(instalacionId: string, usuarioId: string) {
    super(`El usuario '${usuarioId}' ya se encuentra asignado a la instalación '${instalacionId}'.`, { instalacionId, usuarioId });
  }
}
```

---

## 4. Invariantes del Negocio

### A. Invariantes Positivas (Garantías de Comportamiento)
1. **Identidad UUID v4:** Toda nueva instalación o asignación debe crearse con un UUID único y fecha UTC.
2. **Estado Activo Inicial:** Las instalaciones se crean con `activa: true` por defecto.
3. **Múltiple Asignación:** Un operador puede pertenecer a 1 o muchas instalaciones; una instalación puede tener 1 o muchos operadores asignados.

### B. Invariantes Negativas (Prohibiciones Duras: Lo que NUNCA debe ocurrir)
1. **Unicidad de Nombre:** Prohibido crear dos instalaciones con el mismo nombre normalizado (ignora mayúsculas y espacios periféricos).
2. **Borrado Físico Prohibido:** Prohibido eliminar físicamente registros de instalaciones (solo se permite desactivación `activa: false`).
3. **No Asignar a Inactivas:** Prohibido asignar operadores a una instalación con `activa: false`.
4. **No Asignaciones Duplicadas:** Prohibido registrar la misma combinación `(instalacionId, usuarioId)` más de una vez.
5. **Pureza de Capas:**
   - El controlador no ejecuta lógica de validación de negocio ni accede a base de datos.
   - El servicio no maneja objetos de transporte HTTP (`Request`, `Reply`).
   - El repositorio no implementa reglas de dominio; solo interactúa con el almacén de datos.

---

## 5. Criterios de Aceptación (Definition of Done)

- [x] **Tests de Esquemas de Validación (Zod):**
  - [x] Rechazo de nombres vacíos o menores a 3 caracteres.
  - [x] Validación estricta de UUID en asignaciones.
- [x] **Tests de Servicio (Vitest / Agentic TDD):**
  - [x] `crearInstalacion`: crea y persiste la instalación con `activa: true`.
  - [x] `crearInstalacion`: lanza `InstalacionNombreDuplicadoError` si el nombre ya existe.
  - [x] `obtenerPorId`: retorna la instalación o lanza `InstalacionNotFoundError`.
  - [x] `desactivarInstalacion`: cambia el estado a `activa: false` sin borrado físico.
  - [x] `asignarOperador`: asigna con éxito si la instalación existe y está activa.
  - [x] `asignarOperador`: lanza `InstalacionInactivaError` si la instalación está inactiva.
  - [x] `asignarOperador`: lanza `AsignacionDuplicadaError` si ya fue asignado previamente.
  - [x] `listarInstalacionesDeOperador`: retorna únicamente las instalaciones activas asignadas a dicho usuario.
- [x] **Tests de Controlador HTTP (Fastify):**
  - [x] Mapeo correcto de 201 Created para creaciones exitosas.
  - [x] Mapeo de `DomainError` a códigos de estado HTTP (404, 409, 422).
- [x] **Quality Gate Determinista (Salida obligatoria: Código 0):**
  - [x] `./scripts/verify.sh` superado al 100%.
