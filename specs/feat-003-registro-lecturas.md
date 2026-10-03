# Spec: feat-003-registro-lecturas

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Implementar la ingesta y auditoría de lecturas de medidores con validación estricta de invariantes de negocio (no decrecientes en acumulativos, no fechas futuras, no duplicados en el mismo timestamp, y verificación de asignación del operador a la instalación correspondiente).
- **Archivos editables autorizados:**
  - `prisma/schema.prisma`
  - `src/modules/lecturas/lecturas.schema.ts`
  - `src/modules/lecturas/lecturas.service.ts`
  - `src/modules/lecturas/lecturas.repository.ts`
  - `src/modules/lecturas/lecturas.controller.ts`
  - `tests/modules/lecturas/lecturas.service.test.ts`
  - `tests/modules/lecturas/lecturas.controller.test.ts`
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/core/*`
  - `docs/adr/*`
  - Todo archivo fuera de `src/modules/lecturas/` y `tests/modules/lecturas/`

---

## 2. Contrato Funcional de Datos (Zod Schemas)

### A. Registro de Lectura (Input DTO)
```typescript
export const RegistrarLecturaInputSchema = z.object({
  medidorId: z.string().uuid("Identificador de medidor inválido"),
  operadorId: z.string().uuid("Identificador de operador inválido"),
  valor: z.number().nonnegative("El valor de la medición no puede ser negativo"),
  fechaLectura: z.coerce.date().optional(),
  notas: z.string().trim().max(255, "Las notas no pueden exceder 255 caracteres").optional(),
});

export type RegistrarLecturaInput = z.infer<typeof RegistrarLecturaInputSchema>;
```

### B. Respuesta Lectura (Output DTO)
```typescript
export const LecturaResponseSchema = z.object({
  id: z.string().uuid(),
  medidorId: z.string().uuid(),
  operadorId: z.string().uuid(),
  valor: z.number(),
  fechaLectura: z.date(),
  notas: z.string().nullable().optional(),
  createdAt: z.date(),
});

export type LecturaResponse = z.infer<typeof LecturaResponseSchema>;
```

---

## 3. Catálogo de Errores de Dominio Tipados

```typescript
import { DomainError } from "../../core/errors.js";

export type LecturasErrorCode =
  | "MEDIDOR_NOT_FOUND"
  | "MEDIDOR_INACTIVO"
  | "OPERADOR_NO_AUTORIZADO"
  | "LECTURA_DECRECIENTE_PROHIBIDA"
  | "LECTURA_FECHA_FUTURA"
  | "LECTURA_DUPLICADA_EN_PERIODO"
  | "LECTURA_NOT_FOUND";

export class MedidorInactivoError extends DomainError {
  readonly code = "MEDIDOR_INACTIVO";
  readonly statusCode = 422;
  constructor(medidorId: string) {
    super(`El medidor '${medidorId}' se encuentra inactivo y no admite nuevas lecturas.`, { medidorId });
  }
}

export class OperadorNoAutorizadoError extends DomainError {
  readonly code = "OPERADOR_NO_AUTORIZADO";
  readonly statusCode = 403;
  constructor(operadorId: string, instalacionId: string) {
    super(
      `El operador '${operadorId}' no tiene acceso asignado a la instalación '${instalacionId}' de este medidor.`,
      { operadorId, instalacionId }
    );
  }
}

export class LecturaDecrecienteError extends DomainError {
  readonly code = "LECTURA_DECRECIENTE_PROHIBIDA";
  readonly statusCode = 422;
  constructor(medidorId: string, valorAnterior: number, valorNuevo: number) {
    super(
      `La nueva lectura (${valorNuevo}) no puede ser menor a la lectura anterior (${valorAnterior}) en medidores acumulativos.`,
      { medidorId, valorAnterior, valorNuevo }
    );
  }
}

export class LecturaFechaFuturaError extends DomainError {
  readonly code = "LECTURA_FECHA_FUTURA";
  readonly statusCode = 422;
  constructor(fechaLectura: Date) {
    super(`La fecha de lectura (${fechaLectura.toISOString()}) no puede ser posterior al momento actual.`, {
      fechaLectura,
    });
  }
}

export class LecturaDuplicadaError extends DomainError {
  readonly code = "LECTURA_DUPLICADA_EN_PERIODO";
  readonly statusCode = 409;
  constructor(medidorId: string, fechaLectura: Date) {
    super(`Ya existe una lectura registrada para el medidor '${medidorId}' en la fecha y hora '${fechaLectura.toISOString()}'.`, {
      medidorId,
      fechaLectura,
    });
  }
}
```

---

## 4. Invariantes del Negocio

### A. Invariantes Positivas (Garantías de Comportamiento)
1. **Timestamp por Defecto:** Si no se especifica `fechaLectura`, se asigna el timestamp UTC actual (`now()`).
2. **Trazabilidad Inmutable:** Cada lectura guarda el identificador del operador que la ingresó y su momento exacto de inserción.
3. **Orden Cronológico:** Las consultas de historial retornan las lecturas ordenadas cronológicamente descendente (más reciente primero).

### B. Invariantes Negativas (Prohibiciones Duras: Lo que NUNCA debe ocurrir)
1. **Lectura Decreciente Prohibida:** En medidores con `tipoMedicion === "ACUMULATIVO"`, si existe una lectura previa, el nuevo valor debe ser mayor o igual (`>=`) al último valor registrado.
2. **Fechas Futuras Prohibidas:** Prohibido registrar lecturas con fecha y hora posterior a la hora del servidor (tolerancia máxima: 5 segundos).
3. **No Duplicados Temporales:** Prohibido registrar dos lecturas para el mismo medidor con la misma fecha/hora exacta.
4. **Scoping de Operador Obligatorio:** Prohibido registrar lecturas si el operador no posee asignación activa en la instalación donde reside el medidor.
5. **Borrado Físico Prohibido:** Las lecturas jamás se eliminan físicamente (auditoría inmutable de mediciones).

---

## 5. Criterios de Aceptación (Definition of Done)

- [x] **Tests de Esquemas de Validación (Zod):**
  - [x] Rechazo de valores negativos.
  - [x] Rechazo de notas de más de 255 caracteres.
- [x] **Tests de Servicio (Vitest / Agentic TDD):**
  - [x] Registro exitoso de lectura en medidor acumulativo con valor creciente.
  - [x] Rechazo de lectura decreciente en medidor acumulativo arrojando `LecturaDecrecienteError` (422).
  - [x] Aceptación de lectura fluctuante/menor en medidores de tipo `INSTANTANEO` o `NIVEL`.
  - [x] Rechazo de lectura con fecha futura arrojando `LecturaFechaFuturaError` (422).
  - [x] Rechazo de lectura duplicada en el mismo período arrojando `LecturaDuplicadaError` (409).
  - [x] Rechazo de registro si el operador no está asignado a la instalación del medidor arrojando `OperadorNoAutorizadoError` (403).
  - [x] Rechazo si el medidor está inactivo o no existe.
  - [x] Consulta de historial por medidor ordenado descendente.
- [x] **Tests de Controlador HTTP (Fastify):**
  - [x] `POST /api/lecturas` -> 201 Created / 403 / 404 / 409 / 422.
  - [x] `GET /api/medidores/:medidorId/lecturas` -> 200 OK.
  - [x] `GET /api/medidores/:medidorId/lecturas/ultima` -> 200 OK o null.
- [x] **Quality Gate Determinista (Salida obligatoria: Código 0):**
  - [x] `./scripts/verify.sh` superado al 100%.
