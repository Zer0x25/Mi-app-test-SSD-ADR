import { describe, it, expect, beforeEach } from "vitest";
import {
  LecturasService,
  ILecturasRepository,
  LecturaEntity,
  IMedidorInfoService,
  IOperadorAccessService,
} from "../../../src/modules/lecturas/lecturas.service.js";
import {
  LecturaDecrecienteError,
  LecturaFechaFuturaError,
  LecturaDuplicadaError,
  OperadorNoAutorizadoError,
  MedidorInactivoError,
  MedidorNotFoundError,
} from "../../../src/modules/lecturas/lecturas.schema.js";

class InMemoryLecturasRepository implements ILecturasRepository {
  public lecturas: LecturaEntity[] = [];

  async findByMedidorAndFecha(medidorId: string, fechaLectura: Date): Promise<LecturaEntity | null> {
    const time = fechaLectura.getTime();
    return (
      this.lecturas.find(
        (l) => l.medidorId === medidorId && l.fechaLectura.getTime() === time
      ) || null
    );
  }

  async findUltimaLectura(medidorId: string): Promise<LecturaEntity | null> {
    const filtradas = this.lecturas
      .filter((l) => l.medidorId === medidorId)
      .sort((a, b) => b.fechaLectura.getTime() - a.fechaLectura.getTime());
    return filtradas[0] || null;
  }

  async create(data: Omit<LecturaEntity, "id" | "createdAt">): Promise<LecturaEntity> {
    const item: LecturaEntity = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
    };
    this.lecturas.push(item);
    return item;
  }

  async listByMedidor(medidorId: string): Promise<LecturaEntity[]> {
    return this.lecturas
      .filter((l) => l.medidorId === medidorId)
      .sort((a, b) => b.fechaLectura.getTime() - a.fechaLectura.getTime());
  }
}

class MockMedidorInfoService implements IMedidorInfoService {
  public medidores = new Map<
    string,
    {
      id: string;
      instalacionId: string;
      activo: boolean;
      tipoMedicion: "ACUMULATIVO" | "INSTANTANEO" | "NIVEL";
    }
  >();

  async getMedidorInfo(medidorId: string) {
    const m = this.medidores.get(medidorId);
    if (!m) return null;
    return m;
  }
}

class MockOperadorAccessService implements IOperadorAccessService {
  public asignaciones = new Set<string>(); // "operadorId:instalacionId"

  async isOperadorAssigned(operadorId: string, instalacionId: string): Promise<boolean> {
    return this.asignaciones.has(`${operadorId}:${instalacionId}`);
  }
}

