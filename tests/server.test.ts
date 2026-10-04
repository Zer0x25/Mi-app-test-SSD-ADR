import { describe, it, expect, afterAll, vi } from "vitest";
import { buildServer } from "../src/server.js";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { signJwt } from "../src/modules/usuarios/auth.utils.js";
import { config } from "../src/core/config.js";
import { WebhookDispatcherService } from "../src/modules/webhooks/webhooks.service.js";

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
      $queryRawUnsafe: async () => [],
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
      webhookEndpoint: { count: async () => 0 },
      webhookEntrega: { count: async () => 0 },
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

  describe("Control de Acceso RBAC en /api/webhooks", () => {
    const adminToken = signJwt(
      {
        userId: "11111111-1111-1111-1111-111111111111",
        email: "admin@test.cl",
        nombre: "Admin Test",
        rol: "ADMIN",
      },
      config.JWT_SECRET
    );
    const supervisorToken = signJwt(
      {
        userId: "22222222-2222-2222-2222-222222222222",
        email: "sup@test.cl",
        nombre: "Supervisor Test",
        rol: "SUPERVISOR",
      },
      config.JWT_SECRET
    );
    const operadorToken = signJwt(
      {
        userId: "33333333-3333-3333-3333-333333333333",
        email: "op@test.cl",
        nombre: "Operador Test",
        rol: "OPERADOR",
      },
      config.JWT_SECRET
    );

    it("GET /api/webhooks sin token debe retornar 401 Unauthorized", async () => {
      const res = await app.inject({ method: "GET", url: "/api/webhooks" });
      expect(res.statusCode).toBe(401);
    });

    it("GET /api/webhooks con rol OPERADOR debe retornar 403 Forbidden", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/webhooks",
        headers: { authorization: `Bearer ${operadorToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("GET /api/webhooks con rol SUPERVISOR debe retornar 403 Forbidden", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/webhooks",
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("GET /api/webhooks con rol ADMIN debe retornar 200 OK", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/webhooks",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    });

    it("POST /api/webhooks/check-calibraciones debe ser accesible para SUPERVISOR", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/webhooks/check-calibraciones",
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.medidoresEvaluados).toBeDefined();
      expect(data.eventosDespachados).toBeDefined();
    });
  });

  describe("Observabilidad y Triggers de Webhooks ante Errores Críticos (ADR 0006 / feat-013)", () => {
    it("buildServer debe configurar Fastify con logger silencioso en test por defecto, pero permitir inyección personalizada", async () => {
      const customApp = await buildServer({ serveStatic: false, logger: false });
      expect(customApp).toBeDefined();
      await customApp.close();
    });

    it("Error no controlado (500) debe registrar log estructurado y disparar webhook sistema.error_critico", async () => {
      const mockWebhooksService = {
        despacharEvento: vi.fn().mockResolvedValue([]),
      } as unknown as WebhookDispatcherService;

      const crashApp = await buildServer({
        serveStatic: false,
        webhooksService: mockWebhooksService,
      });

      crashApp.get("/test-unhandled-crash", async () => {
        throw new Error("Fallo catastrófico de simulación en hardware");
      });

      await crashApp.ready();

      const res = await crashApp.inject({
        method: "GET",
        url: "/test-unhandled-crash",
      });

      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.statusCode).toBe(500);
      expect(body.error).toBe("INTERNAL_SERVER_ERROR");
      expect(body.message).toBe("Error interno del servidor");

      expect(mockWebhooksService.despacharEvento).toHaveBeenCalledTimes(1);
      expect(mockWebhooksService.despacharEvento).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "sistema.error_critico",
          severity: "CRITICAL",
          title: "Error Crítico de Servidor en GET /test-unhandled-crash",
          message: "Fallo catastrófico de simulación en hardware",
          data: expect.objectContaining({
            method: "GET",
            url: "/test-unhandled-crash",
            statusCode: 500,
            errorName: "Error",
          }),
        })
      );

      await crashApp.close();
    });

    it("Errores de cliente (404 / 4xx) NO deben disparar webhook de error crítico", async () => {
      const mockWebhooksService = {
        despacharEvento: vi.fn().mockResolvedValue([]),
      } as unknown as WebhookDispatcherService;

      const clientApp = await buildServer({
        serveStatic: false,
        webhooksService: mockWebhooksService,
      });
      await clientApp.ready();

      const res404 = await clientApp.inject({
        method: "GET",
        url: "/api/endpoint-inexistente-totalmente",
      });

      expect(res404.statusCode).toBe(404);
      expect(mockWebhooksService.despacharEvento).not.toHaveBeenCalled();

      await clientApp.close();
    });

    it("Resiliencia Fail-Safe: fallo en el despacho del webhook no bloquea ni altera la respuesta 500", async () => {
      const brokenWebhooksService = {
        despacharEvento: vi.fn().mockRejectedValue(new Error("Timeout de red en endpoint receptor")),
      } as unknown as WebhookDispatcherService;

      const failSafeApp = await buildServer({
        serveStatic: false,
        webhooksService: brokenWebhooksService,
      });

      failSafeApp.get("/test-failsafe-crash", async () => {
        throw new Error("Crash de base de datos");
      });

      await failSafeApp.ready();

      const res = await failSafeApp.inject({
        method: "GET",
        url: "/test-failsafe-crash",
      });

      expect(res.statusCode).toBe(500);
      expect(brokenWebhooksService.despacharEvento).toHaveBeenCalledTimes(1);
      const body = res.json();
      expect(body.statusCode).toBe(500);
      expect(body.error).toBe("INTERNAL_SERVER_ERROR");

      await failSafeApp.close();
    });

    it("debe incluir cabeceras HTTP de seguridad estrictas (Helmet & CSP)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/healthz",
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-security-policy"]).toBeDefined();
    });

    it("GET /api/lecturas/recientes debe validar parámetros con Zod (rechazar limit inválido con 400)", async () => {
      const resInvalido = await app.inject({
        method: "GET",
        url: "/api/lecturas/recientes?limit=no-es-numero",
      });
      expect(resInvalido.statusCode).toBe(400);

      const resExcedido = await app.inject({
        method: "GET",
        url: "/api/lecturas/recientes?limit=999",
      });
      expect(resExcedido.statusCode).toBe(400);

      const resValido = await app.inject({
        method: "GET",
        url: "/api/lecturas/recientes?limit=5",
      });
      expect(resValido.statusCode).toBe(200);
      expect(Array.isArray(resValido.json())).toBe(true);
    });
  });
});


