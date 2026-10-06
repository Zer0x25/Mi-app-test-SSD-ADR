import { describe, it, expect, beforeEach } from "vitest";
import {
  MedidoresService,
  IMedidoresRepository,
  TipoMedidorEntity,
  MedidorEntity,
  IInstalacionesVerificationService,
} from "../../../src/modules/medidores/medidores.service.js";
import {
  TipoMedidorNombreDuplicadoError,
  TipoMedidorNotFoundError,
  TipoMedidorInactivoError,
  MedidorNotFoundError,
  MedidorCodigoDuplicadoError,
  InstalacionNotFoundError,
  InstalacionInactivaError,
} from "../../../src/modules/medidores/medidores.schema.js";

class InMemoryMedidoresRepository implements IMedidoresRepository {
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
    if (idx === -1) throw new Error("Not found");
    const updated = { ...this.medidores[idx], ...data, updatedAt: new Date() };
    this.medidores[idx] = updated;
    return updated;
  }

  async listMedidoresByInstalacion(instalacionId: string): Promise<MedidorEntity[]> {
    return this.medidores.filter(
      (m) => m.instalacionId === instalacionId && m.activo
    );
  }

  async listMedidores(instalacionIds?: string[]): Promise<MedidorEntity[]> {
    if (instalacionIds) {
      return this.medidores.filter((m) => instalacionIds.includes(m.instalacionId) && m.activo);
    }
    return this.medidores.filter((m) => m.activo);
  }
}

class MockInstalacionesVerificationService implements IInstalacionesVerificationService {
  public instalaciones = new Map<string, { id: string; activa: boolean }>();

  async verifyInstalacionActiva(id: string): Promise<void> {
    const inst = this.instalaciones.get(id);
    if (!inst) {
      throw new InstalacionNotFoundError(id);
    }
    if (!inst.activa) {
      throw new InstalacionInactivaError(id);
    }
  }
}

