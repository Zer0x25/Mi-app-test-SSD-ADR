import {
  RegistrarLecturaInput,
  RegistrarLecturaInputSchema,
  LecturaResponse,
  LecturaDecrecienteError,
  LecturaFechaFuturaError,
  LecturaDuplicadaError,
  OperadorNoAutorizadoError,
  MedidorInactivoError,
  MedidorNotFoundError,
} from "./lecturas.schema.js";

export interface LecturaEntity {
  id: string;
  medidorId: string;
  operadorId: string;
  valor: number;
  fechaLectura: Date;
  notas?: string | null;
  createdAt: Date;
}

export interface ILecturasRepository {
  findByMedidorAndFecha(medidorId: string, fechaLectura: Date): Promise<LecturaEntity | null>;
  findUltimaLectura(medidorId: string): Promise<LecturaEntity | null>;
  create(data: Omit<LecturaEntity, "id" | "createdAt">): Promise<LecturaEntity>;
  listByMedidor(medidorId: string): Promise<LecturaEntity[]>;
}

export interface IMedidorInfoService {
  getMedidorInfo(medidorId: string): Promise<{
    id: string;
    instalacionId: string;
    activo: boolean;
    tipoMedicion: "ACUMULATIVO" | "INSTANTANEO" | "NIVEL";
  } | null>;
}

export interface IOperadorAccessService {
  isOperadorAssigned(operadorId: string, instalacionId: string): Promise<boolean>;
}

export class LecturasService {
  constructor(
    private readonly repository: ILecturasRepository,
    private readonly medidorService: IMedidorInfoService,
    private readonly accessService: IOperadorAccessService
  ) {}

  async registrarLectura(rawInput: RegistrarLecturaInput): Promise<LecturaResponse> {
    const input = RegistrarLecturaInputSchema.parse(rawInput);
    const fecha = input.fechaLectura ? new Date(input.fechaLectura) : new Date();

    // 1. Invariante: No permitir fechas futuras (tolerancia de 5 segundos)
    if (fecha.getTime() > Date.now() + 5000) {
      throw new LecturaFechaFuturaError(fecha);
    }

    // 2. Invariante: Existencia y estado activo del medidor
    const medidor = await this.medidorService.getMedidorInfo(input.medidorId);
    if (!medidor) {
      throw new MedidorNotFoundError(input.medidorId);
    }
    if (!medidor.activo) {
      throw new MedidorInactivoError(input.medidorId);
    }

    // 3. Invariante de autorización: Operador asignado a la instalación del medidor
    const tieneAcceso = await this.accessService.isOperadorAssigned(
      input.operadorId,
      medidor.instalacionId
    );
    if (!tieneAcceso) {
      throw new OperadorNoAutorizadoError(input.operadorId, medidor.instalacionId);
    }

    // 4. Invariante: No duplicados exactos en timestamp
    const existente = await this.repository.findByMedidorAndFecha(input.medidorId, fecha);
    if (existente) {
      throw new LecturaDuplicadaError(input.medidorId, fecha);
    }

    // 5. Invariante de No Decreciente en medidores acumulativos
    if (medidor.tipoMedicion === "ACUMULATIVO") {
      const ultimaLectura = await this.repository.findUltimaLectura(input.medidorId);
      if (ultimaLectura && input.valor < ultimaLectura.valor) {
        throw new LecturaDecrecienteError(
          input.medidorId,
          ultimaLectura.valor,
          input.valor
        );
      }
    }

    // 6. Persistencia inmutable
    return await this.repository.create({
      medidorId: input.medidorId,
      operadorId: input.operadorId,
      valor: input.valor,
      fechaLectura: fecha,
      notas: input.notas ? input.notas.trim() : null,
    });
  }

  async listarLecturasPorMedidor(medidorId: string): Promise<LecturaResponse[]> {
    const medidor = await this.medidorService.getMedidorInfo(medidorId);
    if (!medidor) {
      throw new MedidorNotFoundError(medidorId);
    }
    return await this.repository.listByMedidor(medidorId);
  }

  async obtenerUltimaLectura(medidorId: string): Promise<LecturaResponse | null> {
    const medidor = await this.medidorService.getMedidorInfo(medidorId);
    if (!medidor) {
      throw new MedidorNotFoundError(medidorId);
    }
    return await this.repository.findUltimaLectura(medidorId);
  }
}
