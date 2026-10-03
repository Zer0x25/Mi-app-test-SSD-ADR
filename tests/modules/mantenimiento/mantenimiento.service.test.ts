import { describe, it, expect, beforeEach } from "vitest";
import {
  MantenimientoService,
  IMantenimientoRepository,
  MedidorMantenimientoInfo,
  MantenimientoEntity,
} from "../../../src/modules/mantenimiento/mantenimiento.service.js";
import {
  MedidorMantenimientoNotFoundError,
  LecturaRetiroInvalidaError,
  PrecintoNuevoRequeridoError,
} from "../../../src/modules/mantenimiento/mantenimiento.schema.js";

class InMemoryMantenimientoRepository implements IMantenimientoRepository {
  public medidores: Map<string, MedidorMantenimientoInfo> = new Map();
  public registros: MantenimientoEntity[] = [];

  async findMedidorInfo(medidorId: string): Promise<MedidorMantenimientoInfo | null> {
    return this.medidores.get(medidorId) || null;
  }

  async updateMedidor(
    medidorId: string,
    data: Partial<MedidorMantenimientoInfo>
  ): Promise<void> {
    const current = this.medidores.get(medidorId);
    if (current) {
      this.medidores.set(medidorId, { ...current, ...data });
    }
  }

  async createRegistro(
    data: Omit<MantenimientoEntity, "id" | "createdAt">
  ): Promise<MantenimientoEntity> {
    const reg: MantenimientoEntity = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
    };
    this.registros.push(reg);
    return reg;
  }

  async listRegistros(): Promise<MantenimientoEntity[]> {
    return this.registros;
  }
}

describe("MantenimientoService Suite (Agentic TDD)", () => {
  let repo: InMemoryMantenimientoRepository;
  let service: MantenimientoService;

  const medidorId = crypto.randomUUID();
  const instId = crypto.randomUUID();

  beforeEach(() => {
    repo = new InMemoryMantenimientoRepository();
    service = new MantenimientoService(repo);

    repo.medidores.set(medidorId, {
      id: medidorId,
      codigo: "MED-AG-01",
      instalacionId: instId,
      instalacionNombre: "Planta Norte",
      tipoMedicion: "ACUMULATIVO",
      activo: true,
      precintoActual: "PREC-100",
      fechaUltimaCalibracion: new Date("2025-01-10"),
      fechaProximaCalibracion: new Date("2026-01-10"),
      ultimaLecturaValor: 1250.0,
    });
  });

  describe("Registro de Calibración", () => {
    it("debe registrar calibración y actualizar fechas en el medidor", async () => {
      const fechaMantenimiento = new Date("2026-10-01");
      const proximaCalibracion = new Date("2027-10-01");

      const res = await service.registrarMantenimiento({
        medidorId,
        tipo: "CALIBRACION",
        fechaMantenimiento,
        proximaCalibracion,
        certificadoCalibracion: "CERT-METRO-2026-99",
        tecnicoResponsable: "Roberto Metrólogo",
        observaciones: "Calibración en laboratorio acreditado",
      });

      expect(res.id).toBeDefined();
      expect(res.tipo).toBe("CALIBRACION");

      const medidorActualizado = repo.medidores.get(medidorId)!;
      expect(medidorActualizado.fechaUltimaCalibracion).toEqual(fechaMantenimiento);
      expect(medidorActualizado.fechaProximaCalibracion).toEqual(proximaCalibracion);
    });
  });

  describe("Control de Precintos de Seguridad", () => {
    it("debe actualizar precintoActual en el medidor al cambiar precinto", async () => {
      const res = await service.registrarMantenimiento({
        medidorId,
        tipo: "CAMBIO_PRECINTO",
        fechaMantenimiento: new Date(),
        numeroPrecintoAnterior: "PREC-100",
        numeroPrecintoNuevo: "PREC-200",
        tecnicoResponsable: "Carlos Seguridad",
        observaciones: "Precinto roto durante inspección rutinaria",
      });

      expect(res.numeroPrecintoNuevo).toBe("PREC-200");
      const medidorActualizado = repo.medidores.get(medidorId)!;
      expect(medidorActualizado.precintoActual).toBe("PREC-200");
    });

    it("debe rechazar CAMBIO_PRECINTO si no se proporciona numeroPrecintoNuevo", async () => {
      await expect(
        service.registrarMantenimiento({
          medidorId,
          tipo: "CAMBIO_PRECINTO",
          fechaMantenimiento: new Date(),
          tecnicoResponsable: "Carlos Seguridad",
        })
      ).rejects.toThrow(PrecintoNuevoRequeridoError);
    });
  });

  describe("Bajas y Reemplazo de Equipos", () => {
    it("debe dar de baja el medidor (activo: false) y registrar reemplazo", async () => {
      const res = await service.registrarMantenimiento({
        medidorId,
        tipo: "REEMPLAZO_EQUIPO",
        fechaMantenimiento: new Date(),
        tecnicoResponsable: "Juan Técnico",
        lecturaRetiro: 1260.0, // >= última lectura (1250)
        nuevoMedidorCodigo: "MED-AG-01-V2",
        motivoBaja: "Falla en turbina interna",
      });

      expect(res.tipo).toBe("REEMPLAZO_EQUIPO");
      expect(res.nuevoMedidorCodigo).toBe("MED-AG-01-V2");

      const medidorActualizado = repo.medidores.get(medidorId)!;
      expect(medidorActualizado.activo).toBe(false);
    });

    it("debe rechazar lecturaRetiro si es inferior a la última lectura en medidor acumulativo", async () => {
      await expect(
        service.registrarMantenimiento({
          medidorId,
          tipo: "BAJA_TECNICA",
          fechaMantenimiento: new Date(),
          tecnicoResponsable: "Juan Técnico",
          lecturaRetiro: 1200.0, // < 1250.0
          motivoBaja: "Desgaste total",
        })
      ).rejects.toThrow(LecturaRetiroInvalidaError);
    });
  });

  describe("Manejo de Errores", () => {
    it("debe lanzar MedidorMantenimientoNotFoundError si el medidor no existe", async () => {
      await expect(
        service.registrarMantenimiento({
          medidorId: crypto.randomUUID(),
          tipo: "INSPECCION",
          fechaMantenimiento: new Date(),
          tecnicoResponsable: "Inspector Test",
        })
      ).rejects.toThrow(MedidorMantenimientoNotFoundError);
    });
  });
});
