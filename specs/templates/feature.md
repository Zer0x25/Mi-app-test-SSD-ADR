# Spec: [Nombre de la Funcionalidad o Caso de Uso - Dominio Medidores]

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** [Descripción precisa y concisa de lo que se va a implementar para el sistema Medidores]
- **Archivos editables autorizados:**
  - `src/modules/[modulo]/[modulo].schema.ts`
  - `src/modules/[modulo]/[modulo].service.ts`
  - `src/modules/[modulo]/[modulo].controller.ts`
  - `src/modules/[modulo]/[modulo].repository.ts`
  - `tests/modules/[modulo]/[modulo].service.test.ts`
  - `tests/modules/[modulo]/[modulo].controller.test.ts`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/core/*`
  - `docs/adr/*`
  - Todo archivo fuera de `src/modules/[modulo]/` y `tests/modules/[modulo]/`

---

## 2. Contrato Funcional de Datos (Zod Schemas)

### A. Contrato de Entrada (Input DTO)
```typescript
import { z } from "zod";

// Ejemplo para módulo de lecturas o medidores
export const CrearLecturaInputSchema = z.object({
  medidorId: z.string().uuid("Identificador de medidor inválido"),
  valor: z.number().nonnegative("El valor no puede ser negativo"),
  fechaLectura: z.coerce.date().refine(
    (fecha) => fecha <= new Date(),
    { message: "La fecha de lectura no puede ser futura" }
  ),
  notas: z.string().trim().max(255).optional(),
});

export type CrearLecturaInput = z.infer<typeof CrearLecturaInputSchema>;
```

### B. Contrato de Salida (Output DTO / Respuestas HTTP)
```typescript
import { z } from "zod";

export const LecturaResponseSchema = z.object({
  id: z.string().uuid(),
  medidorId: z.string().uuid(),
  valor: z.number(),
  fechaLectura: z.date(),
  operadorId: z.string().uuid(),
  createdAt: z.date(),
});

export type LecturaResponse = z.infer<typeof LecturaResponseSchema>;
```

---

## 3. Catálogo de Errores de Dominio Tipados
```typescript
import { DomainError } from "../../core/errors";

export type LecturaErrorCode =
  | "MEDIDOR_NOT_FOUND"
  | "LECTURA_DECRECIENTE_PROHIBIDA"
  | "LECTURA_FECHA_FUTURA"
  | "LECTURA_DUPLICADA_EN_PERIODO"
  | "UNAUTHORIZED_OPERATOR";

export class LecturaDecrecienteError extends DomainError {
  readonly code = "LECTURA_DECRECIENTE_PROHIBIDA";
  readonly statusCode = 422;

  constructor(medidorId: string, valorAnterior: number, valorNuevo: number) {
    super(
      `La lectura (${valorNuevo}) no puede ser menor a la lectura anterior (${valorAnterior}) en medidores acumulativos.`,
      { medidorId, valorAnterior, valorNuevo }
    );
  }
}
```
- Cada error de dominio debe heredar de `DomainError` y mapearse a un código HTTP semántico (400, 401, 403, 404, 409, 422).
- Prohibido lanzar `throw new Error("mensaje")` genéricos sin código de dominio tipado.

---

## 4. Invariantes del Negocio (Medidores)

### A. Invariantes Positivas (Garantías de Comportamiento)
1. **Consistencia de Unidades:** El valor de la lectura debe coincidir con la unidad configurada en el medidor (Litros, m³, kWh, porcentaje).
2. **Trazabilidad de Auditoría:** Toda lectura debe registrar id del operador y timestamp UTC exacto.

### B. Invariantes Negativas (Prohibiciones Duras: Lo que NUNCA debe ocurrir)
1. **Lectura Decreciente:** En medidores secuenciales/acumulativos, jamás se permite un valor inferior al último registrado.
2. **Fechas Futuras:** Prohibido registrar lecturas con fecha y hora posterior a la actual.
3. **Duplicados:** Prohibido registrar dos lecturas para el mismo medidor en el mismo período/timestamp.
4. **Borrado Físico Prohibido:** Las lecturas y medidores nunca se eliminan físicamente de la base de datos (solo bajas lógicas con auditoría).
5. **Pureza de Capas:**
   - El controlador jamás debe interactuar con la base de datos directamente ni contener lógica de validación de negocio.
   - El servicio jamás debe recibir ni manipular objetos de transporte HTTP (`FastifyRequest`, `FastifyReply`).
   - El repositorio jamás debe alterar lógica de invariantes; su única función es persistir y consultar.

---

## 5. Criterios de Aceptación (Definition of Done)

- [ ] **Tests de Esquemas de Validación (Zod):**
  - [ ] Rechazo de entradas incompletas o tipos erróneos con mensajes claros.
  - [ ] Validación de límites numéricos y formatos de fecha.
- [ ] **Tests de Servicio (Vitest / Agentic TDD):**
  - [ ] Ejecución exitosa de flujo principal con persistencia simulada por mocks.
  - [ ] Rechazo de lecturas decrecientes arrojando `LecturaDecrecienteError` (código 422).
  - [ ] Rechazo de lecturas futuras o duplicadas arrojando el error de dominio correspondiente.
  - [ ] Confirmación de que las **Invariantes Negativas** son validadas y rechazan estados inválidos.
- [ ] **Higiene de Commits:**
  - [ ] Todo commit sigue el formato Conventional Commits (`feat([modulo]): ...`, `test([modulo]): ...`).
- [ ] **Quality Gate Determinista (Salida obligatoria: Código 0):**
  - [ ] `./scripts/verify.sh` ejecutado con éxito total.
