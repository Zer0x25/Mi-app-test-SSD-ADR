/**
 * Clase base abstracta para todos los errores de dominio del sistema.
 * 
 * Garantiza que ningún servicio lance errores genéricos no tipados
 * y que la capa de transporte (HTTP controllers) pueda traducirlos
 * automáticamente a códigos de estado HTTP semánticos.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;

    // Mantiene el stack trace correcto en entornos V8/Node.js
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Predicado de tipo para validar si un error capturado es un DomainError.
 */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
