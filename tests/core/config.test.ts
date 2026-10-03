import { describe, it, expect } from "vitest";
import { config, envSchema } from "../../src/core/config.js";

describe("Core Config Suite", () => {
  it("debe cargar la configuración de entorno con valores válidos", () => {
    expect(config).toBeDefined();
    expect(config.PORT).toBeGreaterThan(0);
    expect(config.DATABASE_URL).toBeDefined();
    expect(typeof config.DATABASE_URL).toBe("string");
    expect(config.JWT_SECRET).toBeDefined();
    expect(config.JWT_SECRET.length).toBeGreaterThanOrEqual(8);
  });

  it("debe garantizar que el objeto de configuración es inmutable (congelado)", () => {
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("debe validar exitosamente cuando NODE_ENV es staging (infra-002)", () => {
    const validStaging = envSchema.safeParse({
      NODE_ENV: "staging",
      PORT: "3000",
      DATABASE_URL: "file:/app/data/medidores-staging.db",
      JWT_SECRET: "secreto_staging_super_seguro_123456",
    });

    expect(validStaging.success).toBe(true);
    if (validStaging.success) {
      expect(validStaging.data.NODE_ENV).toBe("staging");
    }
  });
});
