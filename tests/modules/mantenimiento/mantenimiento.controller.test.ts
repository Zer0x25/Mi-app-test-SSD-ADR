import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { createMantenimientoController } from "../../../src/modules/mantenimiento/mantenimiento.controller.js";
import {
  MantenimientoService,
  IMantenimientoRepository,
  MedidorMantenimientoInfo,
  MantenimientoEntity,
} from "../../../src/modules/mantenimiento/mantenimiento.service.js";

class MockMantenimientoRepository implements IMantenimientoRepository {
  public medidores: Map<string, MedidorMantenimientoInfo> = new Map();
  public registros: MantenimientoEntity[] = [];

  async findMedidorInfo(medidorId: string): Promise<MedidorMantenimientoInfo | null> {
    return this.medidores.get(medidorId) || null;
  }
  async updateMedidor(medidorId: string, data: Partial<MedidorMantenimientoInfo>): Promise<void> {
    const cur = this.medidores.get(medidorId);
    if (cur) this.medidores.set(medidorId, { ...cur, ...data });
  }
  async createRegistro(data: Omit<MantenimientoEntity, "id" | "createdAt">): Promise<MantenimientoEntity> {
    const r: MantenimientoEntity = { id: crypto.randomUUID(), ...data, createdAt: new Date() };
    this.registros.push(r);
    return r;
  }
  async listRegistros(): Promise<MantenimientoEntity[]> {
    return this.registros;
  }
}

describe("MantenimientoController HTTP Integration Suite", () => {
  let app: FastifyInstance;
  let repo: MockMantenimientoRepository;
  let service: MantenimientoService;

  const medidorId = crypto.randomUUID();
  const instId = crypto.randomUUID();

  beforeEach(async () => {
    repo = new MockMantenimientoRepository();
    service = new MantenimientoService(repo);

    repo.medidores.set(medidorId, {
      id: medidorId,
      codigo: "MED-AG-01",
      instalacionId: instId,
      instalacionNombre: "Planta Norte",
      tipoMedicion: "ACUMULATIVO",
      activo: true,
      precintoActual: "PREC-001",
      ultimaLecturaValor: 500,
    });

    app = Fastify();
    await app.register(createMantenimientoController(service), { prefix: "/api" });
    await app.ready();
  });

  describe("POST /api/mantenimiento", () => {
    it("debe registrar un evento de calibración y retornar 201 Created", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/mantenimiento",
        payload: {
          medidorId,
          tipo: "CALIBRACION",
          fechaMantenimiento: "2026-10-01T10:00:00.000Z",
          tecnicoResponsable: "Ing. Juan Pérez",
          certificadoCalibracion: "CERT-CAL-2026",
          observaciones: "Calibración conforme",
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.id).toBeDefined();
      expect(data.tipo).toBe("CALIBRACION");
      expect(data.tecnicoResponsable).toBe("Ing. Juan Pérez");
    });

    it("debe retornar 400 si los datos de entrada son inválidos", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/mantenimiento",
        payload: {
          medidorId: "no-uuid",
        },
      });

      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/mantenimiento", () => {
    it("debe retornar 200 con el listado de eventos", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/mantenimiento",
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe("GET /api/mantenimiento/medidor/:id", () => {
    it("debe retornar 200 con la ficha técnica y la bitácora del medidor", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/mantenimiento/medidor/${medidorId}`,
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.id).toBe(medidorId);
      expect(data.codigo).toBe("MED-AG-01");
      expect(Array.isArray(data.historial)).toBe(true);
    });

    it("debe retornar 404 si el medidor no existe", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/mantenimiento/medidor/${crypto.randomUUID()}`,
      });

      expect(res.statusCode).toBe(404);
      const data = JSON.parse(res.body);
      expect(data.error).toBe("MEDIDOR_NOT_FOUND");
    });
  });
});
