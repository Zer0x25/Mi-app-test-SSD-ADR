import { describe, it, expect, beforeEach } from "vitest";
import {
  DashboardService,
  IDashboardRepository,
  DashboardRawData,
} from "../../../src/modules/dashboard/dashboard.service.js";

class InMemoryDashboardRepository implements IDashboardRepository {
  public data: DashboardRawData = {
    instalaciones: [],
    medidores: [],
    lecturas: [],
    recargas: [],
  };

  async getDashboardData(allowedInstalacionIds?: string[]): Promise<DashboardRawData> {
    if (allowedInstalacionIds === undefined) {
      return this.data;
    }
    const allowedSet = new Set(allowedInstalacionIds);
    const instalaciones = this.data.instalaciones.filter((i) => allowedSet.has(i.id));
    const medidores = this.data.medidores.filter((m) => allowedSet.has(m.instalacionId));
    const medidoresIds = new Set(medidores.map((m) => m.id));
    const lecturas = this.data.lecturas.filter((l) => medidoresIds.has(l.medidorId));
    const recargas = (this.data.recargas || []).filter((r) => medidoresIds.has(r.medidorId));
    return {
      instalaciones,
      medidores,
      lecturas,
      recargas,
    };
  }
}

describe("DashboardService Suite (Agentic TDD)", () => {
  let repository: InMemoryDashboardRepository;
  let service: DashboardService;

  const inst1Id = crypto.randomUUID();
  const inst2Id = crypto.randomUUID();
  const medidor1Id = crypto.randomUUID();
  const medidor2Id = crypto.randomUUID();
  const medidor3Id = crypto.randomUUID();

  beforeEach(() => {
    repository = new InMemoryDashboardRepository();
    service = new DashboardService(repository);

    repository.data = {
      instalaciones: [
        { id: inst1Id, nombre: "Planta Norte", activa: true },
        { id: inst2Id, nombre: "Planta Sur", activa: true },
        { id: crypto.randomUUID(), nombre: "Planta Inactiva", activa: false },
      ],
      medidores: [
        {
          id: medidor1Id,
          codigo: "MED-AG-01",
          instalacionId: inst1Id,
          instalacionNombre: "Planta Norte",
          ubicacionInterna: "Sala Bombas",
          recurso: "AGUA",
          unidad: "M3",
          tipoMedicion: "ACUMULATIVO",
          activo: true,
        },
        {
          id: medidor2Id,
          codigo: "MED-LUZ-01",
          instalacionId: inst1Id,
          instalacionNombre: "Planta Norte",
          ubicacionInterna: "Transformador",
          recurso: "LUZ",
          unidad: "KWH",
          tipoMedicion: "ACUMULATIVO",
          activo: true,
        },
        {
          id: medidor3Id,
          codigo: "MED-DIE-01",
          instalacionId: inst2Id,
          instalacionNombre: "Planta Sur",
          ubicacionInterna: "Tanque 1",
          recurso: "PETROLEO",
          unidad: "LITROS",
          tipoMedicion: "NIVEL",
          activo: true,
        },
        {
          id: crypto.randomUUID(),
          codigo: "MED-INACTIVO",
          instalacionId: inst2Id,
          instalacionNombre: "Planta Sur",
          ubicacionInterna: "Bodega",
          recurso: "GAS",
          unidad: "M3",
          tipoMedicion: "ACUMULATIVO",
          activo: false,
        },
      ],
      lecturas: [
        {
          id: crypto.randomUUID(),
          medidorId: medidor1Id,
          valor: 100,
          fechaLectura: new Date(Date.now() - 48 * 3600 * 1000), // Hace 48 horas
          operadorId: crypto.randomUUID(),
          notas: "Inicio",
        },
        {
          id: crypto.randomUUID(),
          medidorId: medidor1Id,
          valor: 150,
          fechaLectura: new Date(Date.now() - 30 * 3600 * 1000), // Hace 30 horas (desatendido > 24h)
          operadorId: crypto.randomUUID(),
          notas: "Cierre parcial",
        },
        {
          id: crypto.randomUUID(),
          medidorId: medidor2Id,
          valor: 500,
          fechaLectura: new Date(Date.now() - 2 * 3600 * 1000), // Hace 2 horas (activo al día)
          operadorId: crypto.randomUUID(),
          notas: "Turno mañana",
        },
        // medidor3Id nunca ha tenido lecturas
      ],
      recargas: [],
    };
  });

  describe("obtenerKpis", () => {
    it("debe calcular totales e histograma por recurso solo considerando entidades activas", async () => {
      const kpis = await service.obtenerKpis();

      expect(kpis.totalInstalaciones).toBe(2);
      expect(kpis.totalMedidores).toBe(3);
      expect(kpis.totalLecturas).toBe(3);
      expect(kpis.medidoresPorRecurso).toEqual({
        AGUA: 1,
        LUZ: 1,
        PETROLEO: 1,
      });
    });
  });

  describe("obtenerMedidoresDesatendidos", () => {
    it("debe retornar medidores cuya última lectura fue hace más de 24h o que nunca tuvieron lecturas", async () => {
      const desatendidos = await service.obtenerMedidoresDesatendidos(24);

      expect(desatendidos.length).toBe(2);

      // medidor1Id: última lectura hace 30h
      const d1 = desatendidos.find((d) => d.medidorId === medidor1Id);
      expect(d1).toBeDefined();
      expect(d1?.horasSinLectura).toBeGreaterThanOrEqual(29);

      // medidor3Id: sin lecturas nunca
      const d3 = desatendidos.find((d) => d.medidorId === medidor3Id);
      expect(d3).toBeDefined();
      expect(d3?.ultimaLecturaFecha).toBeNull();
      expect(d3?.horasSinLectura).toBeNull();

      // medidor2Id: no debe figurar (lectura hace 2 horas)
      expect(desatendidos.find((d) => d.medidorId === medidor2Id)).toBeUndefined();
    });
  });

  describe("obtenerConsumoPorInstalacion", () => {
    it("debe calcular el consumo neto (max - min) en medidores acumulativos", async () => {
      const consumos = await service.obtenerConsumoPorInstalacion();

      // Para Planta Norte / Agua: lecturas 100 y 150 -> consumo neto = 50 M3
      const consumoAgua = consumos.find(
        (c) => c.instalacionId === inst1Id && c.recurso === "AGUA"
      );
      expect(consumoAgua).toBeDefined();
      expect(consumoAgua?.consumoNeto).toBe(50);
      expect(consumoAgua?.unidad).toBe("M3");

      // Para Planta Norte / Luz: solo 1 lectura (500) -> consumo neto = 0
      const consumoLuz = consumos.find(
        (c) => c.instalacionId === inst1Id && c.recurso === "LUZ"
      );
      expect(consumoLuz).toBeDefined();
      expect(consumoLuz?.consumoNeto).toBe(0);
    });

    it("debe calcular consumo NIVEL como bajada más recargas (feat-024)", async () => {
      repository.data.lecturas.push(
        {
          id: crypto.randomUUID(),
          medidorId: medidor3Id,
          valor: 4800,
          fechaLectura: new Date(Date.now() - 72 * 3600 * 1000),
          operadorId: crypto.randomUUID(),
          notas: "Llenado",
        },
        {
          id: crypto.randomUUID(),
          medidorId: medidor3Id,
          valor: 4200,
          fechaLectura: new Date(Date.now() - 30 * 3600 * 1000),
          operadorId: crypto.randomUUID(),
          notas: "Consumo",
        }
      );
      repository.data.recargas.push({
        medidorId: medidor3Id,
        volumen: 1000,
        fecha: new Date(Date.now() - 40 * 3600 * 1000),
      });

      const consumos = await service.obtenerConsumoPorInstalacion();
      const consumoDiesel = consumos.find(
        (c) => c.instalacionId === inst2Id && c.recurso === "PETROLEO"
      );
      expect(consumoDiesel).toBeDefined();
      expect(consumoDiesel?.consumoNeto).toBe(1600);
    });
  });

  describe("obtenerActividadReciente", () => {
    it("debe retornar las lecturas recientes enriquecidas y ordenadas cronológicamente descendente", async () => {
      const feed = await service.obtenerActividadReciente(5);

      expect(feed.length).toBe(3);
      expect(feed[0].medidorCodigo).toBe("MED-LUZ-01"); // La más reciente (hace 2h)
      expect(feed[0].recurso).toBe("LUZ");
      expect(feed[0].instalacionNombre).toBe("Planta Norte");
    });
  });

  describe("Aislamiento Territorial (Location Scoping)", () => {
    it("debe computar KPIs, consumos y desatendidos exclusivamente para instalaciones permitidas", async () => {
      // Filtrar únicamente por inst1Id
      const kpis = await service.obtenerKpis([inst1Id]);
      expect(kpis.totalInstalaciones).toBe(1);
      expect(kpis.totalMedidores).toBe(2); // medidor1Id y medidor2Id

      const desatendidos = await service.obtenerMedidoresDesatendidos(24, [inst1Id]);
      expect(desatendidos.every((d) => d.instalacionId === inst1Id)).toBe(true);

      const consumos = await service.obtenerConsumoPorInstalacion([inst1Id]);
      expect(consumos.every((c) => c.instalacionId === inst1Id)).toBe(true);

      const actividad = await service.obtenerActividadReciente(10, [inst1Id]);
      expect(actividad.every((a) => a.medidorId === medidor1Id || a.medidorId === medidor2Id)).toBe(true);
    });
  });
});
