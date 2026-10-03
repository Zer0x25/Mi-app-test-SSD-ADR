import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { createAlertasController } from "../../../src/modules/alertas/alertas.controller.js";
import {
  AlertasService,
  IAlertasRepository,
  IncidenteEntity,
  ReglaEntity,
  MedidorParaEvaluacion,
} from "../../../src/modules/alertas/alertas.service.js";

class MockAlertasRepository implements IAlertasRepository {
  public reglas: ReglaEntity[] = [];
  public incidentes: IncidenteEntity[] = [];
  public medidores: MedidorParaEvaluacion[] = [];

  async getReglasActivas(): Promise<ReglaEntity[]> {
    return this.reglas;
  }
  async getMedidoresParaEvaluacion(): Promise<MedidorParaEvaluacion[]> {
    return this.medidores;
  }
  async findIncidentesAbiertos(): Promise<IncidenteEntity[]> {
    return this.incidentes.filter((i) => i.estado !== "RESUELTO");
  }
  async createIncidente(data: Omit<IncidenteEntity, "id" | "createdAt" | "updatedAt">): Promise<IncidenteEntity> {
    const inc: IncidenteEntity = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.incidentes.push(inc);
    return inc;
  }
  async findIncidenteById(id: string): Promise<IncidenteEntity | null> {
    return this.incidentes.find((i) => i.id === id) || null;
  }
  async updateIncidente(id: string, data: Partial<IncidenteEntity>): Promise<IncidenteEntity> {
    const idx = this.incidentes.findIndex((i) => i.id === id);
    this.incidentes[idx] = { ...this.incidentes[idx], ...data, updatedAt: new Date() };
    return this.incidentes[idx];
  }
  async listIncidentes(): Promise<IncidenteEntity[]> {
    return this.incidentes;
  }
  async createRegla(data: Omit<ReglaEntity, "id" | "createdAt" | "updatedAt">): Promise<ReglaEntity> {
    const regla: ReglaEntity = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.reglas.push(regla);
    return regla;
  }
  async listReglas(): Promise<ReglaEntity[]> {
    return this.reglas;
  }
}

describe("AlertasController HTTP Integration Suite", () => {
  let app: FastifyInstance;
  let repo: MockAlertasRepository;
  let service: AlertasService;

  const instId = crypto.randomUUID();
  const medidorId = crypto.randomUUID();

  beforeEach(async () => {
    repo = new MockAlertasRepository();
    service = new AlertasService(repo);

    app = Fastify();
    await app.register(createAlertasController(service), { prefix: "/api" });
    await app.ready();
  });

  describe("GET /api/alertas/incidentes", () => {
    it("debe retornar 200 con el listado de incidentes", async () => {
      repo.incidentes = [
        {
          id: crypto.randomUUID(),
          medidorId,
          medidorCodigo: "MED-AG-01",
          instalacionId: instId,
          tipo: "SIN_REPORTE",
          severidad: "WARNING",
          mensaje: "Medidor sin reporte",
          estado: "ABIERTO",
          fechaDeteccion: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const res = await app.inject({
        method: "GET",
        url: "/api/alertas/incidentes",
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data).toHaveLength(1);
      expect(data[0].tipo).toBe("SIN_REPORTE");
    });
  });

  describe("POST /api/alertas/incidentes/:id/resolver", () => {
    it("debe resolver el incidente y retornar 200", async () => {
      const incId = crypto.randomUUID();
      repo.incidentes = [
        {
          id: incId,
          medidorId,
          medidorCodigo: "MED-AG-01",
          instalacionId: instId,
          tipo: "SIN_REPORTE",
          severidad: "WARNING",
          mensaje: "Medidor sin reporte",
          estado: "ABIERTO",
          fechaDeteccion: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const res = await app.inject({
        method: "POST",
        url: `/api/alertas/incidentes/${incId}/resolver`,
        payload: {
          estado: "RESUELTO",
          notasResolucion: "Batería reemplazada por operador",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.estado).toBe("RESUELTO");
      expect(data.notasResolucion).toBe("Batería reemplazada por operador");
    });

    it("debe retornar 404 si el incidente no existe", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/alertas/incidentes/${crypto.randomUUID()}/resolver`,
        payload: {
          estado: "RESUELTO",
          notasResolucion: "Notas cualquiera",
        },
      });

      expect(res.statusCode).toBe(404);
      const data = JSON.parse(res.body);
      expect(data.error).toBe("INCIDENTE_NOT_FOUND");
    });
  });

  describe("POST /api/alertas/evaluar", () => {
    it("debe ejecutar evaluación y retornar 200 con el conteo de incidentes detectados", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/alertas/evaluar",
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.evaluados).toBe(true);
      expect(data.totalNuevos).toBeDefined();
    });
  });

  describe("GET /api/alertas/resumen", () => {
    it("debe retornar métricas consolidadas de incidentes", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/alertas/resumen",
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.totalAbiertos).toBeDefined();
      expect(data.totalCriticos).toBeDefined();
      expect(data.totalAdvertencias).toBeDefined();
    });
  });
});
