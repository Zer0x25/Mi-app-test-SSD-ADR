import { z } from "zod";
import { DomainError } from "../../core/errors.js";

// ==============================================================================
// DTOs y Esquemas Zod para Instalaciones
// ==============================================================================

export const CrearInstalacionInputSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(100, "El nombre no puede exceder 100 caracteres"),
  codigo: z
    .string()
    .trim()
    .min(2, "El código debe tener al menos 2 caracteres")
    .max(50, "El código no puede exceder 50 caracteres")
    .optional(),
  ubicacion: z
    .string()
    .trim()
    .min(3, "La ubicación debe tener al menos 3 caracteres")
    .max(200, "La ubicación no puede exceder 200 caracteres")
    .optional(),
  direccion: z
    .string()
    .trim()
    .min(3, "La dirección debe tener al menos 3 caracteres")
    .max(200, "La dirección no puede exceder 200 caracteres")
    .optional(),
});

export type CrearInstalacionInput = z.infer<typeof CrearInstalacionInputSchema>;

export const EditarInstalacionInputSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(100, "El nombre no puede exceder 100 caracteres")
    .optional(),
  codigo: z
    .string()
    .trim()
    .min(2, "El código debe tener al menos 2 caracteres")
    .max(50, "El código no puede exceder 50 caracteres")
    .optional(),
  ubicacion: z
    .string()
    .trim()
    .min(3, "La ubicación debe tener al menos 3 caracteres")
    .max(200, "La ubicación no puede exceder 200 caracteres")
    .optional(),
  direccion: z
    .string()
    .trim()
    .min(3, "La dirección debe tener al menos 3 caracteres")
    .max(200, "La dirección no puede exceder 200 caracteres")
    .optional(),
  activa: z.boolean().optional(),
});

export type EditarInstalacionInput = z.infer<typeof EditarInstalacionInputSchema>;

export const InstalacionResponseSchema = z.object({
  id: z.string().uuid(),
  codigo: z.string().nullable().optional(),
  nombre: z.string(),
  ubicacion: z.string(),
  direccion: z.string().optional(),
  activa: z.boolean(),
  enPeriodoGracia: z.boolean().optional(),
  diasRestantesGracia: z.number().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type InstalacionResponse = z.infer<typeof InstalacionResponseSchema>;

// ==============================================================================
// DTOs y Esquemas Zod para Asignaciones de Operador
// ==============================================================================

export const AsignarOperadorInputSchema = z.object({
  instalacionId: z.string().uuid("Identificador de instalación inválido"),
  usuarioId: z.string().uuid("Identificador de usuario inválido"),
});

export type AsignarOperadorInput = z.infer<typeof AsignarOperadorInputSchema>;

export const AsignacionResponseSchema = z.object({
  id: z.string().uuid(),
  instalacionId: z.string().uuid(),
  usuarioId: z.string().uuid(),
  createdAt: z.date(),
});

export type AsignacionResponse = z.infer<typeof AsignacionResponseSchema>;

// ==============================================================================
// Errores de Dominio Tipados
// ==============================================================================

export type InstalacionErrorCode =
  | "INSTALACION_NOT_FOUND"
  | "INSTALACION_NOMBRE_DUPLICADO"
  | "INSTALACION_CODIGO_DUPLICADO"
  | "INSTALACION_INACTIVA"
  | "ASIGNACION_DUPLICADA"
  | "PERIODO_GRACIA_EXPIRADO"
  | "ELIMINACION_FISICA_PROHIBIDA"
  | "INSTALACION_CON_MEDIDORES_NO_ELIMINABLE"
  | "INSTALACION_TIENE_MEDIDORES_ACTIVOS";

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

export class InstalacionCodigoDuplicadoError extends DomainError {
  readonly code = "INSTALACION_CODIGO_DUPLICADO";
  readonly statusCode = 409;
  constructor(codigo: string) {
    super(`Ya existe una instalación con el código '${codigo}'.`, { codigo });
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
    super(`El usuario '${usuarioId}' ya se encuentra asignado a la instalación '${instalacionId}'.`, {
      instalacionId,
      usuarioId,
    });
  }
}

export class PeriodoGraciaExpiradoError extends DomainError {
  readonly code = "PERIODO_GRACIA_EXPIRADO";
  readonly statusCode = 422;
  constructor(entidad: string, id: string) {
    super(
      `El periodo de gracia de 30 días para '${entidad}' (${id}) ha expirado. El identificador quedó inmutable.`,
      { entidad, id }
    );
  }
}

export class EliminacionFisicaProhibidaError extends DomainError {
  readonly code = "ELIMINACION_FISICA_PROHIBIDA";
  readonly statusCode = 422;
  constructor(entidad: string, id: string) {
    super(
      `No se permite la eliminación física de '${entidad}' (${id}) fuera del periodo de marcha blanca de 30 días. Debe archivarse.`,
      { entidad, id }
    );
  }
}

export class InstalacionConMedidoresNoEliminableError extends DomainError {
  readonly code = "INSTALACION_CON_MEDIDORES_NO_ELIMINABLE";
  readonly statusCode = 422;
  constructor(id: string, count: number) {
    super(
      `No se puede eliminar la instalación '${id}' porque tiene ${count} medidor(es) asociados. Debe archivarse.`,
      { id, count }
    );
  }
}

export class InstalacionTieneMedidoresActivosError extends DomainError {
  readonly code = "INSTALACION_TIENE_MEDIDORES_ACTIVOS";
  readonly statusCode = 422;
  constructor(id: string, count: number) {
    super(
      `No se puede archivar la instalación '${id}' porque tiene ${count} medidor(es) activo(s). Debe archivar los medidores primero.`,
      { id, count }
    );
  }
}
