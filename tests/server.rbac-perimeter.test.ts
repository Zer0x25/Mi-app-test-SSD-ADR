import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { buildServer } from "../src/server.js";
import { signJwt } from "../src/modules/usuarios/auth.utils.js";
import { config } from "../src/core/config.js";

describe("Suite de Blindaje Perimetral Zero-Trust y Matriz RBAC (feat-019 / ADR 0013)", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let adminToken: string;
  let supervisorToken: string;
  let operadorToken: string;
  let instalacionAsignadaId: string;
  let instalacionNoAsignadaId: string;
  let tipoMedidorId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await buildServer({ prisma, serveStatic: false });
    await app.ready();

    // 1. Crear instalaciones de prueba
    const instAsignada = await prisma.instalacion.create({
      data: {
        nombre: `Sede Asignada ${Date.now()}`,
        ubicacion: "Av. Asignada 100",
        activa: true,
      },
    });
    instalacionAsignadaId = instAsignada.id;

    const instNoAsignada = await prisma.instalacion.create({
      data: {
        nombre: `Sede No Asignada ${Date.now()}`,
        ubicacion: "Av. Libre 200",
        activa: true,
      },
    });
    instalacionNoAsignadaId = instNoAsignada.id;

    // 2. Crear tipo de medidor
    const tipo = await prisma.tipoMedidor.create({
      data: {
        nombre: `Tipo Test ${Date.now()}`,
        recurso: "AGUA",
        unidad: "M3",
        tipoMedicion: "ACUMULATIVO",
        activo: true,
      },
    });
    tipoMedidorId = tipo.id;

    // 3. Crear usuarios de prueba con roles específicos
    const adminUser = await prisma.usuario.create({
      data: {
        email: `admin-perimeter-${Date.now()}@medidores.cl`,
        passwordHash: "hash-fake",
        nombre: "Admin Perímetro",
        rol: "ADMIN",
      },
    });

    const supervisorUser = await prisma.usuario.create({
      data: {
        email: `sup-perimeter-${Date.now()}@medidores.cl`,
        passwordHash: "hash-fake",
        nombre: "Supervisor Perímetro",
        rol: "SUPERVISOR",
      },
    });

    const operadorUser = await prisma.usuario.create({
      data: {
        email: `op-perimeter-${Date.now()}@medidores.cl`,
        passwordHash: "hash-fake",
        nombre: "Operador Perímetro",
        rol: "OPERADOR",
      },
    });

    // 4. Asignar sede a supervisor y a operador
    await prisma.asignacionOperador.create({
      data: {
        usuarioId: supervisorUser.id,
        instalacionId: instalacionAsignadaId,
      },
    });

    await prisma.asignacionOperador.create({
      data: {
        usuarioId: operadorUser.id,
        instalacionId: instalacionAsignadaId,
      },
    });

    // 5. Generar tokens JWT
    adminToken = signJwt(
      {
        userId: adminUser.id,
        email: adminUser.email,
        nombre: adminUser.nombre,
        rol: "ADMIN",
      },
      config.JWT_SECRET
    );

    supervisorToken = signJwt(
      {
        userId: supervisorUser.id,
        email: supervisorUser.email,
        nombre: supervisorUser.nombre,
        rol: "SUPERVISOR",
      },
      config.JWT_SECRET
    );

    operadorToken = signJwt(
      {
        userId: operadorUser.id,
        email: operadorUser.email,
        nombre: operadorUser.nombre,
        rol: "OPERADOR",
      },
      config.JWT_SECRET
    );
  });

  afterAll(async () => {
    if (app) await app.close();
    await prisma.$disconnect();
  });

  describe("1. Blindaje Perimetral Fail-Closed (HTTP 401 en Rutas Privadas)", () => {
    it("POST /api/instalaciones sin token debe retornar 401 Unauthorized", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/instalaciones",
        payload: { nombre: "Intento Anónimo", ubicacion: "Calle Falsa" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("UNAUTHORIZED");
    });

    it("GET /api/instalaciones sin token debe retornar 401 Unauthorized", async () => {
      const res = await app.inject({ method: "GET", url: "/api/instalaciones" });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("UNAUTHORIZED");
    });

    it("POST /api/medidores sin token debe retornar 401 Unauthorized", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/medidores",
        payload: {
          codigo: "MED-ANON-01",
          numeroSerie: "SN-ANON",
          ubicacionInterna: "Sala",
          instalacionId: instalacionAsignadaId,
          tipoMedidorId,
        },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("UNAUTHORIZED");
    });

    it("GET /api/dashboard/kpis sin token debe retornar 401 Unauthorized", async () => {
      const res = await app.inject({ method: "GET", url: "/api/dashboard/kpis" });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("UNAUTHORIZED");
    });

    it("GET /api/reportes/consumos sin token debe retornar 401 Unauthorized", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/reportes/consumos?fechaInicio=2026-01-01T00:00:00.000Z&fechaFin=2026-12-31T23:59:59.000Z",
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("UNAUTHORIZED");
    });

    it("GET /api/alertas/incidentes sin token debe retornar 401 Unauthorized", async () => {
      const res = await app.inject({ method: "GET", url: "/api/alertas/incidentes" });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("UNAUTHORIZED");
    });

    it("GET /api/mantenimiento sin token debe retornar 401 Unauthorized", async () => {
      const res = await app.inject({ method: "GET", url: "/api/mantenimiento" });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("UNAUTHORIZED");
    });
  });

  describe("2. Allow-List de Rutas Públicas Exentas", () => {
    it("GET /healthz debe responder 200 sin autenticación", async () => {
      const res = await app.inject({ method: "GET", url: "/healthz" });
      expect(res.statusCode).toBe(200);
    });

    it("GET /readyz debe responder 200 sin autenticación", async () => {
      const res = await app.inject({ method: "GET", url: "/readyz" });
      expect(res.statusCode).toBe(200);
    });

    it("GET /api/health debe responder 200 sin autenticación", async () => {
      const res = await app.inject({ method: "GET", url: "/api/health" });
      expect(res.statusCode).toBe(200);
    });

    it("GET /api/config debe responder 200 sin autenticación", async () => {
      const res = await app.inject({ method: "GET", url: "/api/config" });
      expect(res.statusCode).toBe(200);
    });

    it("POST /api/demo/seed debe responder 200 sin autenticación", async () => {
      const res = await app.inject({ method: "POST", url: "/api/demo/seed" });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("3. Preservación Semántica de Códigos HTTP 404", () => {
    it("Ruta inexistente bajo /api/ sin token debe responder 404 Not Found (no enmascarar con 401)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/ruta-fantasma-inexistente-12345",
      });
      expect(res.statusCode).toBe(404);
    });

    it("Ruta inexistente bajo /api/ con token debe responder 404 Not Found", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/ruta-fantasma-inexistente-12345",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("Ruta inexistente bajo /api/ con archivos estáticos activos debe responder 404 Not Found (no enmascarar con 401)", async () => {
      const staticApp = await buildServer({ serveStatic: true });
      await staticApp.ready();
      const res = await staticApp.inject({
        method: "GET",
        url: "/api/ruta-fantasma-inexistente-12345",
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("NOT_FOUND");
      await staticApp.close();
    });
  });

  describe("4. Matriz RBAC para Rol OPERADOR (Modo Terreno Exclusivo)", () => {
    it("OPERADOR debe ser rechazado con 403 Forbidden en /api/dashboard/kpis", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/dashboard/kpis",
        headers: { authorization: `Bearer ${operadorToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("ACCESO_DENEGADO");
    });

    it("OPERADOR debe ser rechazado con 403 Forbidden en /api/reportes/consumos", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/reportes/consumos?fechaInicio=2026-01-01T00:00:00.000Z&fechaFin=2026-12-31T23:59:59.000Z",
        headers: { authorization: `Bearer ${operadorToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("ACCESO_DENEGADO");
    });

    it("OPERADOR debe ser rechazado con 403 Forbidden en /api/alertas/incidentes", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/alertas/incidentes",
        headers: { authorization: `Bearer ${operadorToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("ACCESO_DENEGADO");
    });

    it("OPERADOR debe ser rechazado con 403 Forbidden al crear instalaciones", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/instalaciones",
        headers: { authorization: `Bearer ${operadorToken}` },
        payload: { nombre: "Intento Operador", ubicacion: "Calle 1" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("OPERADOR debe ser rechazado con 403 Forbidden al crear medidores", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/medidores",
        headers: { authorization: `Bearer ${operadorToken}` },
        payload: {
          codigo: "MED-OP-FAIL",
          numeroSerie: "SN-OP",
          ubicacionInterna: "Sala",
          instalacionId: instalacionAsignadaId,
          tipoMedidorId,
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("OPERADOR debe poder consultar instalaciones para captura de lecturas (200 OK)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/instalaciones",
        headers: { authorization: `Bearer ${operadorToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    });
  });

  describe("5. Matriz RBAC para Rol SUPERVISOR", () => {
    it("SUPERVISOR puede consultar /api/dashboard/kpis (200 OK)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/dashboard/kpis",
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("SUPERVISOR es rechazado con 403 al crear instalaciones", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/instalaciones",
        headers: { authorization: `Bearer ${supervisorToken}` },
        payload: { nombre: "Intento Supervisor", ubicacion: "Calle 2" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("SUPERVISOR es rechazado con 403 al crear medidor en sede NO asignada", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/medidores",
        headers: { authorization: `Bearer ${supervisorToken}` },
        payload: {
          codigo: `MED-SUP-NO-${Date.now()}`,
          numeroSerie: `SN-SUP-NO-${Date.now()}`,
          ubicacionInterna: "Sala 2",
          instalacionId: instalacionNoAsignadaId,
          tipoMedidorId,
        },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("INSTALACION_NO_ASIGNADA");
    });

    it("SUPERVISOR puede crear medidor en sede ASIGNADA exitosamente (201 Created)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/medidores",
        headers: { authorization: `Bearer ${supervisorToken}` },
        payload: {
          codigo: `MED-SUP-OK-${Date.now()}`,
          numeroSerie: `SN-SUP-OK-${Date.now()}`,
          ubicacionInterna: "Sala 1",
          instalacionId: instalacionAsignadaId,
          tipoMedidorId,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBeDefined();
    });
  });

  describe("6. Matriz RBAC para Rol ADMIN (Acceso Total)", () => {
    it("ADMIN puede crear instalaciones (201 Created)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/instalaciones",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          nombre: `Sede Admin ${Date.now()}`,
          ubicacion: "Av. Admin 500",
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBeDefined();
    });

    it("ADMIN puede crear medidor en cualquier instalación (201 Created)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/medidores",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          codigo: `MED-ADM-${Date.now()}`,
          numeroSerie: `SN-ADM-${Date.now()}`,
          ubicacionInterna: "Sala Principal",
          instalacionId: instalacionNoAsignadaId,
          tipoMedidorId,
        },
      });
      expect(res.statusCode).toBe(201);
    });
  });
});
