import {
  RegistrarMantenimientoInput,
  RegistrarMantenimientoInputSchema,
  FiltroMantenimientos,
  MantenimientoResponse,
  MedidorMantenimientoNotFoundError,
  LecturaRetiroInvalidaError,
  PrecintoNuevoRequeridoError,
  TipoMantenimiento,
} from "./mantenimiento.schema.js";

export interface MedidorMantenimientoInfo {
  id: string;
  codigo: string;
  instalacionId: string;
  instalacionNombre: string;
  tipoMedicion: string;
  activo: boolean;
  precintoActual?: string | null;
  fechaUltimaCalibracion?: Date | null;
  fechaProximaCalibracion?: Date | null;
  ultimaLecturaValor?: number | null;
}

export interface MantenimientoEntity {
  id: string;
  medidorId: string;
  medidorCodigo?: string;
  instalacionNombre?: string;
  tipo: TipoMantenimiento;
  fechaMantenimiento: Date;
  tecnicoResponsable: string;
  numeroPrecintoAnterior?: string | null;
  numeroPrecintoNuevo?: string | null;
  proximaCalibracion?: Date | null;
  certificadoCalibracion?: string | null;
  lecturaRetiro?: number | null;
  motivoBaja?: string | null;
  nuevoMedidorCodigo?: string | null;
  observaciones?: string | null;
  createdAt: Date;
}

export interface IMantenimientoRepository {
  findMedidorInfo(medidorId: string): Promise<MedidorMantenimientoInfo | null>;
  updateMedidor(
    medidorId: string,
    data: Partial<MedidorMantenimientoInfo>
  ): Promise<void>;
  createRegistro(
    data: Omit<MantenimientoEntity, "id" | "createdAt">
  ): Promise<MantenimientoEntity>;
  listRegistros(filtro?: FiltroMantenimientos): Promise<MantenimientoEntity[]>;
}

export class MantenimientoService {
  constructor(private readonly repository: IMantenimientoRepository) {}