describe("MedidoresService Suite (Agentic TDD)", () => {
  let repository: InMemoryMedidoresRepository;
  let instalacionesVerif: MockInstalacionesVerificationService;
  let service: MedidoresService;

  beforeEach(() => {
    repository = new InMemoryMedidoresRepository();
    instalacionesVerif = new MockInstalacionesVerificationService();
    service = new MedidoresService(repository, instalacionesVerif);
  });

  describe("Tipos de Medidor", () => {
    it("debe crear un tipo de medidor con activo: true por defecto", async () => {
      const tipo = await service.crearTipoMedidor({
        nombre: "Agua Potable Red",
        recurso: "AGUA",
        unidad: "LITROS",
        tipoMedicion: "ACUMULATIVO",
      });

      expect(tipo).toBeDefined();
      expect(tipo.id).toBeDefined();
      expect(tipo.nombre).toBe("Agua Potable Red");
      expect(tipo.activo).toBe(true);
    });

    it("debe lanzar TipoMedidorNombreDuplicadoError si el nombre ya existe", async () => {
      await service.crearTipoMedidor({
        nombre: "Luz Trifásica",
        recurso: "LUZ",
        unidad: "KWH",
        tipoMedicion: "ACUMULATIVO",
      });

      await expect(
        service.crearTipoMedidor({
          nombre: "  luz trifásica  ",
          recurso: "LUZ",
          unidad: "KWH",
          tipoMedicion: "ACUMULATIVO",
        })
      ).rejects.toThrow(TipoMedidorNombreDuplicadoError);
    });

    it("debe listar todos los tipos de medidores activos", async () => {
      await service.crearTipoMedidor({
        nombre: "Diésel Generador",
        recurso: "PETROLEO",
        unidad: "LITROS",
        tipoMedicion: "NIVEL",
      });

      const lista = await service.listarTiposMedidor();
      expect(lista.length).toBe(1);
      expect(lista[0].nombre).toBe("Diésel Generador");
    });
  });

  describe("Medidores Físicos", () => {
    let instalacionId: string;
    let tipoMedidorId: string;

    beforeEach(async () => {
      instalacionId = crypto.randomUUID();
      instalacionesVerif.instalaciones.set(instalacionId, {
        id: instalacionId,
        activa: true,
      });

      const tipo = await service.crearTipoMedidor({
        nombre: "Gas Natural",
        recurso: "GAS",
        unidad: "M3",
        tipoMedicion: "ACUMULATIVO",
      });
      tipoMedidorId = tipo.id;
    });

    it("debe crear un medidor físico vinculado a instalación y tipo válidos", async () => {
      const medidor = await service.crearMedidor({
        instalacionId,
        tipoMedidorId,
        codigo: "MED-GAS-001",
        numeroSerie: "SN-987654",
        ubicacionInterna: "Sala de calderas",
      });

      expect(medidor).toBeDefined();
      expect(medidor.codigo).toBe("MED-GAS-001");
      expect(medidor.activo).toBe(true);
      expect(medidor.instalacionId).toBe(instalacionId);
      expect(medidor.tipoMedidorId).toBe(tipoMedidorId);
    });

    it("debe lanzar MedidorCodigoDuplicadoError si ya existe un medidor con ese código", async () => {
      await service.crearMedidor({
        instalacionId,
        tipoMedidorId,
        codigo: "MED-GAS-001",
        ubicacionInterna: "Sala 1",
      });

      await expect(
        service.crearMedidor({
          instalacionId,
          tipoMedidorId,
          codigo: "  med-gas-001  ",
          ubicacionInterna: "Sala 2",
        })
      ).rejects.toThrow(MedidorCodigoDuplicadoError);
    });

    it("debe lanzar InstalacionNotFoundError si la instalación no existe", async () => {
      await expect(
        service.crearMedidor({
          instalacionId: crypto.randomUUID(),
          tipoMedidorId,
          codigo: "MED-002",
          ubicacionInterna: "Sector A",
        })
      ).rejects.toThrow(InstalacionNotFoundError);
    });

    it("debe lanzar InstalacionInactivaError si la instalación está inactiva", async () => {
      const inactivaId = crypto.randomUUID();
      instalacionesVerif.instalaciones.set(inactivaId, {
        id: inactivaId,
        activa: false,
      });

      await expect(
        service.crearMedidor({
          instalacionId: inactivaId,
          tipoMedidorId,
          codigo: "MED-003",
          ubicacionInterna: "Sector B",
        })
      ).rejects.toThrow(InstalacionInactivaError);
    });

    it("debe lanzar TipoMedidorNotFoundError si el tipo de medidor no existe", async () => {
      await expect(
        service.crearMedidor({
          instalacionId,
          tipoMedidorId: crypto.randomUUID(),
          codigo: "MED-004",
          ubicacionInterna: "Sector C",
        })
      ).rejects.toThrow(TipoMedidorNotFoundError);
    });

    it("debe lanzar TipoMedidorInactivoError si el tipo de medidor está inactivo", async () => {
      const tipoInactivo = await repository.createTipo({
        nombre: "Vapor Inactivo",
        recurso: "OTRO",
        unidad: "OTRO",
        tipoMedicion: "INSTANTANEO",
        activo: false,
      });

      await expect(
        service.crearMedidor({
          instalacionId,
          tipoMedidorId: tipoInactivo.id,
          codigo: "MED-005",
          ubicacionInterna: "Sector D",
        })
      ).rejects.toThrow(TipoMedidorInactivoError);
    });

    it("debe obtener un medidor por ID incluyendo su tipoMedidor asociado", async () => {
      const medidor = await service.crearMedidor({
        instalacionId,
        tipoMedidorId,
        codigo: "MED-GAS-100",
        ubicacionInterna: "Sector E",
      });

      const obtenido = await service.obtenerMedidorPorId(medidor.id);
      expect(obtenido.id).toBe(medidor.id);
      expect(obtenido.tipoMedidor).toBeDefined();
      expect(obtenido.tipoMedidor?.nombre).toBe("Gas Natural");
    });

    it("debe lanzar MedidorNotFoundError si el ID no existe", async () => {
      await expect(
        service.obtenerMedidorPorId(crypto.randomUUID())
      ).rejects.toThrow(MedidorNotFoundError);
    });

    it("debe desactivar un medidor cambiando activo a false sin borrado físico", async () => {
      const medidor = await service.crearMedidor({
        instalacionId,
        tipoMedidorId,
        codigo: "MED-DESACTIVAR",
        ubicacionInterna: "Sector F",
      });

      const desactivado = await service.desactivarMedidor(medidor.id);
      expect(desactivado.activo).toBe(false);
      expect(repository.medidores.length).toBe(1);
    });

    it("debe listar los medidores activos de una instalación", async () => {
      const m1 = await service.crearMedidor({
        instalacionId,
        tipoMedidorId,
        codigo: "MED-L1",
        ubicacionInterna: "Ubic 1",
      });
      const m2 = await service.crearMedidor({
        instalacionId,
        tipoMedidorId,
        codigo: "MED-L2",
        ubicacionInterna: "Ubic 2",
      });
      const m3 = await service.crearMedidor({
        instalacionId,
        tipoMedidorId,
        codigo: "MED-L3",
        ubicacionInterna: "Ubic 3",
      });
      await service.desactivarMedidor(m3.id);

      const lista = await service.listarMedidoresPorInstalacion(instalacionId);
      expect(lista.length).toBe(2);
      expect(lista.map((m) => m.id)).toContain(m1.id);
      expect(lista.map((m) => m.id)).toContain(m2.id);
      expect(lista.map((m) => m.id)).not.toContain(m3.id);
    });
  });
});
