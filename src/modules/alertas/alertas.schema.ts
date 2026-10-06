import { z } from "zod";
import { DomainError } from "../../core/errors.js";

export class IncidenteNotFoundError extends DomainError {
  readonly code = "INCIDENTE_NOT_FOUND";
  readonly statusCode = 404;

  constructor(incidenteId: string) {
    super(`El incidente con ID «${incidenteId}» no fue encontrado.`, { incidenteId });
  }
}

export class ReglaAlertaNotFoundError extends DomainError {
  readonly code = "REGLA_NOT_FOUND";
  readonly statusCode = 404;

  constructor(reglaId: string) {
    super(`La regla de alerta con ID «${reglaId}» no fue encontrada.`, { reglaId });
  }
}

export class IncidenteYaResueltoError extends DomainError {
  readonly code = "INCIDENTE_YA_RESUELTO";
  readonly statusCode = 422;

  constructor(incidenteId: string) {
    super(`El incidente con ID «${incidenteId}» ya se encuentra resuelto.`, { incidenteId });
  }
}

export class InstalacionNoAsignadaError extends DomainError {
  readonly code = "INSTALACION_NO_ASIGNADA";
  readonly statusCode = 403;

  constructor(instalacionId: string) {
    super(`Acceso denegado: el usuario no tiene asignada la instalación «${instalacionId}».`, {
      instalacionId,
    });
  }
}

export const TipoAlertaEnum = z.enum(["SALTO_CONSUMO", "FUGA_PROBABLE", "SIN_REPORTE"]);
export type TipoAlerta = z.infer<typeof TipoAlertaEnum>;

export const SeveridadAlertaEnum = z.enum(["INFO", "WARNING", "CRITICAL"]);
export type SeveridadAlerta = z.infer<typeof SeveridadAlertaEnum>;

export const EstadoIncidenteEnum = z.enum(["ABIERTO", "EN_REVISION", "RESUELTO"]);
export type EstadoIncidente = z.infer<typeof EstadoIncidenteEnum>;

export const CrearReglaAlertaInputSchema = z.object({
  nombre: z.string().trim().min(3),
  tipo: TipoAlertaEnum,
  recurso: z.enum(["AGUA", "LUZ", "GAS", "PETROLEO"]).optional().nullable(),
  umbralValor: z.number().positive("El umbral debe ser positivo"),
  activa: z.boolean().default(true),
});
export type CrearReglaAlertaInput = z.infer<typeof CrearReglaAlertaInputSchema>;

export const ResolverIncidenteInputSchema = z.object({
  estado: z.enum(["EN_REVISION", "RESUELTO"]),
  notasResolucion: z.string().trim().min(3, "Las notas de resolución deben tener al menos 3 caracteres"),
});
export type ResolverIncidenteInput = z.infer<typeof ResolverIncidenteInputSchema>;

export const FiltroIncidentesSchema = z.object({
  instalacionId: z.string().uuid().optional(),
  estado: EstadoIncidenteEnum.optional(),
  severidad: SeveridadAlertaEnum.optional(),
  tipo: TipoAlertaEnum.optional(),
});
export type FiltroIncidentes = z.infer<typeof FiltroIncidentesSchema>;

export const IncidenteAlertaResponseSchema = z.object({
  id: z.string().uuid(),
  reglaId: z.string().uuid().nullable().optional(),
  medidorId: z.string().uuid(),
  medidorCodigo: z.string().optional(),
  instalacionId: z.string().uuid(),
  instalacionNombre: z.string().optional(),
  tipo: TipoAlertaEnum,
  severidad: SeveridadAlertaEnum,
  mensaje: z.string(),
  estado: EstadoIncidenteEnum,
  valorDetectado: z.number().nullable().optional(),
  fechaDeteccion: z.date(),
  fechaResolucion: z.date().nullable().optional(),
  notasResolucion: z.string().nullable().optional(),
  createdAt: z.date(),
});
export type IncidenteAlertaResponse = z.infer<typeof IncidenteAlertaResponseSchema>;

export const ResumenAlertasResponseSchema = z.object({
  totalAbiertos: z.number(),
  totalCriticos: z.number(),
  totalAdvertencias: z.number(),
  totalEnRevision: z.number(),
  totalResueltos: z.number(),
});
export type ResumenAlertasResponse = z.infer<typeof ResumenAlertasResponseSchema>;
