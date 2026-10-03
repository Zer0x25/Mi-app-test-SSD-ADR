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
  ubicacion: z
    .string()
    .trim()
    .min(3, "La ubicación debe tener al menos 3 caracteres")
    .max(200, "La ubicación no puede exceder 200 caracteres"),
});

export type CrearInstalacionInput = z.infer<typeof CrearInstalacionInputSchema>;

export const InstalacionResponseSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  ubicacion: z.string(),
  activa: z.boolean(),
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
    super(`El usuario '${usuarioId}' ya se encuentra asignado a la instalación '${instalacionId}'.`, {
      instalacionId,
      usuarioId,
    });
  }
}
