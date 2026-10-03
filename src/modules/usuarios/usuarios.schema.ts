import { z } from "zod";
import { DomainError } from "../../core/errors.js";

// ==============================================================================
// TIPOS Y ENUMS DE ROLES
// ==============================================================================
export const RolUsuarioEnum = z.enum(["ADMIN", "SUPERVISOR", "OPERADOR"]);
export type RolUsuario = z.infer<typeof RolUsuarioEnum>;

// ==============================================================================
// ESQUEMAS DE ENTRADA (INPUT DTO)
// ==============================================================================
export const RegistroUsuarioInputSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Formato de correo electrónico inválido")
    .toLowerCase(),
  password: z
    .string()
    .min(8, "La contraseña debe tener un mínimo de 8 caracteres"),
  nombre: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres"),
  rol: RolUsuarioEnum.default("OPERADOR"),
});
export type RegistroUsuarioInput = z.infer<typeof RegistroUsuarioInputSchema>;

export const LoginInputSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Formato de correo inválido")
    .toLowerCase(),
  password: z
    .string()
    .min(1, "La contraseña no puede estar vacía"),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

// ==============================================================================
// ESQUEMAS DE SALIDA (OUTPUT DTO)
// ==============================================================================
export const UsuarioResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  nombre: z.string(),
  rol: RolUsuarioEnum,
  activo: z.boolean(),
  createdAt: z.date(),
});
export type UsuarioResponse = z.infer<typeof UsuarioResponseSchema>;

// Esquemas de Cambio y Gestión de Contraseñas
export const CambiarPasswordInputSchema = z.object({
  passwordActual: z.string().min(1, "La contraseña actual es requerida"),
  passwordNueva: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres"),
});
export type CambiarPasswordInput = z.infer<typeof CambiarPasswordInputSchema>;

export const ResetPasswordInputSchema = z.object({
  passwordNueva: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordInputSchema>;

export const EditarUsuarioInputSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").optional(),
  rol: RolUsuarioEnum.optional(),
  activo: z.boolean().optional(),
  instalacionesIds: z.array(z.string().uuid("ID de instalación inválido")).optional(),
});
export type EditarUsuarioInput = z.infer<typeof EditarUsuarioInputSchema>;

export const UsuarioConAsignacionesResponseSchema = UsuarioResponseSchema.extend({
  instalaciones: z.array(
    z.object({
      id: z.string().uuid(),
      nombre: z.string(),
    })
  ),
});
export type UsuarioConAsignacionesResponse = z.infer<typeof UsuarioConAsignacionesResponseSchema>;

export const AuthResponseSchema = z.object({
  token: z.string(),
  usuario: UsuarioResponseSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const TokenPayloadSchema = z.object({
  userId: z.string().uuid(),
  email: z.string(),
  nombre: z.string(),
  rol: RolUsuarioEnum,
  iat: z.number().optional(),
  exp: z.number().optional(),
});
export type TokenPayload = z.infer<typeof TokenPayloadSchema>;

// ==============================================================================
// ERRORES DE DOMINIO TIPADOS
// ==============================================================================
export class CredencialesInvalidasError extends DomainError {
  readonly code = "CREDENCIALES_INVALIDAS";
  readonly statusCode = 401;

  constructor() {
    super("Correo electrónico o contraseña incorrectos.");
  }
}

export class NoAutorizadoError extends DomainError {
  readonly code = "UNAUTHORIZED";
  readonly statusCode = 401;

  constructor(mensaje = "Cabecera Authorization con formato Bearer <token> requerida.") {
    super(mensaje);
  }
}

export class PasswordActualInvalidaError extends DomainError {
  readonly code = "PASSWORD_ACTUAL_INVALIDA";
  readonly statusCode = 401;

  constructor() {
    super("La contraseña actual ingresada es incorrecta.");
  }
}

export class UsuarioEmailDuplicadoError extends DomainError {
  readonly code = "USUARIO_EMAIL_DUPLICADO";
  readonly statusCode = 409;

  constructor(email: string) {
    super(`El correo electrónico «${email}» ya se encuentra registrado en el sistema.`, { email });
  }
}

export class UsuarioNotFoundError extends DomainError {
  readonly code = "USUARIO_NOT_FOUND";
  readonly statusCode = 404;

  constructor(identificador: string) {
    super(`El usuario «${identificador}» no fue encontrado.`, { identificador });
  }
}

export class UsuarioInactivoError extends DomainError {
  readonly code = "USUARIO_INACTIVO";
  readonly statusCode = 403;

  constructor(id: string) {
    super(`El usuario «${id}» está desactivado y no puede acceder al sistema.`, { id });
  }
}

export class AccesoDenegadoError extends DomainError {
  readonly code = "ACCESO_DENEGADO";
  readonly statusCode = 403;

  constructor(accion: string, rol: string) {
    super(`Acceso denegado: el rol «${rol}» no cuenta con permisos para «${accion}».`, { accion, rol });
  }
}

export class InstalacionNoAsignadaError extends DomainError {
  readonly code = "INSTALACION_NO_ASIGNADA";
  readonly statusCode = 403;

  constructor(usuarioId: string, instalacionId: string) {
    super(`Operación denegada: el usuario no tiene asignada la instalación «${instalacionId}».`, {
      usuarioId,
      instalacionId,
    });
  }
}
