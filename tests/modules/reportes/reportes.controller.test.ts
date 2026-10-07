import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { createReportesController } from "../../../src/modules/reportes/reportes.controller.js";
import {
  ReportesService,
  IReportesRepository,
  ReporteRawItem,
  FacturaEntity,
} from "../../../src/modules/reportes/reportes.service.js";

class MockReportesRepository implements IReportesRepository {
  public rawItems: ReporteRawItem[] = [];
  public facturas: FacturaEntity[] = [];

  async getReporteRawData(): Promise<ReporteRawItem[]> {
    return this.rawItems;
  }

  async getRecargas(): Promise<{ medidorId: string; volumen: number; fecha: Date }[]> {
    return [];
  }

  async createFactura(data: Omit<FacturaEntity, "id" | "createdAt" | "updatedAt">): Promise<FacturaEntity> {
    const factura: FacturaEntity = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.facturas.push(factura);
    return factura;
  }

  async listFacturas(): Promise<FacturaEntity[]> {
    return this.facturas;
  }
}

describe("ReportesController HTTP Integration Suite", () => {
  let app: FastifyInstance;
  let repo: MockReportesRepository;
  let service: ReportesService;

  const instId = crypto.randomUUID();
  const medidorId = crypto.randomUUID();

  beforeEach(async () => {
    repo = new MockReportesRepository();
    service = new ReportesService(repo);

    app = Fastify();
    await app.register(createReportesController(service), { prefix: "/api" });
    await app.ready();
  });

  describe("GET /api/reportes/consumos", () => {
    it("debe retornar 200 y el listado de consumos consolidados", async () => {
      repo.rawItems = [
        {
          medidorId,
          medidorCodigo: "MED-AG-01",
          instalacionId: instId,
          instalacionNombre: "Planta Norte",
          recurso: "AGUA",
          unidad: "M3",
          tipoMedicion: "ACUMULATIVO",
          lecturas: [
            { valor: 100.0, fechaLectura: new Date("2026-09-01T00:00:00Z") },
            { valor: 180.0, fechaLectura: new Date("2026-09-30T00:00:00Z") },
          ],
        },
      ];

      const res = await app.inject({
        method: "GET",
        url: "/api/reportes/consumos?fechaInicio=2026-09-01&fechaFin=2026-09-30",
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data).toHaveLength(1);
      expect(data[0].consumoNeto).toBe(80.0);
    });

    it("debe retornar 400 si faltan fechas requeridas", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/reportes/consumos",
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/reportes/consumos/exportar-csv", () => {
    it("debe retornar 200 con cabecera text/csv y contenido formateado", async () => {
      repo.rawItems = [
        {
          medidorId,
          medidorCodigo: "MED-LUZ-01",
          instalacionId: instId,
          instalacionNombre: "Planta Norte",
          recurso: "LUZ",
          unidad: "KWH",
          tipoMedicion: "ACUMULATIVO",
          lecturas: [
            { valor: 5000.0, fechaLectura: new Date("2026-09-01T00:00:00Z") },
            { valor: 5500.0, fechaLectura: new Date("2026-09-30T00:00:00Z") },
          ],
        },
      ];

      const res = await app.inject({
        method: "GET",
        url: "/api/reportes/consumos/exportar-csv?fechaInicio=2026-09-01&fechaFin=2026-09-30",
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toContain("attachment; filename=");
      expect(res.body).toContain("Sede,Medidor,TipoRecurso,Unidad,LecturaInicial,LecturaFinal,ConsumoNeto,FechaInicio,FechaFin");
      expect(res.body).toContain('"Planta Norte",MED-LUZ-01,LUZ,KWH,5000,5500,500');
    });
  });

  describe("POST /api/reportes/facturas", () => {
    it("debe registrar una factura y retornar 201 Created con el cálculo de conciliación", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/reportes/facturas",
        payload: {
          instalacionId: instId,
          recurso: "AGUA",
          numeroFactura: "FAC-00129",
          periodoInicio: "2026-08-01T00:00:00.000Z",
          periodoFin: "2026-08-31T23:59:59.000Z",
          consumoFacturado: 150.0,
          unidad: "M3",
          montoTotal: 180000,
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.id).toBeDefined();
      expect(data.consumoFacturado).toBe(150.0);
      expect(data.estadoConciliacion).toBeDefined();
    });

    it("debe retornar 400 si los datos son inválidos", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/reportes/facturas",
        payload: {
          recurso: "AGUA",
        },
      });

      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/reportes/facturas", () => {
    it("debe retornar 200 con el listado de facturas", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/reportes/facturas",
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(Array.isArray(data)).toBe(true);
    });
  });
});
