import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { createMedidoresController } from "../../../src/modules/medidores/medidores.controller.js";
import {
  MedidoresService,
  IMedidoresRepository,
  TipoMedidorEntity,
  MedidorEntity,
  IInstalacionesVerificationService,
} from "../../../src/modules/medidores/medidores.service.js";
import {
  InstalacionNotFoundError,
  InstalacionInactivaError,
} from "../../../src/modules/medidores/medidores.schema.js";

class MockMedidoresRepo implements IMedidoresRepository {
  public tipos: TipoMedidorEntity[] = [];
  public medidores: MedidorEntity[] = [];

  async findTipoById(id: string): Promise<TipoMedidorEntity | null> {
    return this.tipos.find((t) => t.id === id) || null;
  }

  async findTipoByNombre(nombre: string): Promise<TipoMedidorEntity | null> {
    const norm = nombre.trim().toLowerCase();
    return this.tipos.find((t) => t.nombre.trim().toLowerCase() === norm) || null;
  }

  async createTipo(
    data: Omit<TipoMedidorEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<TipoMedidorEntity> {
    const item: TipoMedidorEntity = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tipos.push(item);
    return item;
  }

  async listTiposActivos(): Promise<TipoMedidorEntity[]> {
    return this.tipos.filter((t) => t.activo);
  }

  async findMedidorById(id: string): Promise<MedidorEntity | null> {
    return this.medidores.find((m) => m.id === id) || null;
  }

  async findMedidorByCodigo(codigo: string): Promise<MedidorEntity | null> {
    const norm = codigo.trim().toLowerCase();
    return this.medidores.find((m) => m.codigo.trim().toLowerCase() === norm) || null;
  }

  async createMedidor(
    data: Omit<MedidorEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<MedidorEntity> {
    const item: MedidorEntity = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.medidores.push(item);
    return item;
  }

  async updateMedidor(id: string, data: Partial<MedidorEntity>): Promise<MedidorEntity> {
    const idx = this.medidores.findIndex((m) => m.id === id);
    const updated = { ...this.medidores[idx], ...data, updatedAt: new Date() };
    this.medidores[idx] = updated;
    return updated;
  }

  async listMedidoresByInstalacion(instalacionId: string): Promise<MedidorEntity[]> {
    return this.medidores.filter((m) => m.instalacionId === instalacionId && m.activo);
  }

  async listMedidores(instalacionIds?: string[]): Promise<MedidorEntity[]> {
    if (instalacionIds) {
      return this.medidores.filter((m) => instalacionIds.includes(m.instalacionId) && m.activo);
    }
    return this.medidores.filter((m) => m.activo);
  }
}

class MockInstalacionesVerif implements IInstalacionesVerificationService {
  public activas = new Set<string>();

  async verifyInstalacionActiva(id: string): Promise<void> {
    if (!this.activas.has(id)) {
      if (id === "inactiva") {
        throw new InstalacionInactivaError(id);
      }
      throw new InstalacionNotFoundError(id);
    }
  }
}

describe("MedidoresController HTTP Integration Suite", () => {
  let app: FastifyInstance;
  let repo: MockMedidoresRepo;
  let verif: MockInstalacionesVerif;
  let service: MedidoresService;

  beforeEach(async () => {
    app = Fastify();
    repo = new MockMedidoresRepo();
    verif = new MockInstalacionesVerif();
    service = new MedidoresService(repo, verif);

    await app.register(createMedidoresController(service), { prefix: "/api" });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("POST /api/tipos-medidor debe retornar 201 y 409 si es duplicado", async () => {
    const res1 = await app.inject({
      method: "POST",
      url: "/api/tipos-medidor",
      payload: {
        nombre: "Luz Monofásica",
        recurso: "LUZ",
        unidad: "KWH",
        tipoMedicion: "ACUMULATIVO",
      },
    });

    expect(res1.statusCode).toBe(201);
    const body1 = res1.json();
    expect(body1.id).toBeDefined();

    const res2 = await app.inject({
      method: "POST",
      url: "/api/tipos-medidor",
      payload: {
        nombre: "  luz monofásica  ",
        recurso: "LUZ",
        unidad: "KWH",
        tipoMedicion: "ACUMULATIVO",
      },
    });

    expect(res2.statusCode).toBe(409);
    expect(res2.json().error).toBe("TIPO_MEDIDOR_NOMBRE_DUPLICADO");
  });

  it("GET /api/tipos-medidor debe retornar 200 con la lista", async () => {
    await app.inject({
      method: "POST",
      url: "/api/tipos-medidor",
      payload: {
        nombre: "Agua Pozo",
        recurso: "AGUA",
        unidad: "M3",
        tipoMedicion: "ACUMULATIVO",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/tipos-medidor",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(1);
  });

  it("POST /api/medidores debe registrar un medidor y retornar 201", async () => {
    const instalacionId = crypto.randomUUID();
    verif.activas.add(instalacionId);

    const tipoRes = await app.inject({
      method: "POST",
      url: "/api/tipos-medidor",
      payload: {
        nombre: "Petróleo D1",
        recurso: "PETROLEO",
        unidad: "LITROS",
        tipoMedicion: "NIVEL",
      },
    });
    const tipoMedidorId = tipoRes.json().id;

    const res = await app.inject({
      method: "POST",
      url: "/api/medidores",
      payload: {
        instalacionId,
        tipoMedidorId,
        codigo: "MED-PET-01",
        ubicacionInterna: "Tanque Subterráneo",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.codigo).toBe("MED-PET-01");
    expect(body.tipoMedidor).toBeDefined();
  });

  it("GET /api/instalaciones/:instalacionId/medidores debe listar medidores", async () => {
    const instalacionId = crypto.randomUUID();
    verif.activas.add(instalacionId);

    const tipoRes = await app.inject({
      method: "POST",
      url: "/api/tipos-medidor",
      payload: {
        nombre: "Gas GLP",
        recurso: "GAS",
        unidad: "M3",
        tipoMedicion: "ACUMULATIVO",
      },
    });
    const tipoMedidorId = tipoRes.json().id;

    await app.inject({
      method: "POST",
      url: "/api/medidores",
      payload: {
        instalacionId,
        tipoMedidorId,
        codigo: "MED-GLP-99",
        ubicacionInterna: "Caseta Central",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/instalaciones/${instalacionId}/medidores`,
    });

    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list.length).toBe(1);
    expect(list[0].codigo).toBe("MED-GLP-99");
  });

  it("GET /api/medidores?instalacionId=... debe listar medidores por query param", async () => {
    const instalacionId = crypto.randomUUID();
    verif.activas.add(instalacionId);

    const tipoRes = await app.inject({
      method: "POST",
      url: "/api/tipos-medidor",
      payload: {
        nombre: "Luz Trifásica",
        recurso: "LUZ",
        unidad: "KWH",
        tipoMedicion: "ACUMULATIVO",
      },
    });
    const tipoMedidorId = tipoRes.json().id;

    await app.inject({
      method: "POST",
      url: "/api/medidores",
      payload: {
        instalacionId,
        tipoMedidorId,
        codigo: "MED-TRI-01",
        ubicacionInterna: "Subestación",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/medidores?instalacionId=${instalacionId}`,
    });

    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list.length).toBe(1);
    expect(list[0].codigo).toBe("MED-TRI-01");
  });
});
