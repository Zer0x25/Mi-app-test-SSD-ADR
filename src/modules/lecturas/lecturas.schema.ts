import { z } from "zod";
import { DomainError } from "../../core/errors.js";
export { MedidorNotFoundError } from "../medidores/medidores.schema.js";

// ==============================================================================
// DTOs para Lecturas
// ==============================================================================

export const RegistrarLecturaInputSchema = z.object({
  medidorId: z.string().uuid("Identificador de medidor inválido"),
  operadorId: z.string().uuid("Identificador de operador inválido"),
  valor: z.number().nonnegative("El valor de la medición no puede ser negativo"),
  fechaLectura: z.coerce.date().optional(),
  notas: z
    .string()
    .trim()
    .max(255, "Las notas no pueden exceder 255 caracteres")
    .optional(),
});

export type RegistrarLecturaInput = z.infer<typeof RegistrarLecturaInputSchema>;

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

// ==============================================================================
// Errores de Dominio Tipados
// ==============================================================================

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
    super(`El medidor '${medidorId}' se encuentra inactivo y no admite nuevas lecturas.`, {
      medidorId,
    });
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
    super(
      `La fecha de lectura (${fechaLectura.toISOString()}) no puede ser posterior al momento actual.`,
      { fechaLectura }
    );
  }
}

export class LecturaDuplicadaError extends DomainError {
  readonly code = "LECTURA_DUPLICADA_EN_PERIODO";
  readonly statusCode = 409;
  constructor(medidorId: string, fechaLectura: Date) {
    super(
      `Ya existe una lectura registrada para el medidor '${medidorId}' en la fecha y hora '${fechaLectura.toISOString()}'.`,
      { medidorId, fechaLectura }
    );
  }
}

export class LecturaNotFoundError extends DomainError {
  readonly code = "LECTURA_NOT_FOUND";
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Lectura con ID '${id}' no encontrada.`, { id });
  }
}
