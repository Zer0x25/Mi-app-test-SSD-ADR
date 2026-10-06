import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { buildServer } from "../src/server.js";
import { signJwt } from "../src/modules/usuarios/auth.utils.js";
import { config } from "../src/core/config.js";

describe("Suite de Integración HTTP: Edición, Archivado y Periodo de Gracia (feat-022)", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let adminToken: string;
  let operadorToken: string;
  let tipoMedidorId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await buildServer({ prisma, serveStatic: false });
    await app.ready();

    const adminUser = await prisma.usuario.create({
      data: {
        email: `admin-life-${Date.now()}@sistema.test`,
        passwordHash: "hash-fake",
        nombre: "Admin Lifecycle",
        rol: "ADMIN",
        activo: true,
      },
    });

    const operadorUser = await prisma.usuario.create({
      data: {
        email: `operador-life-${Date.now()}@sistema.test`,
        passwordHash: "hash-fake",
        nombre: "Operador Lifecycle",
        rol: "OPERADOR",
        activo: true,
      },
    });

    adminToken = signJwt(
      {
        userId: adminUser.id,
        email: adminUser.email,
        rol: "ADMIN",
        nombre: adminUser.nombre,
      },
      config.JWT_SECRET
    );

    operadorToken = signJwt(
      {
        userId: operadorUser.id,
        email: operadorUser.email,
        rol: "OPERADOR",
        nombre: operadorUser.nombre,
      },
      config.JWT_SECRET
    );

    const tipo = await prisma.tipoMedidor.create({
      data: {
        nombre: `Tipo Life ${Date.now()}`,
        recurso: "LUZ",
        unidad: "KWH",
        tipoMedicion: "ACUMULATIVO",
        activo: true,
      },
    });
    tipoMedidorId = tipo.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe("Instalaciones: Edición, Archivado, Restauración y Eliminación", () => {
    it("debe permitir a ADMIN editar una instalación y archivarla", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/instalaciones",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          nombre: `Instalacion Test ${Date.now()}`,
          codigo: `INS-T1-${Date.now().toString().slice(-4)}`,
          ubicacion: "Ubicacion Inicial",
        },
      });
      expect(createRes.statusCode).toBe(201);
      const inst = JSON.parse(createRes.body);

      // Editar
      const editRes = await app.inject({
        method: "PATCH",
        url: `/api/instalaciones/${inst.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          nombre: `Instalacion Editada ${Date.now()}`,
          ubicacion: "Ubicacion Editada",
        },
      });
      expect(editRes.statusCode).toBe(200);
      const edited = JSON.parse(editRes.body);
      expect(edited.ubicacion).toBe("Ubicacion Editada");

      // Archivar
      const archRes = await app.inject({
        method: "PATCH",
        url: `/api/instalaciones/${inst.id}/archivar`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(archRes.statusCode).toBe(200);
      const archived = JSON.parse(archRes.body);
      expect(archived.activa).toBe(false);

      // Restaurar
      const restRes = await app.inject({
        method: "PATCH",
        url: `/api/instalaciones/${inst.id}/restaurar`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(restRes.statusCode).toBe(200);
      const restored = JSON.parse(restRes.body);
      expect(restored.activa).toBe(true);
    });

    it("debe rechazar a OPERADOR con 403 al intentar editar o archivar una instalación", async () => {
      const inst = await prisma.instalacion.create({
        data: {
          nombre: `Sede Op ${Date.now()}`,
          ubicacion: "Calle Op",
          activa: true,
        },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/instalaciones/${inst.id}`,
        headers: { authorization: `Bearer ${operadorToken}` },
        payload: { nombre: "Intento Hacker" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("debe permitir eliminar físicamente una instalación nueva (<= 30 días) sin medidores", async () => {
      const inst = await prisma.instalacion.create({
        data: {
          nombre: `Sede Borrable ${Date.now()}`,
          ubicacion: "Calle Borrable",
          activa: true,
        },
      });

      const delRes = await app.inject({
        method: "DELETE",
        url: `/api/instalaciones/${inst.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(delRes.statusCode).toBe(200);

      const buscada = await prisma.instalacion.findUnique({ where: { id: inst.id } });
      expect(buscada).toBeNull();
    });
  });

  describe("Medidores: Edición, Archivado, Restauración y Eliminación", () => {
    it("debe permitir a ADMIN editar y archivar un medidor", async () => {
      const inst = await prisma.instalacion.create({
        data: {
          nombre: `Sede Medidor ${Date.now()}`,
          ubicacion: "Calle Med",
          activa: true,
        },
      });

      const medidorRes = await app.inject({
        method: "POST",
        url: "/api/medidores",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          instalacionId: inst.id,
          tipoMedidorId,
          codigo: `MED-INT-${Date.now().toString().slice(-4)}`,
          ubicacionInterna: "Piso 1",
          numeroSerie: "SN-999",
        },
      });
      expect(medidorRes.statusCode).toBe(201);
      const medidor = JSON.parse(medidorRes.body);

      // Editar
      const editRes = await app.inject({
        method: "PATCH",
        url: `/api/medidores/${medidor.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ubicacionInterna: "Piso 2",
          numeroSerie: "SN-1000",
        },
      });
      expect(editRes.statusCode).toBe(200);
      const edited = JSON.parse(editRes.body);
      expect(edited.ubicacionInterna).toBe("Piso 2");

      // Archivar
      const archRes = await app.inject({
        method: "PATCH",
        url: `/api/medidores/${medidor.id}/archivar`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(archRes.statusCode).toBe(200);
      const archived = JSON.parse(archRes.body);
      expect(archived.activo).toBe(false);

      // Restaurar
      const restRes = await app.inject({
        method: "PATCH",
        url: `/api/medidores/${medidor.id}/restaurar`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(restRes.statusCode).toBe(200);
      const restored = JSON.parse(restRes.body);
      expect(restored.activo).toBe(true);
    });

    it("debe rechazar a OPERADOR con 403 al intentar editar o archivar un medidor", async () => {
      const inst = await prisma.instalacion.create({
        data: {
          nombre: `Sede Med Op ${Date.now()}`,
          ubicacion: "Calle Op",
          activa: true,
        },
      });

      const med = await prisma.medidor.create({
        data: {
          instalacionId: inst.id,
          tipoMedidorId,
          codigo: `MED-NOOP-${Date.now().toString().slice(-4)}`,
          ubicacionInterna: "Sector X",
          activo: true,
        },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/medidores/${med.id}`,
        headers: { authorization: `Bearer ${operadorToken}` },
        payload: { ubicacionInterna: "Intento" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("debe rechazar eliminar medidor si ya cuenta con lecturas registradas (422)", async () => {
      const inst = await prisma.instalacion.create({
        data: {
          nombre: `Sede Con Lect ${Date.now()}`,
          ubicacion: "Calle Lect",
          activa: true,
        },
      });

      const med = await prisma.medidor.create({
        data: {
          instalacionId: inst.id,
          tipoMedidorId,
          codigo: `MED-WITHLECT-${Date.now().toString().slice(-4)}`,
          ubicacionInterna: "Sala Lect",
          activo: true,
        },
      });

      await prisma.lectura.create({
        data: {
          medidorId: med.id,
          operadorId: "operador-id-1",
          valor: 150.5,
          fechaLectura: new Date(),
        },
      });

      const delRes = await app.inject({
        method: "DELETE",
        url: `/api/medidores/${med.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(delRes.statusCode).toBe(422);
      const body = JSON.parse(delRes.body);
      expect(body.error).toBe("MEDIDOR_CON_LECTURAS_NO_ELIMINABLE");
    });
  });

  describe("Filtrado por estado (activas / archivadas / todas)", () => {
    it("debe listar instalaciones archivadas con ?estado=archivadas para ADMIN", async () => {
      const instArchivada = await prisma.instalacion.create({
        data: {
          nombre: `Sede Archivada List ${Date.now()}`,
          ubicacion: "Lugar Oculto",
          activa: false,
        },
      });

      // Consulta por defecto: solo activas
      const listDef = await app.inject({
        method: "GET",
        url: "/api/instalaciones",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const itemsDef = JSON.parse(listDef.body) as Array<{ id: string }>;
      expect(itemsDef.some((i) => i.id === instArchivada.id)).toBe(false);

      // Consulta archivadas
      const listArch = await app.inject({
        method: "GET",
        url: "/api/instalaciones?estado=archivadas",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const itemsArch = JSON.parse(listArch.body) as Array<{ id: string }>;
      expect(itemsArch.some((i) => i.id === instArchivada.id)).toBe(true);
    });
  });
});