  async registrarMantenimiento(
    rawInput: RegistrarMantenimientoInput
  ): Promise<MantenimientoResponse> {
    const input = RegistrarMantenimientoInputSchema.parse(rawInput);
    const medidor = await this.repository.findMedidorInfo(input.medidorId);

    if (!medidor) {
      throw new MedidorMantenimientoNotFoundError(input.medidorId);
    }

    // Regla 1: CAMBIO_PRECINTO exige nuevo precinto
    if (input.tipo === "CAMBIO_PRECINTO" && !input.numeroPrecintoNuevo) {
      throw new PrecintoNuevoRequeridoError(input.medidorId);
    }

    // Regla 2: En baja o reemplazo, validar lectura de retiro si el medidor es acumulativo
    if (
      (input.tipo === "BAJA_TECNICA" || input.tipo === "REEMPLAZO_EQUIPO") &&
      input.lecturaRetiro !== undefined &&
      input.lecturaRetiro !== null
    ) {
      if (
        medidor.tipoMedicion === "ACUMULATIVO" &&
        medidor.ultimaLecturaValor !== null &&
        medidor.ultimaLecturaValor !== undefined
      ) {
        if (input.lecturaRetiro < medidor.ultimaLecturaValor) {
          throw new LecturaRetiroInvalidaError(
            input.medidorId,
            input.lecturaRetiro,
            medidor.ultimaLecturaValor
          );
        }
      }
    }

    // Actualizaciones de estado en el medidor según tipo de evento
    const updateMedidorData: Partial<MedidorMantenimientoInfo> = {};

    if (input.tipo === "CALIBRACION") {
      updateMedidorData.fechaUltimaCalibracion = input.fechaMantenimiento;
      if (input.proximaCalibracion) {
        updateMedidorData.fechaProximaCalibracion = input.proximaCalibracion;
      }
    }

    if (input.tipo === "CAMBIO_PRECINTO" && input.numeroPrecintoNuevo) {
      updateMedidorData.precintoActual = input.numeroPrecintoNuevo;
    }

    if (input.tipo === "BAJA_TECNICA" || input.tipo === "REEMPLAZO_EQUIPO") {
      updateMedidorData.activo = false;
    }

    if (Object.keys(updateMedidorData).length > 0) {
      await this.repository.updateMedidor(input.medidorId, updateMedidorData);
    }

    const registro = await this.repository.createRegistro({
      medidorId: input.medidorId,
      medidorCodigo: medidor.codigo,
      instalacionNombre: medidor.instalacionNombre,
      tipo: input.tipo,
      fechaMantenimiento: input.fechaMantenimiento,
      tecnicoResponsable: input.tecnicoResponsable,
      numeroPrecintoAnterior:
        input.numeroPrecintoAnterior ?? medidor.precintoActual ?? null,
      numeroPrecintoNuevo: input.numeroPrecintoNuevo ?? null,
      proximaCalibracion: input.proximaCalibracion ?? null,
      certificadoCalibracion: input.certificadoCalibracion ?? null,
      lecturaRetiro: input.lecturaRetiro ?? null,
      motivoBaja: input.motivoBaja ?? null,
      nuevoMedidorCodigo: input.nuevoMedidorCodigo ?? null,
      observaciones: input.observaciones ?? null,
    });

    return {
      id: registro.id,
      medidorId: registro.medidorId,
      medidorCodigo: registro.medidorCodigo ?? medidor.codigo,
      instalacionNombre: registro.instalacionNombre ?? medidor.instalacionNombre,
      tipo: registro.tipo,
      fechaMantenimiento: registro.fechaMantenimiento,
      tecnicoResponsable: registro.tecnicoResponsable,
      numeroPrecintoAnterior: registro.numeroPrecintoAnterior ?? null,
      numeroPrecintoNuevo: registro.numeroPrecintoNuevo ?? null,
      proximaCalibracion: registro.proximaCalibracion ?? null,
      certificadoCalibracion: registro.certificadoCalibracion ?? null,
      lecturaRetiro: registro.lecturaRetiro ?? null,
      motivoBaja: registro.motivoBaja ?? null,
      nuevoMedidorCodigo: registro.nuevoMedidorCodigo ?? null,
      observaciones: registro.observaciones ?? null,
      createdAt: registro.createdAt,
    };
  }

  async listarMantenimientos(
    filtro?: FiltroMantenimientos
  ): Promise<MantenimientoResponse[]> {
    const list = await this.repository.listRegistros(filtro);
    return list.map((registro) => ({
      id: registro.id,
      medidorId: registro.medidorId,
      medidorCodigo: registro.medidorCodigo,
      instalacionNombre: registro.instalacionNombre,
      tipo: registro.tipo,
      fechaMantenimiento: registro.fechaMantenimiento,
      tecnicoResponsable: registro.tecnicoResponsable,
      numeroPrecintoAnterior: registro.numeroPrecintoAnterior ?? null,
      numeroPrecintoNuevo: registro.numeroPrecintoNuevo ?? null,
      proximaCalibracion: registro.proximaCalibracion ?? null,
      certificadoCalibracion: registro.certificadoCalibracion ?? null,
      lecturaRetiro: registro.lecturaRetiro ?? null,
      motivoBaja: registro.motivoBaja ?? null,
      nuevoMedidorCodigo: registro.nuevoMedidorCodigo ?? null,
      observaciones: registro.observaciones ?? null,
      createdAt: registro.createdAt,
    }));
  }

  async obtenerFichaMedidor(
    medidorId: string
  ): Promise<MedidorMantenimientoInfo & { historial: MantenimientoResponse[] }> {
    const medidor = await this.repository.findMedidorInfo(medidorId);
    if (!medidor) {
      throw new MedidorMantenimientoNotFoundError(medidorId);
    }
    const historial = await this.listarMantenimientos({ medidorId });
    return {
      ...medidor,
      historial,
    };
  }
}
