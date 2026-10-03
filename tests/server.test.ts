import { describe, it, expect, afterAll } from "vitest";
import { buildServer } from "../src/server.js";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";

describe("Fastify Server E2E Health Check & Security", () => {
  let app: FastifyInstance;

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("GET /api/health debe responder 200 con status ok (retrocompatibilidad)", async () => {
    app = await buildServer({ serveStatic: false });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("Sistema Medidores");
  });

  it("GET /healthz debe responder 200 OK con uptime (Liveness Probe)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.timestamp).toBeDefined();
  });

  it("GET /readyz debe responder 200 OK cuando la base de datos está conectada (Readiness Probe)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/readyz",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ready");
    expect(body.database).toBe("connected");
    expect(body.timestamp).toBeDefined();
  });

  it("GET /readyz debe responder 503 Service Unavailable cuando falla la base de datos", async () => {
    const mockPrisma = {
      $queryRaw: async () => {
        throw new Error("Conexión perdida con SQLite / disco bloqueado");
      },
      // Stubs mínimos para arranque de buildServer
      usuario: { findUnique: async () => null, count: async () => 0 },
      instalacion: { findMany: async () => [] },
      tipoMedidor: { findMany: async () => [] },
      medidor: { findMany: async () => [] },
      lectura: { count: async () => 0 },
      asignacionOperador: { findMany: async () => [] },
      facturaServicio: { count: async () => 0 },
      reglaAlerta: { count: async () => 0 },
      incidenteAlerta: { count: async () => 0 },
      registroMantenimiento: { count: async () => 0 },
      auditoriaEvento: { count: async () => 0 },
    } as unknown as PrismaClient;

    const brokenApp = await buildServer({ prisma: mockPrisma, serveStatic: false });
    await brokenApp.ready();

    const response = await brokenApp.inject({
      method: "GET",
      url: "/readyz",
    });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.status).toBe("not_ready");
    expect(body.database).toBe("disconnected");
    expect(body.error).toBeDefined();

    await brokenApp.close();
  });

  it("POST /api/auth/login debe aplicar Rate Limiting (429 al superar 5 intentos por minuto)", async () => {
    // 5 intentos rápidos
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "atacante@fuerzabruta.cl",
          password: `intento-${i}`,
        },
      });
      // Debería ser 401 Credenciales Inválidas
      expect(res.statusCode).toBe(401);
    }

    // 6to intento consecutivo desde la misma IP
    const blockedRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "atacante@fuerzabruta.cl",
        password: "intento-bloqueado",
      },
    });

    expect(blockedRes.statusCode).toBe(429);
    const body = blockedRes.json();
    expect(body.error).toBeDefined();

    // Comprobar que endpoints públicos o de salud no se ven afectados por el rate limit de login
    const healthRes = await app.inject({
      method: "GET",
      url: "/healthz",
    });
    expect(healthRes.statusCode).toBe(200);
  });
});