describe("LecturasService Suite (Agentic TDD)", () => {
  let repository: InMemoryLecturasRepository;
  let medidorService: MockMedidorInfoService;
  let accessService: MockOperadorAccessService;
  let service: LecturasService;

  const instalacionId = crypto.randomUUID();
  const operadorId = crypto.randomUUID();
  const medidorAcumulativoId = crypto.randomUUID();
  const medidorNivelId = crypto.randomUUID();

  beforeEach(() => {
    repository = new InMemoryLecturasRepository();
    medidorService = new MockMedidorInfoService();
    accessService = new MockOperadorAccessService();
    service = new LecturasService(repository, medidorService, accessService);

    // Configurar acceso de operador a instalacion
    accessService.asignaciones.add(`${operadorId}:${instalacionId}`);

    // Configurar medidores
    medidorService.medidores.set(medidorAcumulativoId, {
      id: medidorAcumulativoId,
      instalacionId,
      activo: true,
      tipoMedicion: "ACUMULATIVO",
    });

    medidorService.medidores.set(medidorNivelId, {
      id: medidorNivelId,
      instalacionId,
      activo: true,
      tipoMedicion: "NIVEL",
    });
  });

  describe("Invariante de Autorización por Instalación", () => {
    it("debe lanzar OperadorNoAutorizadoError si el operador no está asignado a la instalación", async () => {
      const otroOperadorId = crypto.randomUUID();

      await expect(
        service.registrarLectura({
          medidorId: medidorAcumulativoId,
          operadorId: otroOperadorId,
          valor: 100,
        })
      ).rejects.toThrow(OperadorNoAutorizadoError);
    });
  });

  describe("Invariante de Medidor Válido y Activo", () => {
    it("debe lanzar MedidorNotFoundError si el medidor no existe", async () => {
      await expect(
        service.registrarLectura({
          medidorId: crypto.randomUUID(),
          operadorId,
          valor: 100,
        })
      ).rejects.toThrow(MedidorNotFoundError);
    });

    it("debe lanzar MedidorInactivoError si el medidor está inactivo", async () => {
      const medidorInactivoId = crypto.randomUUID();
      medidorService.medidores.set(medidorInactivoId, {
        id: medidorInactivoId,
        instalacionId,
        activo: false,
        tipoMedicion: "ACUMULATIVO",
      });

      await expect(
        service.registrarLectura({
          medidorId: medidorInactivoId,
          operadorId,
          valor: 100,
        })
      ).rejects.toThrow(MedidorInactivoError);
    });
  });

  describe("Invariante de Fecha Futura", () => {
    it("debe lanzar LecturaFechaFuturaError si la fecha es en el futuro", async () => {
      const fechaFutura = new Date(Date.now() + 60000); // 1 minuto en el futuro

      await expect(
        service.registrarLectura({
          medidorId: medidorAcumulativoId,
          operadorId,
          valor: 100,
          fechaLectura: fechaFutura,
        })
      ).rejects.toThrow(LecturaFechaFuturaError);
    });
  });

  describe("Invariante de No Decreciente en Medidores Acumulativos", () => {
    it("debe registrar con éxito si la lectura inicial es positiva", async () => {
      const lectura = await service.registrarLectura({
        medidorId: medidorAcumulativoId,
        operadorId,
        valor: 150.5,
      });

      expect(lectura).toBeDefined();
      expect(lectura.valor).toBe(150.5);
    });

    it("debe registrar con éxito si la lectura posterior es mayor o igual a la anterior", async () => {
      const t1 = new Date(Date.now() - 10000);
      const t2 = new Date(Date.now() - 5000);

      await service.registrarLectura({
        medidorId: medidorAcumulativoId,
        operadorId,
        valor: 200,
        fechaLectura: t1,
      });

      const l2 = await service.registrarLectura({
        medidorId: medidorAcumulativoId,
        operadorId,
        valor: 250,
        fechaLectura: t2,
      });

      expect(l2.valor).toBe(250);
    });

    it("debe lanzar LecturaDecrecienteError si la nueva lectura es menor que la anterior", async () => {
      const t1 = new Date(Date.now() - 10000);
      const t2 = new Date(Date.now() - 5000);

      await service.registrarLectura({
        medidorId: medidorAcumulativoId,
        operadorId,
        valor: 500,
        fechaLectura: t1,
      });

      await expect(
        service.registrarLectura({
          medidorId: medidorAcumulativoId,
          operadorId,
          valor: 480, // Menor que 500
          fechaLectura: t2,
        })
      ).rejects.toThrow(LecturaDecrecienteError);
    });

    it("debe permitir valores menores en medidores de NIVEL o INSTANTANEO", async () => {
      const t1 = new Date(Date.now() - 10000);
      const t2 = new Date(Date.now() - 5000);

      await service.registrarLectura({
        medidorId: medidorNivelId,
        operadorId,
        valor: 90, // Tanque al 90%
        fechaLectura: t1,
      });

      const l2 = await service.registrarLectura({
        medidorId: medidorNivelId,
        operadorId,
        valor: 65, // Disminuyó a 65%, válido para nivel
        fechaLectura: t2,
      });

      expect(l2.valor).toBe(65);
    });
  });

  describe("Invariante de Duplicados en Timestamp", () => {
    it("debe lanzar LecturaDuplicadaError si ya existe una lectura para el mismo timestamp exacto", async () => {
      const t = new Date(Date.now() - 10000);

      await service.registrarLectura({
        medidorId: medidorAcumulativoId,
        operadorId,
        valor: 100,
        fechaLectura: t,
      });

      await expect(
        service.registrarLectura({
          medidorId: medidorAcumulativoId,
          operadorId,
          valor: 110,
          fechaLectura: t,
        })
      ).rejects.toThrow(LecturaDuplicadaError);
    });
  });

  describe("Historial y Última Lectura", () => {
    it("debe consultar las lecturas ordenadas descendentemente", async () => {
      const t1 = new Date(Date.now() - 20000);
      const t2 = new Date(Date.now() - 10000);

      await service.registrarLectura({
        medidorId: medidorAcumulativoId,
        operadorId,
        valor: 100,
        fechaLectura: t1,
      });

      await service.registrarLectura({
        medidorId: medidorAcumulativoId,
        operadorId,
        valor: 120,
        fechaLectura: t2,
      });

      const historial = await service.listarLecturasPorMedidor(medidorAcumulativoId);
      expect(historial.length).toBe(2);
      expect(historial[0].valor).toBe(120);
      expect(historial[1].valor).toBe(100);

      const ultima = await service.obtenerUltimaLectura(medidorAcumulativoId);
      expect(ultima?.valor).toBe(120);
    });
  });
});
