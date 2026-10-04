import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { buildServer } from "../../src/server.js";
import { signJwt } from "../../src/modules/usuarios/auth.utils.js";
import { config } from "../../src/core/config.js";
import fs from "node:fs";
import path from "node:path";

describe("Suite Anti-Regresión y Edge Cases (test-002)", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let adminToken: string;
  let supervisorToken: string;
  let operadorToken: string;
  let adminUserId: string;
  let operadorUserId: string;
  let testMedidorId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await buildServer({ prisma, serveStatic: false });
    await app.ready();

    // 1. Asegurar usuario ADMIN
    const adminUser = await prisma.usuario.upsert({
      where: { email: "admin-edge@medidores.cl" },
      update: { rol: "ADMIN" },
      create: {
        email: "admin-edge@medidores.cl",
        passwordHash: "hash-fake",
        nombre: "Admin Edge",
        rol: "ADMIN",
      },
    });
    adminUserId = adminUser.id;

    // 2. Asegurar usuario SUPERVISOR
    const supervisorUser = await prisma.usuario.upsert({
      where: { email: "supervisor-edge@medidores.cl" },
      update: { rol: "SUPERVISOR" },
      create: {
        email: "supervisor-edge@medidores.cl",
        passwordHash: "hash-fake",
        nombre: "Supervisor Edge",
        rol: "SUPERVISOR",
      },
    });

    // 3. Asegurar usuario OPERADOR
    const operadorUser = await prisma.usuario.upsert({
      where: { email: "operador-edge@medidores.cl" },
      update: { rol: "OPERADOR" },
      create: {
        email: "operador-edge@medidores.cl",
        passwordHash: "hash-fake",
        nombre: "Operador Edge",
        rol: "OPERADOR",
      },
    });
    operadorUserId = operadorUser.id;

    // 4. Asegurar instalación y asignación del operador
    let instalacion = await prisma.instalacion.findFirst();
    if (!instalacion) {
      instalacion = await prisma.instalacion.create({
        data: {
          nombre: "Instalación Edge",
          ubicacion: "Av. Edge 123",
          activa: true,
        },
      });
    }

    // Asignar operador a la instalación para que pueda registrar lecturas
    await prisma.asignacionOperador.upsert({
      where: {
        instalacionId_usuarioId: {
          instalacionId: instalacion.id,
          usuarioId: operadorUserId,
        },
      },
      update: {},
      create: {
        usuarioId: operadorUserId,
        instalacionId: instalacion.id,
      },
    });

    // 5. Asegurar tipo de medidor y medidor
    let tipo = await prisma.tipoMedidor.findFirst();
    if (!tipo) {
      tipo = await prisma.tipoMedidor.create({
        data: {
          nombre: "Edge Agua",
          recurso: "AGUA",
          unidad: "M3",
          tipoMedicion: "ACUMULATIVO",
          activo: true,
        },
      });
    }

    let medidor = await prisma.medidor.findFirst({
      where: { instalacionId: instalacion.id, activo: true },
    });
    if (!medidor) {
      medidor = await prisma.medidor.create({
        data: {
          codigo: `MED-EDGE-${Date.now()}`,
          numeroSerie: `SN-${Date.now()}`,
          ubicacionInterna: "Sala de Bombas Edge",
          instalacionId: instalacion.id,
          tipoMedidorId: tipo.id,
          activo: true,
        },
      });
    }
    testMedidorId = medidor.id;

    // Crear tokens JWT
    adminToken = signJwt(
      {
        userId: adminUserId,
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
        userId: operadorUserId,
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

  describe("1. Validaciones Zod Estrictas en Endpoints", () => {
    it("GET /api/lecturas/recientes debe rechazar limit negativo con 400 Bad Request", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/lecturas/recientes?limit=-5",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBeDefined();
    });

    it("GET /api/lecturas/recientes debe rechazar limit excesivo (>1000) con 400 Bad Request", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/lecturas/recientes?limit=1500",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBeDefined();
    });

    it("GET /api/lecturas/recientes debe rechazar limit no numérico con 400 Bad Request", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/lecturas/recientes?limit=palabra_invalida",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBeDefined();
    });
  });

  describe("2. Invariantes de Dominio en Lecturas", () => {
    it("POST /api/lecturas debe retornar 404 MedidorNotFoundError si el medidor no existe", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/lecturas",
        headers: { authorization: `Bearer ${operadorToken}` },
        payload: {
          medidorId: "00000000-0000-0000-0000-000000000000",
          operadorId: operadorUserId,
          valor: 500,
          notas: "Lectura medidor inexistente",
        },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error).toBe("MEDIDOR_NOT_FOUND");
    });

    it("POST /api/lecturas debe retornar 422 LecturaDecrecienteError ante lectura inferior a la última registrada", async () => {
      // 1. Obtener última lectura del medidor
      const ultimaLectura = await prisma.lectura.findFirst({
        where: { medidorId: testMedidorId },
        orderBy: { fechaLectura: "desc" },
      });
      const baseValor = ultimaLectura ? ultimaLectura.valor : 100;

      // 2. Registrar una lectura creciente válida
      const valorValido = baseValor + 50;
      const resValido = await app.inject({
        method: "POST",
        url: "/api/lecturas",
        headers: { authorization: `Bearer ${operadorToken}` },
        payload: {
          medidorId: testMedidorId,
          operadorId: operadorUserId,
          valor: valorValido,
          notas: "Lectura base creciente",
        },
      });
      expect(resValido.statusCode).toBe(201);

      // 3. Intentar registrar una lectura decreciente
      const resDecreciente = await app.inject({
        method: "POST",
        url: "/api/lecturas",
        headers: { authorization: `Bearer ${operadorToken}` },
        payload: {
          medidorId: testMedidorId,
          operadorId: operadorUserId,
          valor: valorValido - 10,
          notas: "Intento lectura decreciente",
        },
      });

      expect(resDecreciente.statusCode).toBe(422);
      const bodyDecreciente = resDecreciente.json();
      expect(bodyDecreciente.error).toBe("LECTURA_DECRECIENTE_PROHIBIDA");
    });
  });

  describe("3. Tolerancia a Fallos Parciales en Lote (batch-sync)", () => {
    it("POST /api/lecturas/batch-sync debe procesar registros válidos y aislar los inválidos", async () => {
      const ultimaLectura = await prisma.lectura.findFirst({
        where: { medidorId: testMedidorId },
        orderBy: { fechaLectura: "desc" },
      });
      const base = ultimaLectura ? ultimaLectura.valor : 150;

      const batchPayload = {
        lecturas: [
          {
            localId: "batch-item-1",
            medidorId: testMedidorId,
            operadorId: operadorUserId,
            valor: base + 10,
            notas: "Sync item 1 válido",
          },
          {
            localId: "batch-item-2",
            medidorId: testMedidorId,
            operadorId: operadorUserId,
            valor: base - 5, // Inválido: decreciente
            notas: "Sync item 2 decreciente",
          },
          {
            localId: "batch-item-3",
            medidorId: testMedidorId,
            operadorId: operadorUserId,
            valor: base + 20,
            notas: "Sync item 3 válido",
          },
        ],
      };

      const res = await app.inject({
        method: "POST",
        url: "/api/lecturas/batch-sync",
        headers: { authorization: `Bearer ${operadorToken}` },
        payload: batchPayload,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(3);
      expect(body.syncedCount).toBe(2);
      expect(body.rejectedCount).toBe(1);
      expect(Array.isArray(body.results)).toBe(true);

      const item1 = body.results.find((r: { localId: string }) => r.localId === "batch-item-1");
      expect(item1.status).toBe("SYNCED");

      const item2 = body.results.find((r: { localId: string }) => r.localId === "batch-item-2");
      expect(item2.status).toBe("REJECTED");
      expect(item2.error).toBeDefined();

      const item3 = body.results.find((r: { localId: string }) => r.localId === "batch-item-3");
      expect(item3.status).toBe("SYNCED");
    });
  });

  describe("4. Respaldo en Caliente Atómico y Pistas de Auditoría", () => {
    it("POST /api/admin/backup debe rechazar a SUPERVISOR con 403 Forbidden", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/backup",
        headers: { authorization: `Bearer ${supervisorToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("POST /api/admin/backup debe permitir a ADMIN y registrar evento BACKUP_SISTEMA en auditoría", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/backup",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("ok");
      expect(body.archivo).toMatch(/\.db$/);
      expect(body.tamanoBytes).toBeGreaterThan(0);

      // Verificar que el archivo existe físicamente en el directorio de backups
      const backupPath = path.join(process.cwd(), "backups", body.archivo);
      expect(fs.existsSync(backupPath)).toBe(true);

      // Limpiar archivo temporal de backup de prueba
      try {
        fs.unlinkSync(backupPath);
      } catch {
        // Ignorar si no se pudo eliminar de inmediato
      }

      // Verificar que se registró el evento inmutable en AuditoriaEvento
      const evento = await prisma.auditoriaEvento.findFirst({
        where: {
          accion: "BACKUP_SISTEMA",
        },
        orderBy: { createdAt: "desc" },
      });

      expect(evento).not.toBeNull();
      expect(evento?.entidad).toBe("SISTEMA");
      expect(evento?.usuarioId).toBe(adminUserId);
    });
  });

  describe("5. Protección Perimetral y Exención E2E", () => {
    it("POST /api/auth/login con cabecera x-e2e-client no debe ser bloqueado por Rate Limiting", async () => {
      for (let i = 0; i < 7; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: {
            "x-e2e-client": "playwright",
          },
          payload: {
            email: "admin@medidores.cl",
            password: "PasswordInvalido123!",
          },
        });
        // Debe ser 401 Unauthorized por clave incorrecta, NO 429 Too Many Requests
        expect(res.statusCode).toBe(401);
      }
    });

    it("Las respuestas deben incluir cabeceras de endurecimiento HTTP Helmet y CSP permisiva para PWA", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/healthz",
      });

      expect(res.statusCode).toBe(200);
      const headers = res.headers;
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["x-frame-options"]).toBe("SAMEORIGIN");

      const csp = headers["content-security-policy"] as string;
      expect(csp).toBeDefined();
      expect(csp).toContain("script-src-attr 'unsafe-inline'");
      expect(csp).toContain("connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com");
    });
  });
});
