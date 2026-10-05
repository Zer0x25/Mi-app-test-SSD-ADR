import { describe, it, expect, beforeEach } from "vitest";
import {
  InstalacionesService,
  IInstalacionesRepository,
  InstalacionEntity,
  AsignacionEntity,
} from "../../../src/modules/instalaciones/instalaciones.service.js";
import {
  InstalacionNotFoundError,
  InstalacionNombreDuplicadoError,
  InstalacionInactivaError,
  AsignacionDuplicadaError,
} from "../../../src/modules/instalaciones/instalaciones.schema.js";

// Mock Repository en memoria para pruebas deterministas
class InMemoryInstalacionesRepository implements IInstalacionesRepository {
  public instalaciones: InstalacionEntity[] = [];
  public asignaciones: AsignacionEntity[] = [];

  async findById(id: string): Promise<InstalacionEntity | null> {
    return this.instalaciones.find((i) => i.id === id) || null;
  }

  async findByNombre(nombre: string): Promise<InstalacionEntity | null> {
    const normalized = nombre.trim().toLowerCase();
    return (
      this.instalaciones.find(
        (i) => i.nombre.trim().toLowerCase() === normalized
      ) || null
    );
  }

  async create(data: Omit<InstalacionEntity, "id" | "createdAt" | "updatedAt">): Promise<InstalacionEntity> {
    const instalacion: InstalacionEntity = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.instalaciones.push(instalacion);
    return instalacion;
  }

  async update(id: string, data: Partial<InstalacionEntity>): Promise<InstalacionEntity> {
    const index = this.instalaciones.findIndex((i) => i.id === id);
    if (index === -1) throw new Error("Not found");
    const updated = {
      ...this.instalaciones[index],
      ...data,
      updatedAt: new Date(),
    };
    this.instalaciones[index] = updated;
    return updated;
  }

  async findAsignacion(instalacionId: string, usuarioId: string): Promise<AsignacionEntity | null> {
    return (
      this.asignaciones.find(
        (a) => a.instalacionId === instalacionId && a.usuarioId === usuarioId
      ) || null
    );
  }

  async createAsignacion(instalacionId: string, usuarioId: string): Promise<AsignacionEntity> {
    const asignacion: AsignacionEntity = {
      id: crypto.randomUUID(),
      instalacionId,
      usuarioId,
      createdAt: new Date(),
    };
    this.asignaciones.push(asignacion);
    return asignacion;
  }

  async deleteAsignacion(instalacionId: string, usuarioId: string): Promise<boolean> {
    const prev = this.asignaciones.length;
    this.asignaciones = this.asignaciones.filter(
      (a) => !(a.instalacionId === instalacionId && a.usuarioId === usuarioId)
    );
    return this.asignaciones.length < prev;
  }

  async listInstalacionesByOperador(usuarioId: string): Promise<InstalacionEntity[]> {
    const asignadasIds = this.asignaciones
      .filter((a) => a.usuarioId === usuarioId)
      .map((a) => a.instalacionId);

    return this.instalaciones.filter(
      (i) => asignadasIds.includes(i.id) && i.activa === true
    );
  }
}

