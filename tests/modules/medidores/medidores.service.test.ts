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
  PeriodoGraciaExpiradoError,
  EliminacionFisicaProhibidaError,
  MedidorConLecturasNoEliminableError,
} from "../../../src/modules/medidores/medidores.schema.js";

class InMemoryMedidoresRepository implements IMedidoresRepository {
  public tipos: TipoMedidorEntity[] = [];
  public medidores: MedidorEntity[] = [];
  public lecturasCounts: Map<string, number> = new Map();

  async countLecturas(medidorId: string): Promise<number> {
    return this.lecturasCounts.get(medidorId) || 0;
  }

  async deleteMedidorFisico(id: string): Promise<boolean> {
    const prev = this.medidores.length;
    this.medidores = this.medidores.filter((m) => m.id !== id);
    return this.medidores.length < prev;
  }

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

  async listTipos(estado: "activos" | "archivados" | "todos" = "activos"): Promise<TipoMedidorEntity[]> {
    if (estado === "activos") return this.tipos.filter((t) => t.activo);
    if (estado === "archivados") return this.tipos.filter((t) => !t.activo);
    return [...this.tipos];
  }

  async updateTipo(id: string, data: Partial<TipoMedidorEntity>): Promise<TipoMedidorEntity> {
    const idx = this.tipos.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("Not found");
    const updated = { ...this.tipos[idx], ...data, updatedAt: new Date() };
    this.tipos[idx] = updated;
    return updated;
  }

  async deleteTipoFisico(id: string): Promise<boolean> {
    const prev = this.tipos.length;
    this.tipos = this.tipos.filter((t) => t.id !== id);
    return this.tipos.length < prev;
  }

  async countMedidoresByTipo(tipoId: string): Promise<number> {
    return this.medidores.filter((m) => m.tipoMedidorId === tipoId).length;
  }

  async findMedidorById(id: string): Promise<MedidorEntity | null> {
    return this.medidores.find((m) => m.id === id) || null;
  }

  async findMedidorByCodigo(codigo: string): Promise<MedidorEntity | null> {
    const norm = codigo.trim().toLowerCase();
    return this.medidores.find((m) => m.codigo.trim().toLowerCase() === norm) || null;
  }

