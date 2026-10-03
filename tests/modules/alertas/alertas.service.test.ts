import { describe, it, expect, beforeEach } from "vitest";
import {
  AlertasService,
  IAlertasRepository,
  MedidorParaEvaluacion,
  ReglaEntity,
  IncidenteEntity,
} from "../../../src/modules/alertas/alertas.service.js";
import {
  IncidenteNotFoundError,
  IncidenteYaResueltoError,
} from "../../../src/modules/alertas/alertas.schema.js";

class InMemoryAlertasRepository implements IAlertasRepository {
  public reglas: ReglaEntity[] = [];
  public incidentes: IncidenteEntity[] = [];
  public medidores: MedidorParaEvaluacion[] = [];

  async getReglasActivas(): Promise<ReglaEntity[]> {
    return this.reglas.filter((r) => r.activa);
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
    if (idx === -1) throw new Error("Not found");
    this.incidentes[idx] = {
      ...this.incidentes[idx],
      ...data,
      updatedAt: new Date(),
    };
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

describe("AlertasService Suite (Agentic TDD)", () => {
  let repo: InMemoryAlertasRepository;
  let service: AlertasService;

  const instId = crypto.randomUUID();
  const medidor1Id = crypto.randomUUID();

  beforeEach(() => {
    repo = new InMemoryAlertasRepository();
    service = new AlertasService(repo);

    // Reglas base configuradas
    repo.reglas = [
      {
        id: crypto.randomUUID(),
        nombre: "Sin Reporte > 48h",
        tipo: "SIN_REPORTE",
        recurso: null,
        umbralValor: 48,
        activa: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: crypto.randomUUID(),
        nombre: "Salto Atípico de Consumo > 50%",
        tipo: "SALTO_CONSUMO",
        recurso: null,
        umbralValor: 50,
        activa: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: crypto.randomUUID(),
        nombre: "Fuga Probable en Agua",
        tipo: "FUGA_PROBABLE",
        recurso: "AGUA",
        umbralValor: 3, // 3 lecturas continuas con consumo sin reposo
        activa: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  });

  describe("Detección de Medidores Sin Reporte > 48h", () => {
    it("debe crear un incidente WARNING si un medidor activo no reporta en más de 48 horas", async () => {
      const ahora = new Date("2026-10-03T12:00:00Z");
      // Última lectura hace 50 horas
      const fechaLectura = new Date(ahora.getTime() - 50 * 3600 * 1000);

      repo.medidores = [
        {
          id: medidor1Id,
          codigo: "MED-AG-01",
          instalacionId: instId,
          instalacionNombre: "Planta Norte",
          recurso: "AGUA",
          activo: true,
          lecturas: [{ valor: 100, fechaLectura }],
        },
      ];

      const nuevosIncidentes = await service.evaluarReglas(ahora);

      expect(nuevosIncidentes).toHaveLength(1);
      expect(nuevosIncidentes[0].tipo).toBe("SIN_REPORTE");
      expect(nuevosIncidentes[0].severidad).toBe("WARNING");
      expect(nuevosIncidentes[0].medidorId).toBe(medidor1Id);
      expect(nuevosIncidentes[0].estado).toBe("ABIERTO");
    });

    it("debe asignar severidad CRITICAL si el medidor supera las 72 horas sin reporte", async () => {
      const ahora = new Date("2026-10-03T12:00:00Z");
      // Última lectura hace 80 horas
      const fechaLectura = new Date(ahora.getTime() - 80 * 3600 * 1000);

      repo.medidores = [
        {
          id: medidor1Id,
          codigo: "MED-AG-01",
          instalacionId: instId,
          instalacionNombre: "Planta Norte",
          recurso: "AGUA",
          activo: true,
          lecturas: [{ valor: 100, fechaLectura }],
        },
      ];

      const nuevosIncidentes = await service.evaluarReglas(ahora);

      expect(nuevosIncidentes).toHaveLength(1);
      expect(nuevosIncidentes[0].severidad).toBe("CRITICAL");
    });

    it("NO debe generar incidente si el medidor reportó hace menos de 48 horas", async () => {
      const ahora = new Date("2026-10-03T12:00:00Z");
      const fechaLectura = new Date(ahora.getTime() - 10 * 3600 * 1000); // 10 horas

      repo.medidores = [
        {
          id: medidor1Id,
          codigo: "MED-AG-01",
          instalacionId: instId,
          instalacionNombre: "Planta Norte",
          recurso: "AGUA",
          activo: true,
          lecturas: [{ valor: 100, fechaLectura }],
        },
      ];

      const nuevosIncidentes = await service.evaluarReglas(ahora);
      expect(nuevosIncidentes).toHaveLength(0);
    });
  });

  describe("Detección de Salto Atípico de Consumo", () => {
    it("debe disparar SALTO_CONSUMO cuando el delta excede el 50% del promedio histórico", async () => {
      const ahora = new Date("2026-10-03T12:00:00Z");
      // Promedios históricos de deltas = ~10 por período (100 -> 110 -> 120 -> 130)
      // Último delta = 200 - 130 = 70 (salto superior a +50% respecto al promedio de 10)
      repo.medidores = [
        {
          id: medidor1Id,
          codigo: "MED-LUZ-01",
          instalacionId: instId,
          instalacionNombre: "Planta Norte",
          recurso: "LUZ",
          activo: true,
          lecturas: [
            { valor: 100, fechaLectura: new Date(ahora.getTime() - 24 * 3600 * 1000) },
            { valor: 110, fechaLectura: new Date(ahora.getTime() - 18 * 3600 * 1000) },
            { valor: 120, fechaLectura: new Date(ahora.getTime() - 12 * 3600 * 1000) },
            { valor: 130, fechaLectura: new Date(ahora.getTime() - 6 * 3600 * 1000) },
            { valor: 146, fechaLectura: new Date(ahora.getTime() - 1 * 3600 * 1000) },
          ],
        },
      ];

      const nuevosIncidentes = await service.evaluarReglas(ahora);

      const salto = nuevosIncidentes.find((i) => i.tipo === "SALTO_CONSUMO");
      expect(salto).toBeDefined();
      expect(salto?.severidad).toBe("WARNING");
    });
  });

  describe("No duplicidad de incidentes abiertos", () => {
    it("no debe crear un nuevo incidente si ya existe uno ABIERTO del mismo tipo para el medidor", async () => {
      const ahora = new Date("2026-10-03T12:00:00Z");
      const fechaLectura = new Date(ahora.getTime() - 50 * 3600 * 1000);

      repo.medidores = [
        {
          id: medidor1Id,
          codigo: "MED-AG-01",
          instalacionId: instId,
          instalacionNombre: "Planta Norte",
          recurso: "AGUA",
          activo: true,
          lecturas: [{ valor: 100, fechaLectura }],
        },
      ];

      // Ya existe incidente abierto
      repo.incidentes = [
        {
          id: crypto.randomUUID(),
          medidorId: medidor1Id,
          instalacionId: instId,
          tipo: "SIN_REPORTE",
          severidad: "WARNING",
          mensaje: "Medidor sin reporte existente",
          estado: "ABIERTO",
          fechaDeteccion: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const nuevos = await service.evaluarReglas(ahora);
      expect(nuevos).toHaveLength(0);
    });
  });

  describe("Resolución y Resumen de Incidentes", () => {
    it("debe resolver un incidente cambiando su estado a RESUELTO y guardando notas", async () => {
      const incId = crypto.randomUUID();
      repo.incidentes = [
        {
          id: incId,
          medidorId: medidor1Id,
          instalacionId: instId,
          tipo: "SIN_REPORTE",
          severidad: "WARNING",
          mensaje: "Sin reporte",
          estado: "ABIERTO",
          fechaDeteccion: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const resuelto = await service.resolverIncidente(incId, {
        estado: "RESUELTO",
        notasResolucion: "Medidor reconectado por técnico de turno",
      });

      expect(resuelto.estado).toBe("RESUELTO");
      expect(resuelto.notasResolucion).toBe("Medidor reconectado por técnico de turno");
      expect(resuelto.fechaResolucion).toBeDefined();
    });

    it("debe lanzar IncidenteYaResueltoError si se intenta resolver un incidente ya RESUELTO", async () => {
      const incId = crypto.randomUUID();
      repo.incidentes = [
        {
          id: incId,
          medidorId: medidor1Id,
          instalacionId: instId,
          tipo: "SIN_REPORTE",
          severidad: "WARNING",
          mensaje: "Sin reporte",
          estado: "RESUELTO",
          fechaDeteccion: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      await expect(
        service.resolverIncidente(incId, {
          estado: "RESUELTO",
          notasResolucion: "Intento de resolver nuevamente",
        })
      ).rejects.toThrow(IncidenteYaResueltoError);
    });

    it("debe lanzar IncidenteNotFoundError si el incidente no existe", async () => {
      await expect(
        service.resolverIncidente(crypto.randomUUID(), {
          estado: "RESUELTO",
          notasResolucion: "Notas de resolución",
        })
      ).rejects.toThrow(IncidenteNotFoundError);
    });

    it("debe calcular correctamente el resumen de métricas de incidentes", async () => {
      repo.incidentes = [
        {
          id: crypto.randomUUID(),
          medidorId: medidor1Id,
          instalacionId: instId,
          tipo: "SIN_REPORTE",
          severidad: "CRITICAL",
          mensaje: "Alerta crítica",
          estado: "ABIERTO",
          fechaDeteccion: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: crypto.randomUUID(),
          medidorId: medidor1Id,
          instalacionId: instId,
          tipo: "SALTO_CONSUMO",
          severidad: "WARNING",
          mensaje: "Advertencia",
          estado: "ABIERTO",
          fechaDeteccion: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: crypto.randomUUID(),
          medidorId: medidor1Id,
          instalacionId: instId,
          tipo: "FUGA_PROBABLE",
          severidad: "INFO",
          mensaje: "Resuelto",
          estado: "RESUELTO",
          fechaDeteccion: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const resumen = await service.obtenerResumen();

      expect(resumen.totalAbiertos).toBe(2);
      expect(resumen.totalCriticos).toBe(1);
      expect(resumen.totalAdvertencias).toBe(1);
      expect(resumen.totalResueltos).toBe(1);
    });
  });
});