describe("InstalacionesService Suite (Agentic TDD)", () => {
  let repository: InMemoryInstalacionesRepository;
  let service: InstalacionesService;

  beforeEach(() => {
    repository = new InMemoryInstalacionesRepository();
    service = new InstalacionesService(repository);
  });

  describe("crearInstalacion", () => {
    it("debe crear una instalación con estado activa: true por defecto", async () => {
      const input = {
        nombre: "Planta Norte",
        ubicacion: "Sector Industrial 4",
      };

      const result = await service.crearInstalacion(input);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.nombre).toBe("Planta Norte");
      expect(result.ubicacion).toBe("Sector Industrial 4");
      expect(result.activa).toBe(true);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it("debe lanzar InstalacionNombreDuplicadoError si ya existe una instalación con el mismo nombre", async () => {
      await service.crearInstalacion({
        nombre: "Planta Norte",
        ubicacion: "Sector Industrial 4",
      });

      await expect(
        service.crearInstalacion({
          nombre: "  planta norte  ",
          ubicacion: "Otra dirección",
        })
      ).rejects.toThrow(InstalacionNombreDuplicadoError);
    });
  });

  describe("obtenerPorId", () => {
    it("debe retornar la instalación existente por ID", async () => {
      const creada = await service.crearInstalacion({
        nombre: "Edificio Central",
        ubicacion: "Av. Principal 100",
      });

      const encontrada = await service.obtenerPorId(creada.id);

      expect(encontrada).toEqual(creada);
    });

    it("debe lanzar InstalacionNotFoundError si el ID no existe", async () => {
      const idInexistente = crypto.randomUUID();

      await expect(service.obtenerPorId(idInexistente)).rejects.toThrow(
        InstalacionNotFoundError
      );
    });
  });

  describe("desactivarInstalacion (Baja Lógica)", () => {
    it("debe desactivar la instalación cambiando activa a false sin eliminar el registro", async () => {
      const creada = await service.crearInstalacion({
        nombre: "Sucursal Sur",
        ubicacion: "Ruta 5 Km 20",
      });

      const desactivada = await service.desactivarInstalacion(creada.id);

      expect(desactivada.activa).toBe(false);
      expect(repository.instalaciones.length).toBe(1);
    });

    it("debe lanzar InstalacionNotFoundError si la instalación a desactivar no existe", async () => {
      await expect(
        service.desactivarInstalacion(crypto.randomUUID())
      ).rejects.toThrow(InstalacionNotFoundError);
    });
  });

  describe("asignarOperador", () => {
    it("debe asignar un operador exitosamente a una instalación activa", async () => {
      const instalacion = await service.crearInstalacion({
        nombre: "Campamento Minero",
        ubicacion: "Cordillera Andina",
      });
      const usuarioId = crypto.randomUUID();

      const asignacion = await service.asignarOperador({
        instalacionId: instalacion.id,
        usuarioId,
      });

      expect(asignacion).toBeDefined();
      expect(asignacion.instalacionId).toBe(instalacion.id);
      expect(asignacion.usuarioId).toBe(usuarioId);
    });

    it("debe lanzar InstalacionInactivaError si la instalación se encuentra desactivada", async () => {
      const instalacion = await service.crearInstalacion({
        nombre: "Campamento Antiguo",
        ubicacion: "Zona Norte",
      });
      await service.desactivarInstalacion(instalacion.id);
      const usuarioId = crypto.randomUUID();

      await expect(
        service.asignarOperador({
          instalacionId: instalacion.id,
          usuarioId,
        })
      ).rejects.toThrow(InstalacionInactivaError);
    });

    it("debe lanzar AsignacionDuplicadaError si el usuario ya está asignado a la instalación", async () => {
      const instalacion = await service.crearInstalacion({
        nombre: "Planta Térmica",
        ubicacion: "Parque Industrial",
      });
      const usuarioId = crypto.randomUUID();

      await service.asignarOperador({
        instalacionId: instalacion.id,
        usuarioId,
      });

      await expect(
        service.asignarOperador({
          instalacionId: instalacion.id,
          usuarioId,
        })
      ).rejects.toThrow(AsignacionDuplicadaError);
    });
  });

  describe("listarInstalacionesDeOperador", () => {
    it("debe retornar únicamente las instalaciones activas asignadas al operador", async () => {
      const inst1 = await service.crearInstalacion({
        nombre: "Instalación Activa 1",
        ubicacion: "Ubicación 1",
      });
      const inst2 = await service.crearInstalacion({
        nombre: "Instalación Activa 2",
        ubicacion: "Ubicación 2",
      });
      const inst3 = await service.crearInstalacion({
        nombre: "Instalación Inactiva",
        ubicacion: "Ubicación 3",
      });
      await service.desactivarInstalacion(inst3.id);

      const operadorId = crypto.randomUUID();
      await service.asignarOperador({ instalacionId: inst1.id, usuarioId: operadorId });
      await service.asignarOperador({ instalacionId: inst2.id, usuarioId: operadorId });

      const lista = await service.listarInstalacionesDeOperador(operadorId);

      expect(lista.length).toBe(2);
      expect(lista.map((i) => i.id)).toContain(inst1.id);
      expect(lista.map((i) => i.id)).toContain(inst2.id);
      expect(lista.map((i) => i.id)).not.toContain(inst3.id);
    });

    it("desasignarOperador debe remover la asignación y no figurar en listados posteriores", async () => {
      const inst = await service.crearInstalacion({
        nombre: "Sede a Desasignar",
        ubicacion: "Calle Test",
      });
      const operadorId = crypto.randomUUID();
      await service.asignarOperador({ instalacionId: inst.id, usuarioId: operadorId });

      let lista = await service.listarInstalacionesDeOperador(operadorId);
      expect(lista).toHaveLength(1);

      await service.desasignarOperador(inst.id, operadorId);

      lista = await service.listarInstalacionesDeOperador(operadorId);
      expect(lista).toHaveLength(0);
    });
  });
});