  async findMedidorByCodigoExterno(codigoExterno: string): Promise<MedidorEntity | null> {
    const norm = codigoExterno.trim().toLowerCase();
    return (
      this.medidores.find(
        (m) => (m.codigoExterno || "").trim().toLowerCase() === norm && norm !== ""
      ) || null
    );
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

    it("debe crear un tipo con multiplicador personalizado (feat-024)", async () => {
      const tipo = await service.crearTipoMedidor({
        nombre: "Luz Trafo 100/5",
        recurso: "LUZ",
        unidad: "KWH",
        tipoMedicion: "ACUMULATIVO",
        multiplicador: 20,
      } as unknown as Parameters<typeof service.crearTipoMedidor>[0]);

      expect((tipo as unknown as Record<string, unknown>)["multiplicador"]).toBe(20);
    });

    it("debe crear un tipo NIVEL con capacidad máxima (feat-024)", async () => {
      const tipo = await service.crearTipoMedidor({
        nombre: "Estanque Diesel 5000",
        recurso: "PETROLEO",
        unidad: "LITROS",
        tipoMedicion: "NIVEL",
        multiplicador: 1,
        capacidadMaxima: 5000,
      } as unknown as Parameters<typeof service.crearTipoMedidor>[0]);

      expect((tipo as unknown as Record<string, unknown>)["capacidadMaxima"]).toBe(5000);
    });

    it("debe rechazar multiplicador no positivo por Zod (feat-024)", async () => {
      await expect(
        service.crearTipoMedidor({
          nombre: "Tipo Factor Malo",
          recurso: "LUZ",
          unidad: "KWH",
          tipoMedicion: "ACUMULATIVO",
          multiplicador: 0,
        } as unknown as Parameters<typeof service.crearTipoMedidor>[0])
      ).rejects.toThrow();
    });

    it("debe crear un medidor con codigoExterno y factorInstalacion (feat-025)", async () => {
      const instId = crypto.randomUUID();
      instalacionesVerif.instalaciones.set(instId, { id: instId, activa: true });
      const tipo = await service.crearTipoMedidor({
        nombre: "Tipo Std " + crypto.randomUUID().slice(0, 8),
        recurso: "LUZ",
        unidad: "KWH",
        tipoMedicion: "ACUMULATIVO",
        multiplicador: 1,
      });
      const med = await service.crearMedidor({
        instalacionId: instId,
        tipoMedidorId: tipo.id,
        codigo: "MED-STD-01",
        ubicacionInterna: "Sala Trafo",
        codigoExterno: "OBIS-1-0:1.8.0-FF",
        factorInstalacion: 20,
      });
      expect((med as unknown as Record<string, unknown>)["codigoExterno"]).toBe("OBIS-1-0:1.8.0-FF");
      expect((med as unknown as Record<string, unknown>)["factorInstalacion"]).toBe(20);
    });

    it("debe rechazar codigoExterno duplicado con 409 (feat-025)", async () => {
      const { MedidorCodigoExternoDuplicadoError } = await import(
        "../../../src/modules/medidores/medidores.schema.js"
      );
      const instId = crypto.randomUUID();
      instalacionesVerif.instalaciones.set(instId, { id: instId, activa: true });
      const tipo = await service.crearTipoMedidor({
        nombre: "Tipo Std Dup " + crypto.randomUUID().slice(0, 8),
        recurso: "LUZ",
        unidad: "KWH",
        tipoMedicion: "ACUMULATIVO",
        multiplicador: 1,
      });
      await service.crearMedidor({
        instalacionId: instId,
        tipoMedidorId: tipo.id,
        codigo: "MED-STD-A",
        ubicacionInterna: "Sala A",
        codigoExterno: "EXT-DUP-01",
      });
      await expect(
        service.crearMedidor({
          instalacionId: instId,
          tipoMedidorId: tipo.id,
          codigo: "MED-STD-B",
          ubicacionInterna: "Sala B",
          codigoExterno: "EXT-DUP-01",
        })
      ).rejects.toThrow(MedidorCodigoExternoDuplicadoError);
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
        multiplicador: 1,
        capacidadMaxima: null,
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

  describe("Edición, Archivado y Periodo de Gracia (feat-022)", () => {
    let instId: string;
    let tipoId: string;

    beforeEach(async () => {
      instId = crypto.randomUUID();
      instalacionesVerif.instalaciones.set(instId, { id: instId, activa: true });

      const tipo = await service.crearTipoMedidor({
        nombre: "Tipo Test " + crypto.randomUUID().slice(0, 8),
        recurso: "AGUA",
        unidad: "LITROS",
        tipoMedicion: "ACUMULATIVO",
      });
      tipoId = tipo.id;
    });

    it("debe permitir editar ubicacionInterna y numeroSerie sin alterar el codigo", async () => {
      const medidor = await service.crearMedidor({
        instalacionId: instId,
        tipoMedidorId: tipoId,
        codigo: "MED-ORIG-01",
        ubicacionInterna: "Sala de Bombas",
        numeroSerie: "SN-100",
      });

      const updated = await service.editarMedidor(medidor.id, {
        ubicacionInterna: "Sala de Calderas",
        numeroSerie: "SN-200",
      });

      expect(updated.ubicacionInterna).toBe("Sala de Calderas");
      expect(updated.numeroSerie).toBe("SN-200");
      expect(updated.codigo).toBe("MED-ORIG-01");
    });

    it("debe permitir corregir el codigo si el medidor esta en periodo de gracia (<= 30 dias)", async () => {
      const medidor = await service.crearMedidor({
        instalacionId: instId,
        tipoMedidorId: tipoId,
        codigo: "MED-TYPO-99",
        ubicacionInterna: "Caseta",
      });

      const updated = await service.editarMedidor(medidor.id, {
        codigo: "MED-CORREGIDO-01",
      });

      expect(updated.codigo).toBe("MED-CORREGIDO-01");
    });

    it("debe rechazar con PeriodoGraciaExpiradoError si el medidor tiene > 30 dias y se intenta cambiar el codigo", async () => {
      const medidor = await service.crearMedidor({
        instalacionId: instId,
        tipoMedidorId: tipoId,
        codigo: "MED-ANTIGUO-01",
        ubicacionInterna: "Sector A",
      });

      const entidad = await repository.findMedidorById(medidor.id);
      entidad!.createdAt = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000);

      await expect(
        service.editarMedidor(medidor.id, {
          codigo: "MED-MUTADO-01",
        })
      ).rejects.toThrow(PeriodoGraciaExpiradoError);
    });

    it("debe archivar y restaurar un medidor", async () => {
      const medidor = await service.crearMedidor({
        instalacionId: instId,
        tipoMedidorId: tipoId,
        codigo: "MED-ARCHIVABLE",
        ubicacionInterna: "Sector B",
      });

      const archivado = await service.archivarMedidor(medidor.id);
      expect(archivado.activo).toBe(false);

      const restaurado = await service.restaurarMedidor(medidor.id);
      expect(restaurado.activo).toBe(true);
    });

    it("debe rechazar eliminacion fisica con EliminacionFisicaProhibidaError si tiene > 30 dias", async () => {
      const medidor = await service.crearMedidor({
        instalacionId: instId,
        tipoMedidorId: tipoId,
        codigo: "MED-VIEJO-01",
        ubicacionInterna: "Sector C",
      });

      const entidad = await repository.findMedidorById(medidor.id);
      entidad!.createdAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

      await expect(service.eliminarMedidorFisico(medidor.id)).rejects.toThrow(
        EliminacionFisicaProhibidaError
      );
    });

    it("debe rechazar eliminacion fisica con MedidorConLecturasNoEliminableError si tiene lecturas", async () => {
      const medidor = await service.crearMedidor({
        instalacionId: instId,
        tipoMedidorId: tipoId,
        codigo: "MED-CON-LECTURAS",
        ubicacionInterna: "Sector D",
      });

      repository.lecturasCounts.set(medidor.id, 5);

      await expect(service.eliminarMedidorFisico(medidor.id)).rejects.toThrow(
        MedidorConLecturasNoEliminableError
      );
    });

    it("debe eliminar fisicamente el medidor si tiene <= 30 dias y 0 lecturas", async () => {
      const medidor = await service.crearMedidor({
        instalacionId: instId,
        tipoMedidorId: tipoId,
        codigo: "MED-BORRABLE-01",
        ubicacionInterna: "Sector E",
      });

      repository.lecturasCounts.set(medidor.id, 0);

      const resultado = await service.eliminarMedidorFisico(medidor.id);
      expect(resultado).toBe(true);

      const buscado = await repository.findMedidorById(medidor.id);
      expect(buscado).toBeNull();
    });
  });

  describe("Edición y eliminación de tipos con bloqueo por uso (feat-026)", () => {
    it("debe bloquear la edición del tipo si tiene un medidor asignado", async () => {
      const { TipoMedidorEnUsoError } = await import(
        "../../../src/modules/medidores/medidores.schema.js"
      );
      const instId = crypto.randomUUID();
      instalacionesVerif.instalaciones.set(instId, { id: instId, activa: true });
      const tipoA = await service.crearTipoMedidor({
        nombre: "Tipo Bloq " + crypto.randomUUID().slice(0, 8),
        recurso: "AGUA",
        unidad: "LITROS",
        tipoMedicion: "ACUMULATIVO",
      });
      await service.crearMedidor({
        instalacionId: instId,
        tipoMedidorId: tipoA.id,
        codigo: "MED-BLOQ-01",
        ubicacionInterna: "Sala X",
      });
      await expect(
        (service as unknown as { editarTipoMedidor: (id: string, input: unknown) => Promise<unknown> }).editarTipoMedidor(tipoA.id, { nombre: "Nuevo nombre" })
      ).rejects.toThrow(TipoMedidorEnUsoError);
    });

    it("debe permitir reasignar el medidor a otro tipo y luego editar/eliminar el tipo liberado", async () => {
      const instId = crypto.randomUUID();
      instalacionesVerif.instalaciones.set(instId, { id: instId, activa: true });
      const tipoA = await service.crearTipoMedidor({
        nombre: "Tipo A " + crypto.randomUUID().slice(0, 8),
        recurso: "AGUA",
        unidad: "LITROS",
        tipoMedicion: "ACUMULATIVO",
      });
      const tipoB = await service.crearTipoMedidor({
        nombre: "Tipo B " + crypto.randomUUID().slice(0, 8),
        recurso: "AGUA",
        unidad: "LITROS",
        tipoMedicion: "ACUMULATIVO",
      });
      const med = await service.crearMedidor({
        instalacionId: instId,
        tipoMedidorId: tipoA.id,
        codigo: "MED-REASIG-01",
        ubicacionInterna: "Sala Y",
      });
      const reasignado = await service.editarMedidor(med.id, {
        tipoMedidorId: tipoB.id,
      } as unknown as Parameters<typeof service.editarMedidor>[1]);
      expect(reasignado.tipoMedidorId).toBe(tipoB.id);
      const editado = await (service as unknown as { editarTipoMedidor: (id: string, input: unknown) => Promise<{ nombre: string }> }).editarTipoMedidor(tipoA.id, { nombre: "Tipo A Renombrado" });
      expect(editado.nombre).toBe("Tipo A Renombrado");
      const eliminado = await (service as unknown as { eliminarTipoFisico: (id: string) => Promise<boolean> }).eliminarTipoFisico(tipoA.id);
      expect(eliminado).toBe(true);
    });

    it("debe bloquear el archivado y la eliminación física del tipo en uso", async () => {
      const { TipoMedidorEnUsoError } = await import(
        "../../../src/modules/medidores/medidores.schema.js"
      );
      const instId = crypto.randomUUID();
      instalacionesVerif.instalaciones.set(instId, { id: instId, activa: true });
      const tipo = await service.crearTipoMedidor({
        nombre: "Tipo Uso " + crypto.randomUUID().slice(0, 8),
        recurso: "LUZ",
        unidad: "KWH",
        tipoMedicion: "ACUMULATIVO",
      });
      await service.crearMedidor({
        instalacionId: instId,
        tipoMedidorId: tipo.id,
        codigo: "MED-USO-01",
        ubicacionInterna: "Sala Z",
      });
      await expect(
        (service as unknown as { archivarTipo: (id: string) => Promise<unknown> }).archivarTipo(tipo.id)
      ).rejects.toThrow(TipoMedidorEnUsoError);
      await expect(
        (service as unknown as { eliminarTipoFisico: (id: string) => Promise<unknown> }).eliminarTipoFisico(tipo.id)
      ).rejects.toThrow();
    });
  });
});
