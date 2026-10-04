import { describe, it, expect, afterAll } from "vitest";
import { buildServer } from "../src/server.js";
import { FastifyInstance } from "fastify";
import { config } from "../src/core/config.js";

describe("Endpoint GET /api/config - Configuración de Entorno y Features", () => {
  let app: FastifyInstance;

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("debe retornar 200 OK con el entorno actual y la bandera devRoleSwitcher", async () => {
    app = await buildServer({ serveStatic: false });
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/config",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("env");
    expect(body.env).toBe(config.NODE_ENV);
    expect(body).toHaveProperty("features");
    expect(body.features).toHaveProperty("devRoleSwitcher");

    // En entorno test / dev, devRoleSwitcher debe ser booleano acorde
    expect(typeof body.features.devRoleSwitcher).toBe("boolean");
    if (config.NODE_ENV === "development" || config.NODE_ENV === "test") {
      expect(body.features.devRoleSwitcher).toBe(true);
    } else {
      expect(body.features.devRoleSwitcher).toBe(false);
    }
  });
});
