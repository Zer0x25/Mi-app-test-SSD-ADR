import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { createAuditoriaController } from "../../../src/modules/auditoria/auditoria.controller.js";
import {
  AuditoriaService,
  IAuditoriaRepository,
  AuditoriaEntity,
} from "../../../src/modules/auditoria/auditoria.service.js";

class MockAuditoriaRepository implements IAuditoriaRepository {
  public eventos: AuditoriaEntity[] = [];

  async create(data: Omit<AuditoriaEntity, "id" | "createdAt">): Promise<AuditoriaEntity> {
    const e: AuditoriaEntity = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
    };
    this.eventos.push(e);
    return e;
  }

  async list(filtro?: { accion?: string; entidad?: string }): Promise<AuditoriaEntity[]> {
    return this.eventos.filter((e) => {
      if (filtro?.accion && e.accion !== filtro.accion) return false;
      if (filtro?.entidad && e.entidad !== filtro.entidad) return false;
      return true;
    });
  }
}

describe("AuditoriaController HTTP Integration Suite", () => {
  let app: FastifyInstance;
  let repo: MockAuditoriaRepository;
  let service: AuditoriaService;

  beforeEach(async () => {
    repo = new MockAuditoriaRepository();
    service = new AuditoriaService(repo);

    // Pre-poblar eventos
    await repo.create({
      usuarioId: "11111111-2222-3333-4444-555555555555",
      accion: "CAMBIO_ROL",
      entidad: "USUARIO",
      entidadId: "user-1",
      detalles: JSON.stringify({ rolNuevo: "SUPERVISOR" }),
      ip: "127.0.0.1",
    });

    await repo.create({
      usuarioId: "11111111-2222-3333-4444-555555555555",
      accion: "BAJA_MEDIDOR",
      entidad: "MEDIDOR",
      entidadId: "med-1",
      detalles: JSON.stringify({ motivo: "Dañado" }),
      ip: "127.0.0.1",
    });

    app = Fastify();

    // Hook simulador de autenticación / RBAC según encabezado test-role
    app.addHook("preHandler", async (req, reply) => {
      if (!req.url.startsWith("/api/auditoria")) return;

      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "Cabecera Authorization requerida.",
        });
      }

      const role = req.headers["test-role"] as string | undefined;
      if (!role) {
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "Token inválido.",
        });
      }

      if (role !== "ADMIN") {
        return reply.status(403).send({
          error: "ACCESO_DENEGADO",
          message: `Acceso denegado: el rol «${role}» no tiene permisos para consultar auditoría.`,
        });
      }

      (req as unknown as { user: { rol: string; userId: string } }).user = {
        rol: role,
        userId: "admin-id",
      };
    });

    await app.register(createAuditoriaController(service), { prefix: "/api" });
    await app.ready();
  });

  it("GET /api/auditoria sin token debe retornar 401 Unauthorized", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auditoria",
    });

    expect(res.statusCode).toBe(401);
  });

  it("GET /api/auditoria con rol OPERADOR debe retornar 403 Forbidden", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auditoria",
      headers: {
        authorization: "Bearer dummy-token",
        "test-role": "OPERADOR",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("ACCESO_DENEGADO");
  });

  it("GET /api/auditoria con rol SUPERVISOR debe retornar 403 Forbidden", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auditoria",
      headers: {
        authorization: "Bearer dummy-token",
        "test-role": "SUPERVISOR",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("GET /api/auditoria con rol ADMIN debe retornar 200 con la lista de eventos", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auditoria",
      headers: {
        authorization: "Bearer admin-token",
        "test-role": "ADMIN",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0].accion).toBeDefined();
    expect(body[0].entidad).toBeDefined();
  });

  it("GET /api/auditoria?accion=BAJA_MEDIDOR debe filtrar los resultados", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auditoria?accion=BAJA_MEDIDOR",
      headers: {
        authorization: "Bearer admin-token",
        "test-role": "ADMIN",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.length).toBe(1);
    expect(body[0].accion).toBe("BAJA_MEDIDOR");
    expect(body[0].entidad).toBe("MEDIDOR");
  });
});
