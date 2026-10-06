import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { buildServer } from "../src/server.js";
import { signJwt } from "../src/modules/usuarios/auth.utils.js";
import { config } from "../src/core/config.js";

describe("Suite de Aislamiento Territorial y Location Scoping (feat-021)", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let adminToken: string;
  let supervisorToken: string;
  let operadorToken: string;
  let instAsignadaId: string;
  let instAjenaId: string;
  let medidorAsignadoId: string;
  let medidorAjenoId: string;
  let incAsignadoId: string;
  let incAjenoId: string;
  let mantAsignadoId: string;
  let mantAjenoId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await buildServer({ prisma, serveStatic: false });
    await app.ready();

    // 1. Crear dos instalaciones diferenciadas
    const inst1 = await prisma.instalacion.create({
      data: {
        nombre: `Sede Asignada Scope ${Date.now()}`,
        ubicacion: "Av. Asignada 100",
        activa: true,
      },
    });
    instAsignadaId = inst1.id;

    const inst2 = await prisma.instalacion.create({
      data: {
        nombre: `Sede Ajena Scope ${Date.now()}`,
        ubicacion: "Av. Ajena 200",
        activa: true,
      },
    });
    instAjenaId = inst2.id;

    // 2. Crear tipo de medidor
    const tipo = await prisma.tipoMedidor.create({
      data: {
        nombre: `Tipo Scope ${Date.now()}`,
        recurso: "AGUA",
        unidad: "M3",
        tipoMedicion: "ACUMULATIVO",
        activo: true,
      },
    });

    // 3. Crear medidores en ambas sedes
    const med1 = await prisma.medidor.create({
      data: {
        codigo: `MED-ASIG-${Date.now().toString().slice(-4)}`,
        instalacionId: instAsignadaId,
        tipoMedidorId: tipo.id,
        ubicacionInterna: "Sala Asignada",
        activo: true,
      },
    });
    medidorAsignadoId = med1.id;

    const med2 = await prisma.medidor.create({
      data: {
        codigo: `MED-AJEN-${Date.now().toString().slice(-4)}`,
        instalacionId: instAjenaId,
        tipoMedidorId: tipo.id,
        ubicacionInterna: "Sala Ajena",
        activo: true,
      },
    });
    medidorAjenoId = med2.id;

    // 4. Crear lecturas para ambos medidores
    await prisma.lectura.create({
      data: {
        medidorId: medidorAsignadoId,
        operadorId: "op-test",
        valor: 100,
        fechaLectura: new Date(Date.now() - 3600 * 1000),
      },
    });
    await prisma.lectura.create({
      data: {
        medidorId: medidorAjenoId,
        operadorId: "op-test",
        valor: 200,
        fechaLectura: new Date(Date.now() - 3600 * 1000),
      },
    });

    // 4b. Crear incidentes y mantenimientos
    const inc1 = await prisma.incidenteAlerta.create({
      data: {
        medidorId: medidorAsignadoId,
        instalacionId: instAsignadaId,
        tipo: "FUGA_PROBABLE",
        severidad: "WARNING",
        mensaje: "Fuga detectada asignada",
        estado: "ABIERTO",
        fechaDeteccion: new Date(),
      },
    });
    incAsignadoId = inc1.id;

    const inc2 = await prisma.incidenteAlerta.create({
      data: {
        medidorId: medidorAjenoId,
        instalacionId: instAjenaId,
        tipo: "SALTO_CONSUMO",
        severidad: "CRITICAL",
        mensaje: "Salto detectado ajeno",
        estado: "ABIERTO",
        fechaDeteccion: new Date(),
      },
    });
    incAjenoId = inc2.id;

    const m1 = await prisma.registroMantenimiento.create({
      data: {
        medidorId: medidorAsignadoId,
        tipo: "INSPECCION",
        fechaMantenimiento: new Date(),
        tecnicoResponsable: "Tecnico Asignado",
      },
    });
    mantAsignadoId = m1.id;

    const m2 = await prisma.registroMantenimiento.create({
      data: {
        medidorId: medidorAjenoId,
        tipo: "INSPECCION",
        fechaMantenimiento: new Date(),
        tecnicoResponsable: "Tecnico Ajeno",
      },
    });
    mantAjenoId = m2.id;

    // 5. Crear usuarios
    const adminUser = await prisma.usuario.create({
      data: {
        email: `admin-scope-${Date.now()}@medidores.cl`,
        passwordHash: "hash-fake",
        nombre: "Admin Scope",
        rol: "ADMIN",
      },
    });

    const supUser = await prisma.usuario.create({
      data: {
        email: `sup-scope-${Date.now()}@medidores.cl`,
        passwordHash: "hash-fake",
        nombre: "Supervisor Scope",
        rol: "SUPERVISOR",
      },
    });

    const opUser = await prisma.usuario.create({
      data: {
        email: `op-scope-${Date.now()}@medidores.cl`,
        passwordHash: "hash-fake",
        nombre: "Operador Scope",
        rol: "OPERADOR",
      },
    });

    // 6. Asignar ÚNICAMENTE instAsignada a supervisor y operador
    await prisma.asignacionOperador.create({
      data: {
        usuarioId: supUser.id,
        instalacionId: instAsignadaId,
      },
    });
    await prisma.asignacionOperador.create({
      data: {
        usuarioId: opUser.id,
        instalacionId: instAsignadaId,
      },
    });

    // 7. Firmar tokens
    adminToken = signJwt({
      userId: adminUser.id,
      email: adminUser.email,
      rol: "ADMIN",
      nombre: adminUser.nombre,
    }, config.JWT_SECRET);

    supervisorToken = signJwt({
      userId: supUser.id,
      email: supUser.email,
      rol: "SUPERVISOR",
      nombre: supUser.nombre,
    }, config.JWT_SECRET);

    operadorToken = signJwt({
      userId: opUser.id,
      email: opUser.email,
      rol: "OPERADOR",
      nombre: opUser.nombre,
    }, config.JWT_SECRET);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe("1. Catálogo General (GET /api/instalaciones y GET /api/medidores)", () => {
    it("ADMIN debe recibir todas las instalaciones activas", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/instalaciones",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const list = res.json();
      expect(list.some((i: { id: string }) => i.id === instAsignadaId)).toBe(true);
      expect(list.some((i: { id: string }) => i.id === instAjenaId)).toBe(true);
    });

    it("SUPERVISOR debe recibir ÚNICAMENTE sus instalaciones asignadas", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/instalaciones",
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      expect(res.statusCode).toBe(200);
      const list = res.json();
      expect(list.some((i: { id: string }) => i.id === instAsignadaId)).toBe(true);
      expect(list.some((i: { id: string }) => i.id === instAjenaId)).toBe(false);
    });

    it("OPERADOR debe recibir ÚNICAMENTE sus instalaciones asignadas", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/instalaciones",
        headers: { authorization: `Bearer ${operadorToken}` },
      });
      expect(res.statusCode).toBe(200);
      const list = res.json();
      expect(list.some((i: { id: string }) => i.id === instAsignadaId)).toBe(true);
      expect(list.some((i: { id: string }) => i.id === instAjenaId)).toBe(false);
    });

    it("SUPERVISOR debe recibir medidores ÚNICAMENTE de sus sedes asignadas", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/medidores",
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      expect(res.statusCode).toBe(200);
      const list = res.json();
      expect(list.some((m: { id: string }) => m.id === medidorAsignadoId)).toBe(true);
      expect(list.some((m: { id: string }) => m.id === medidorAjenoId)).toBe(false);
    });
  });

  describe("2. Dashboard Scoping (GET /api/dashboard/*)", () => {
    it("SUPERVISOR debe recibir KPIs computados solo sobre su sede asignada", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/dashboard/kpis",
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      expect(res.statusCode).toBe(200);
      const kpis = res.json();
      expect(kpis.totalInstalaciones).toBe(1);
    });

    it("SUPERVISOR debe recibir consumos agrupados solo de su sede asignada", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/dashboard/consumos",
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      expect(res.statusCode).toBe(200);
      const consumos = res.json();
      expect(consumos.some((c: { instalacionId: string }) => c.instalacionId === instAsignadaId)).toBe(true);
      expect(consumos.some((c: { instalacionId: string }) => c.instalacionId === instAjenaId)).toBe(false);
    });

    it("SUPERVISOR debe recibir telemetría reciente solo de sus medidores asignados", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/lecturas/recientes",
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      expect(res.statusCode).toBe(200);
      const list = res.json();
      expect(list.some((l: { medidorId: string }) => l.medidorId === medidorAsignadoId)).toBe(true);
      expect(list.some((l: { medidorId: string }) => l.medidorId === medidorAjenoId)).toBe(false);
    });
  });

  describe("3. Reportes Scoping (GET /api/reportes/consumos)", () => {
    it("SUPERVISOR sin filtro de sede debe recibir consumos solo de su sede asignada", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/reportes/consumos?fechaInicio=${new Date(Date.now() - 86400000).toISOString()}&fechaFin=${new Date().toISOString()}`,
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      expect(res.statusCode).toBe(200);
      const consumos = res.json();
      expect(consumos.every((c: { instalacionNombre: string }) => !c.instalacionNombre.includes("Ajena"))).toBe(true);
    });

    it("SUPERVISOR con filtro explícito de sede no asignada debe ser rechazado con 403 Forbidden", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/reportes/consumos?instalacionId=${instAjenaId}&fechaInicio=${new Date(Date.now() - 86400000).toISOString()}&fechaFin=${new Date().toISOString()}`,
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("4. Alertas Scoping (GET /api/alertas/incidentes)", () => {
    it("SUPERVISOR debe recibir solo incidentes de sus sedes asignadas", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/alertas/incidentes",
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      expect(res.statusCode).toBe(200);
      const incidentes = res.json();
      expect(incidentes.some((i: { id: string }) => i.id === incAsignadoId)).toBe(true);
      expect(incidentes.some((i: { id: string }) => i.id === incAjenoId)).toBe(false);
    });

    it("SUPERVISOR intentando resolver incidente de sede ajena debe ser rechazado con 403 Forbidden", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/alertas/incidentes/${incAjenoId}/resolver`,
        headers: { authorization: `Bearer ${supervisorToken}` },
        payload: {
          estado: "RESUELTO",
          notasResolucion: "Intento no autorizado",
        },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("5. Mantenimiento Scoping (GET /api/mantenimiento)", () => {
    it("SUPERVISOR debe recibir registros solo de medidores de sedes asignadas", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/mantenimiento",
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      expect(res.statusCode).toBe(200);
      const registros = res.json();
      expect(registros.some((r: { id: string }) => r.id === mantAsignadoId)).toBe(true);
      expect(registros.some((r: { id: string }) => r.id === mantAjenoId)).toBe(false);
    });

    it("SUPERVISOR intentando ver ficha de medidor de sede ajena debe ser rechazado con 403 Forbidden", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/mantenimiento/medidor/${medidorAjenoId}`,
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});

