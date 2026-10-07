import { z } from "zod";
import { DomainError } from "../../core/errors.js";

export class MedidorMantenimientoNotFoundError extends DomainError {
  readonly code = "MEDIDOR_NOT_FOUND";
  readonly statusCode = 404;

  constructor(medidorId: string) {
    super(`El medidor con ID «${medidorId}» no fue encontrado para registrar mantenimiento.`, { medidorId });
  }
}

export class LecturaRetiroInvalidaError extends DomainError {
  readonly code = "LECTURA_RETIRO_INVALIDA";
  readonly statusCode = 422;

  constructor(medidorId: string, lecturaRetiro: number, ultimaLectura: number) {
    super(
      `La lectura de retiro (${lecturaRetiro}) no puede ser menor a la última lectura registrada (${ultimaLectura}) del medidor acumulativo.`,
      { medidorId, lecturaRetiro, ultimaLectura }
    );
  }
}

export class PrecintoNuevoRequeridoError extends DomainError {
  readonly code = "PRECINTO_NUEVO_REQUERIDO";
  readonly statusCode = 400;

  constructor(medidorId: string) {
    super(`El evento de cambio de precinto requiere especificar el nuevo número de precinto.`, { medidorId });
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

export class VolumenRecargaRequeridoError extends DomainError {
  readonly code = "VOLUMEN_RECARGA_REQUERIDO";
  readonly statusCode = 400;

  constructor(medidorId: string) {
    super(`La recarga de tanque del medidor «${medidorId}» requiere volumenRecargado > 0.`, { medidorId });
  }
}

export class NivelPosteriorRequeridoError extends DomainError {
  readonly code = "NIVEL_POSTERIOR_REQUERIDO";
  readonly statusCode = 400;

  constructor(medidorId: string) {
    super(`La recarga de tanque del medidor «${medidorId}» requiere nivelPosterior >= 0.`, { medidorId });
  }
}

export class RecargaSoloNivelError extends DomainError {
  readonly code = "RECARGA_SOLO_NIVEL";
  readonly statusCode = 422;

  constructor(medidorId: string, tipoMedicion: string) {
    super(
      `La recarga de tanque solo aplica a medidores NIVEL (medidor «${medidorId}» es ${tipoMedicion}).`,
      { medidorId, tipoMedicion }
    );
  }
}

export const TipoMantenimientoEnum = z.enum([
  "CALIBRACION",
  "CAMBIO_PRECINTO",
  "REEMPLAZO_EQUIPO",
  "INSPECCION",
  "BAJA_TECNICA",
  "RECARGA_TANQUE",
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
  volumenRecargado: z.number().positive().optional().nullable(),
  nivelPosterior: z.number().nonnegative().optional().nullable(),
  observaciones: z.string().trim().max(1000).optional().nullable(),
});
export type RegistrarMantenimientoInput = z.infer<typeof RegistrarMantenimientoInputSchema>;

export const FiltroMantenimientosSchema = z.object({
  medidorId: z.string().uuid().optional(),
  instalacionId: z.string().uuid().optional(),
  tipo: TipoMantenimientoEnum.optional(),
});
export type FiltroMantenimientos = z.infer<typeof FiltroMantenimientosSchema>;

export const MantenimientoResponseSchema = z.object({
  id: z.string().uuid(),
  medidorId: z.string().uuid(),
  medidorCodigo: z.string().optional(),
  instalacionNombre: z.string().optional(),
  tipo: TipoMantenimientoEnum,
  fechaMantenimiento: z.date(),
  tecnicoResponsable: z.string(),
  numeroPrecintoAnterior: z.string().nullable().optional(),
  numeroPrecintoNuevo: z.string().nullable().optional(),
  proximaCalibracion: z.date().nullable().optional(),
  certificadoCalibracion: z.string().nullable().optional(),
  lecturaRetiro: z.number().nullable().optional(),
  motivoBaja: z.string().nullable().optional(),
  nuevoMedidorCodigo: z.string().nullable().optional(),
  volumenRecargado: z.number().nullable().optional(),
  nivelPosterior: z.number().nullable().optional(),
  observaciones: z.string().nullable().optional(),
  createdAt: z.date(),
});
export type MantenimientoResponse = z.infer<typeof MantenimientoResponseSchema>;
