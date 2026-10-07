import { describe, it, expect, afterAll } from "vitest";
import { buildServer, isDemoSeedEnabled } from "../src/server.js";
import { FastifyInstance } from "fastify";

describe("Guardia Demo-solo-dev y probes para healthcheck real (feat-027)", () => {
  let app: FastifyInstance;

  afterAll(async () => {
    if (app) await app.close();
  });

  it("isDemoSeedEnabled: habilitado en development/test, bloqueado en staging/production", () => {
    expect(isDemoSeedEnabled("development")).toBe(true);
    expect(isDemoSeedEnabled("test")).toBe(true);
    expect(isDemoSeedEnabled("staging")).toBe(false);
    expect(isDemoSeedEnabled("production")).toBe(false);
  });

  it("POST /api/demo/seed en entorno test responde 200 (sin regresión E2E)", async () => {
    app = await buildServer({ serveStatic: false });
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/api/demo/seed" });
    expect(res.statusCode).toBe(200);
    expect(res.json().seedData).toBeDefined();
  });

  it("GET /readyz responde 200 sin auth (base del healthcheck real)", async () => {
    if (!app) {
      app = await buildServer({ serveStatic: false });
      await app.ready();
    }
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ready");
  });

  it("GET /api/health responde 200 sin auth", async () => {
    if (!app) {
      app = await buildServer({ serveStatic: false });
      await app.ready();
    }
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
  });
});
