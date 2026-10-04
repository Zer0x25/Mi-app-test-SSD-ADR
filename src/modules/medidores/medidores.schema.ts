import { z } from "zod";
import { DomainError } from "../../core/errors.js";
export {
  InstalacionNotFoundError,
  InstalacionInactivaError,
} from "../instalaciones/instalaciones.schema.js";

// ==============================================================================
// Enums para Tipos de Medidor
// ==============================================================================

export const RecursoMedidorEnum = z.enum(["AGUA", "LUZ", "GAS", "PETROLEO", "OTRO"]);
export type RecursoMedidor = z.infer<typeof RecursoMedidorEnum>;

export const UnidadMedidaEnum = z.enum(["LITROS", "M3", "KWH", "PORCENTAJE", "OTRO"]);
export type UnidadMedida = z.infer<typeof UnidadMedidaEnum>;

export const TipoMedicionEnum = z.enum(["ACUMULATIVO", "INSTANTANEO", "NIVEL"]);
export type TipoMedicion = z.infer<typeof TipoMedicionEnum>;

// ==============================================================================
// DTOs para Tipos de Medidor
// ==============================================================================

export const CrearTipoMedidorInputSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(100, "El nombre no puede exceder 100 caracteres"),
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

// ==============================================================================
// DTOs para Medidores Físicos
// ==============================================================================

export const CrearMedidorInputSchema = z.object({
  instalacionId: z.string().uuid("Identificador de instalación inválido"),
  tipoMedidorId: z.string().uuid("Identificador de tipo de medidor inválido"),
  codigo: z
    .string()
    .trim()
    .min(3, "El código debe tener al menos 3 caracteres")
    .max(50, "El código no puede exceder 50 caracteres"),
  numeroSerie: z.string().trim().max(100).optional(),
  ubicacionInterna: z
    .string()
    .trim()
    .min(2, "La ubicación interna debe tener al menos 2 caracteres")
    .max(200),
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
  ultimaLectura: z
    .object({
      valor: z.number(),
      timestamp: z.date(),
    })
    .nullable()
    .optional(),
});

export type MedidorResponse = z.infer<typeof MedidorResponseSchema>;

// ==============================================================================
// Errores de Dominio Tipados
// ==============================================================================

export type MedidoresErrorCode =
  | "TIPO_MEDIDOR_NOT_FOUND"
  | "TIPO_MEDIDOR_NOMBRE_DUPLICADO"
  | "TIPO_MEDIDOR_INACTIVO"
  | "MEDIDOR_NOT_FOUND"
  | "MEDIDOR_CODIGO_DUPLICADO";

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
