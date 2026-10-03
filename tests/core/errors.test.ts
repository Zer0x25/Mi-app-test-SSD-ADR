import { describe, it, expect } from "vitest";
import { DomainError, isDomainError } from "../../src/core/errors.js";

class DummyDomainError extends DomainError {
  readonly code = "DUMMY_ERROR";
  readonly statusCode = 400;
}

describe("Core Domain Errors Suite", () => {
  it("debe capturar correctamente un error de dominio con sus propiedades", () => {
    const error = new DummyDomainError("Operación no permitida", { motivo: "test" });

    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe("DUMMY_ERROR");
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe("Operación no permitida");
    expect(error.details).toEqual({ motivo: "test" });
  });

  it("debe retornar false para errores estándar de JavaScript", () => {
    const standardError = new Error("Error genérico");
    expect(isDomainError(standardError)).toBe(false);
  });
});
