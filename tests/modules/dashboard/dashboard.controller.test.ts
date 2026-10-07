import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { createDashboardController } from "../../../src/modules/dashboard/dashboard.controller.js";
import {
  DashboardService,
  IDashboardRepository,
  DashboardRawData,
} from "../../../src/modules/dashboard/dashboard.service.js";

class MockDashboardRepo implements IDashboardRepository {
  public data: DashboardRawData = {
    instalaciones: [
      { id: "inst-1", nombre: "Planta Modelo", activa: true },
    ],
    medidores: [
      {
        id: "med-1",
        codigo: "MED-AG-01",
        instalacionId: "inst-1",
        instalacionNombre: "Planta Modelo",
        ubicacionInterna: "Sala Bombas",
        recurso: "AGUA",
        unidad: "M3",
        tipoMedicion: "ACUMULATIVO",
        activo: true,
      },
    ],
    lecturas: [
      {
        id: "lec-1",
        medidorId: "med-1",
        valor: 100,
        fechaLectura: new Date(Date.now() - 3600 * 1000),
        operadorId: "op-1",
        notas: "Lectura matutina",
      },
      {
        id: "lec-2",
        medidorId: "med-1",
        valor: 150,
        fechaLectura: new Date(),
        operadorId: "op-1",
        notas: "Lectura tarde",
      },
    ],
    recargas: [],
  };

  async getDashboardData(): Promise<DashboardRawData> {
    return this.data;
  }
}

describe("DashboardController HTTP Integration Suite", () => {
  let app: FastifyInstance;
  let service: DashboardService;

  beforeEach(async () => {
    app = Fastify();
    service = new DashboardService(new MockDashboardRepo());

    await app.register(createDashboardController(service), { prefix: "/api" });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/dashboard/kpis debe retornar 200 con el resumen de métricas", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/kpis",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalInstalaciones).toBe(1);
    expect(body.totalMedidores).toBe(1);
    expect(body.totalLecturas).toBe(2);
    expect(body.medidoresPorRecurso).toEqual({ AGUA: 1 });
  });

  it("GET /api/dashboard/desatendidos debe responder 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/desatendidos?horas=24",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/dashboard/consumos debe responder 200 con el consumo neto", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/consumos",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.length).toBe(1);
    expect(body[0].consumoNeto).toBe(50);
  });

  it("GET /api/dashboard/actividad-reciente debe responder 200 con las lecturas", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/actividad-reciente?limit=5",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.length).toBe(2);
    expect(body[0].medidorCodigo).toBe("MED-AG-01");
  });
});
