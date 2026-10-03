import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { createLecturasController } from "../../../src/modules/lecturas/lecturas.controller.js";
import {
  LecturasService,
  ILecturasRepository,
  LecturaEntity,
  IMedidorInfoService,
  IOperadorAccessService,
} from "../../../src/modules/lecturas/lecturas.service.js";

class MockLecturasRepo implements ILecturasRepository {
  public lecturas: LecturaEntity[] = [];

  async findByMedidorAndFecha(medidorId: string, fechaLectura: Date): Promise<LecturaEntity | null> {
    return (
      this.lecturas.find(
        (l) => l.medidorId === medidorId && l.fechaLectura.getTime() === fechaLectura.getTime()
      ) || null
    );
  }

  async findUltimaLectura(medidorId: string): Promise<LecturaEntity | null> {
    const list = this.lecturas
      .filter((l) => l.medidorId === medidorId)
      .sort((a, b) => b.fechaLectura.getTime() - a.fechaLectura.getTime());
    return list[0] || null;
  }

  async create(data: Omit<LecturaEntity, "id" | "createdAt">): Promise<LecturaEntity> {
    const item: LecturaEntity = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
    };
    this.lecturas.push(item);
    return item;
  }

  async listByMedidor(medidorId: string): Promise<LecturaEntity[]> {
    return this.lecturas
      .filter((l) => l.medidorId === medidorId)
      .sort((a, b) => b.fechaLectura.getTime() - a.fechaLectura.getTime());
  }
}

describe("LecturasController HTTP Integration Suite", () => {
  let app: FastifyInstance;
  let repo: MockLecturasRepo;
  let service: LecturasService;

  const instalacionId = crypto.randomUUID();
  const operadorAutorizadoId = crypto.randomUUID();
  const medidorId = crypto.randomUUID();

  beforeEach(async () => {
    app = Fastify();
    repo = new MockLecturasRepo();

    const medidorService: IMedidorInfoService = {
      async getMedidorInfo(id: string) {
        if (id === medidorId) {
          return {
            id,
            instalacionId,
            activo: true,
            tipoMedicion: "ACUMULATIVO",
          };
        }
        return null;
      },
    };

    const accessService: IOperadorAccessService = {
      async isOperadorAssigned(opId: string, instId: string) {
        return opId === operadorAutorizadoId && instId === instalacionId;
      },
    };

    service = new LecturasService(repo, medidorService, accessService);

    await app.register(createLecturasController(service), { prefix: "/api" });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("POST /api/lecturas debe retornar 201 Created cuando es válida", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/lecturas",
      payload: {
        medidorId,
        operadorId: operadorAutorizadoId,
        valor: 1500,
        notas: "Lectura normal de turno mañana",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.valor).toBe(1500);
  });

  it("POST /api/lecturas debe retornar 403 Forbidden si el operador no está asignado", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/lecturas",
      payload: {
        medidorId,
        operadorId: crypto.randomUUID(), // no asignado
        valor: 1600,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("OPERADOR_NO_AUTORIZADO");
  });

  it("POST /api/lecturas debe retornar 422 si la lectura es decreciente en acumulativo", async () => {
    const t1 = new Date(Date.now() - 5000);
    const t2 = new Date();

    await app.inject({
      method: "POST",
      url: "/api/lecturas",
      payload: {
        medidorId,
        operadorId: operadorAutorizadoId,
        valor: 2000,
        fechaLectura: t1,
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/lecturas",
      payload: {
        medidorId,
        operadorId: operadorAutorizadoId,
        valor: 1900, // Menor que 2000
        fechaLectura: t2,
      },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("LECTURA_DECRECIENTE_PROHIBIDA");
  });

  it("GET /api/medidores/:medidorId/lecturas debe retornar historial", async () => {
    await app.inject({
      method: "POST",
      url: "/api/lecturas",
      payload: {
        medidorId,
        operadorId: operadorAutorizadoId,
        valor: 3000,
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/medidores/${medidorId}/lecturas`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(1);
    expect(res.json()[0].valor).toBe(3000);
  });

  it("GET /api/medidores/:medidorId/lecturas/ultima debe retornar la última lectura", async () => {
    await app.inject({
      method: "POST",
      url: "/api/lecturas",
      payload: {
        medidorId,
        operadorId: operadorAutorizadoId,
        valor: 3500,
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/medidores/${medidorId}/lecturas/ultima`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().valor).toBe(3500);
  });

  describe("POST /api/lecturas/batch-sync", () => {
    it("debe retornar 200 OK y reportar resultados cuando el lote es procesado", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/lecturas/batch-sync",
        payload: {
          lecturas: [
            {
              localId: "sync-1",
              medidorId,
              operadorId: operadorAutorizadoId,
              valor: 4000,
            },
            {
              localId: "sync-2",
              medidorId,
              operadorId: crypto.randomUUID(), // Operador no autorizado
              valor: 4500,
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.total).toBe(2);
      expect(data.syncedCount).toBe(1);
      expect(data.rejectedCount).toBe(1);

      const r1 = data.results.find((r: { localId: string }) => r.localId === "sync-1");
      expect(r1.status).toBe("SYNCED");
      expect(r1.lectura.valor).toBe(4000);

      const r2 = data.results.find((r: { localId: string }) => r.localId === "sync-2");
      expect(r2.status).toBe("REJECTED");
      expect(r2.error.code).toBe("OPERADOR_NO_AUTORIZADO");
    });
  });
});
