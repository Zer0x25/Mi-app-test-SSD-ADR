import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { createInstalacionesController } from "../../../src/modules/instalaciones/instalaciones.controller.js";
import {
  InstalacionesService,
  IInstalacionesRepository,
  InstalacionEntity,
  AsignacionEntity,
} from "../../../src/modules/instalaciones/instalaciones.service.js";

class MockRepository implements IInstalacionesRepository {
  public instalaciones: InstalacionEntity[] = [];
  public asignaciones: AsignacionEntity[] = [];

  async findById(id: string): Promise<InstalacionEntity | null> {
    return this.instalaciones.find((i) => i.id === id) || null;
  }

  async findByNombre(nombre: string): Promise<InstalacionEntity | null> {
    return (
      this.instalaciones.find(
        (i) => i.nombre.toLowerCase() === nombre.trim().toLowerCase()
      ) || null
    );
  }

  async create(
    data: Omit<InstalacionEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<InstalacionEntity> {
    const item: InstalacionEntity = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.instalaciones.push(item);
    return item;
  }

  async update(id: string, data: Partial<InstalacionEntity>): Promise<InstalacionEntity> {
    const idx = this.instalaciones.findIndex((i) => i.id === id);
    const updated = { ...this.instalaciones[idx], ...data, updatedAt: new Date() };
    this.instalaciones[idx] = updated;
    return updated;
  }

  async findAsignacion(
    instalacionId: string,
    usuarioId: string
  ): Promise<AsignacionEntity | null> {
    return (
      this.asignaciones.find(
        (a) => a.instalacionId === instalacionId && a.usuarioId === usuarioId
      ) || null
    );
  }

  async createAsignacion(
    instalacionId: string,
    usuarioId: string
  ): Promise<AsignacionEntity> {
    const item: AsignacionEntity = {
      id: crypto.randomUUID(),
      instalacionId,
      usuarioId,
      createdAt: new Date(),
    };
    this.asignaciones.push(item);
    return item;
  }

  async deleteAsignacion(instalacionId: string, usuarioId: string): Promise<boolean> {
    const prev = this.asignaciones.length;
    this.asignaciones = this.asignaciones.filter(
      (a) => !(a.instalacionId === instalacionId && a.usuarioId === usuarioId)
    );
    return this.asignaciones.length < prev;
  }

  async listInstalacionesByOperador(usuarioId: string): Promise<InstalacionEntity[]> {
    const ids = this.asignaciones
      .filter((a) => a.usuarioId === usuarioId)
      .map((a) => a.instalacionId);
    return this.instalaciones.filter((i) => ids.includes(i.id) && i.activa);
  }
}

describe("InstalacionesController HTTP Integration Suite", () => {
  let app: FastifyInstance;
  let service: InstalacionesService;

  beforeEach(async () => {
    app = Fastify();
    service = new InstalacionesService(new MockRepository());
    await app.register(createInstalacionesController(service), { prefix: "/api" });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("POST /api/instalaciones debe retornar 201 Created", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/instalaciones",
      payload: {
        nombre: "Sede Corporativa",
        ubicacion: "Av. Las Condes 500",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.id).toBeDefined();
    expect(body.nombre).toBe("Sede Corporativa");
    expect(body.activa).toBe(true);
  });

  it("POST /api/instalaciones con nombre duplicado debe retornar 409 Conflict", async () => {
    await app.inject({
      method: "POST",
      url: "/api/instalaciones",
      payload: {
        nombre: "Sede Norte",
        ubicacion: "Av. Norte 123",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/instalaciones",
      payload: {
        nombre: "  sede norte  ",
        ubicacion: "Otra ubicación",
      },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json();
    expect(body.error).toBe("INSTALACION_NOMBRE_DUPLICADO");
  });

  it("GET /api/instalaciones/:id debe retornar 200 y 404 para ID inexistente", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/instalaciones",
      payload: {
        nombre: "Edificio B",
        ubicacion: "Calle Los Pinos 40",
      },
    });
    const id = created.json().id;

    const resOk = await app.inject({
      method: "GET",
      url: `/api/instalaciones/${id}`,
    });
    expect(resOk.statusCode).toBe(200);

    const resNotFound = await app.inject({
      method: "GET",
      url: `/api/instalaciones/${crypto.randomUUID()}`,
    });
    expect(resNotFound.statusCode).toBe(404);
    expect(resNotFound.json().error).toBe("INSTALACION_NOT_FOUND");
  });

  it("POST /api/instalaciones/:id/operadores debe asignar operador y retornar 201", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/instalaciones",
      payload: {
        nombre: "Planta Solar",
        ubicacion: "Desierto Atacama",
      },
    });
    const instalacionId = created.json().id;
    const usuarioId = crypto.randomUUID();

    const response = await app.inject({
      method: "POST",
      url: `/api/instalaciones/${instalacionId}/operadores`,
      payload: { usuarioId },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.instalacionId).toBe(instalacionId);
    expect(body.usuarioId).toBe(usuarioId);
  });

  it("GET /api/operadores/:usuarioId/instalaciones retorna solo las asignadas activas", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/instalaciones",
      payload: {
        nombre: "Planta Hidro",
        ubicacion: "Río Biobío",
      },
    });
    const instalacionId = created.json().id;
    const usuarioId = crypto.randomUUID();

    await app.inject({
      method: "POST",
      url: `/api/instalaciones/${instalacionId}/operadores`,
      payload: { usuarioId },
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/operadores/${usuarioId}/instalaciones`,
    });

    expect(response.statusCode).toBe(200);
    const list = response.json();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(instalacionId);

    // DELETE /api/instalaciones/:id/operadores/:usuarioId (desasignar operador)
    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/instalaciones/${instalacionId}/operadores/${usuarioId}`,
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().success).toBe(true);

    // Read-After-Write verification: comprobar vía GET que ya no figura asignada
    const verifyRes = await app.inject({
      method: "GET",
      url: `/api/operadores/${usuarioId}/instalaciones`,
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().length).toBe(0);
  });
});
