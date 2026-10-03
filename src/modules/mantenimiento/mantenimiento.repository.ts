import { PrismaClient } from "@prisma/client";
import {
  IMantenimientoRepository,
  MedidorMantenimientoInfo,
  MantenimientoEntity,
} from "./mantenimiento.service.js";
import {
  FiltroMantenimientos,
  TipoMantenimiento,
} from "./mantenimiento.schema.js";

export class PrismaMantenimientoRepository implements IMantenimientoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findMedidorInfo(medidorId: string): Promise<MedidorMantenimientoInfo | null> {
    const medidor = await this.prisma.medidor.findUnique({
      where: { id: medidorId },
      include: {
        instalacion: true,
        tipoMedidor: true,
        lecturas: {
          orderBy: { fechaLectura: "desc" },
          take: 1,
        },
      },
    });

    if (!medidor) return null;

    const ultimaLectura = medidor.lecturas[0]?.valor ?? null;

    return {
      id: medidor.id,
      codigo: medidor.codigo,
      instalacionId: medidor.instalacionId,
      instalacionNombre: medidor.instalacion.nombre,
      tipoMedicion: medidor.tipoMedidor.tipoMedicion,
      activo: medidor.activo,
      precintoActual: medidor.precintoActual,
      fechaUltimaCalibracion: medidor.fechaUltimaCalibracion,
      fechaProximaCalibracion: medidor.fechaProximaCalibracion,
      ultimaLecturaValor: ultimaLectura,
    };
  }

  async updateMedidor(
    medidorId: string,
    data: Partial<MedidorMantenimientoInfo>
  ): Promise<void> {
    await this.prisma.medidor.update({
      where: { id: medidorId },
      data: {
        activo: data.activo,
        precintoActual: data.precintoActual,
        fechaUltimaCalibracion: data.fechaUltimaCalibracion,
        fechaProximaCalibracion: data.fechaProximaCalibracion,
      },
    });
  }

  async createRegistro(
    data: Omit<MantenimientoEntity, "id" | "createdAt">
  ): Promise<MantenimientoEntity> {
    const created = await this.prisma.registroMantenimiento.create({
      data: {
        medidorId: data.medidorId,
        tipo: data.tipo,
        fechaMantenimiento: data.fechaMantenimiento,
        tecnicoResponsable: data.tecnicoResponsable,
        numeroPrecintoAnterior: data.numeroPrecintoAnterior,
        numeroPrecintoNuevo: data.numeroPrecintoNuevo,
        proximaCalibracion: data.proximaCalibracion,
        certificadoCalibracion: data.certificadoCalibracion,
        lecturaRetiro: data.lecturaRetiro,
        motivoBaja: data.motivoBaja,
        nuevoMedidorCodigo: data.nuevoMedidorCodigo,
        observaciones: data.observaciones,
      },
      include: {
        medidor: {
          include: { instalacion: true },
        },
      },
    });

    return {
      id: created.id,
      medidorId: created.medidorId,
      medidorCodigo: created.medidor.codigo,
      instalacionNombre: created.medidor.instalacion.nombre,
      tipo: created.tipo as TipoMantenimiento,
      fechaMantenimiento: created.fechaMantenimiento,
      tecnicoResponsable: created.tecnicoResponsable,
      numeroPrecintoAnterior: created.numeroPrecintoAnterior,
      numeroPrecintoNuevo: created.numeroPrecintoNuevo,
      proximaCalibracion: created.proximaCalibracion,
      certificadoCalibracion: created.certificadoCalibracion,
      lecturaRetiro: created.lecturaRetiro,
      motivoBaja: created.motivoBaja,
      nuevoMedidorCodigo: created.nuevoMedidorCodigo,
      observaciones: created.observaciones,
      createdAt: created.createdAt,
    };
  }

  async listRegistros(filtro?: FiltroMantenimientos): Promise<MantenimientoEntity[]> {
    const where: {
      medidorId?: string;
      medidor?: { instalacionId?: string };
      tipo?: string;
    } = {};

    if (filtro?.medidorId) where.medidorId = filtro.medidorId;
    if (filtro?.instalacionId) where.medidor = { instalacionId: filtro.instalacionId };
    if (filtro?.tipo) where.tipo = filtro.tipo;

    const list = await this.prisma.registroMantenimiento.findMany({
      where,
      include: {
        medidor: {
          include: { instalacion: true },
        },
      },
      orderBy: { fechaMantenimiento: "desc" },
    });

    return list.map((r) => ({
      id: r.id,
      medidorId: r.medidorId,
      medidorCodigo: r.medidor.codigo,
      instalacionNombre: r.medidor.instalacion.nombre,
      tipo: r.tipo as TipoMantenimiento,
      fechaMantenimiento: r.fechaMantenimiento,
      tecnicoResponsable: r.tecnicoResponsable,
      numeroPrecintoAnterior: r.numeroPrecintoAnterior,
      numeroPrecintoNuevo: r.numeroPrecintoNuevo,
      proximaCalibracion: r.proximaCalibracion,
      certificadoCalibracion: r.certificadoCalibracion,
      lecturaRetiro: r.lecturaRetiro,
      motivoBaja: r.motivoBaja,
      nuevoMedidorCodigo: r.nuevoMedidorCodigo,
      observaciones: r.observaciones,
      createdAt: r.createdAt,
    }));
  }
}
