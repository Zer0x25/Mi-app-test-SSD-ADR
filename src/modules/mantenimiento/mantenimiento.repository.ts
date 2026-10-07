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
    type PrismaCreated = {
      id: string;
      medidorId: string;
      tipo: string;
      fechaMantenimiento: Date;
      tecnicoResponsable: string;
      numeroPrecintoAnterior: string | null;
      numeroPrecintoNuevo: string | null;
      proximaCalibracion: Date | null;
      certificadoCalibracion: string | null;
      lecturaRetiro: number | null;
      motivoBaja: string | null;
      nuevoMedidorCodigo: string | null;
      volumenRecargado: number | null;
      nivelPosterior: number | null;
      observaciones: string | null;
      createdAt: Date;
      medidor: { codigo: string; instalacion: { nombre: string } };
    };
    const created = (await this.prisma.registroMantenimiento.create({
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
        volumenRecargado: data.volumenRecargado ?? null,
        nivelPosterior: data.nivelPosterior ?? null,
        observaciones: data.observaciones,
      },
      include: {
        medidor: {
          include: { instalacion: true },
        },
      },
    })) as unknown as PrismaCreated;

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
      volumenRecargado: created.volumenRecargado ?? null,
      nivelPosterior: created.nivelPosterior ?? null,
      observaciones: created.observaciones,
      createdAt: created.createdAt,
    };
  }

  async listRegistros(filtro?: FiltroMantenimientos, allowedInstalacionIds?: string[]): Promise<MantenimientoEntity[]> {
    const where: {
      medidorId?: string;
      medidor?: { instalacionId?: string | { in: string[] } };
      tipo?: string;
    } = {};

    if (filtro?.medidorId) where.medidorId = filtro.medidorId;
    if (filtro?.instalacionId) {
      where.medidor = { instalacionId: filtro.instalacionId };
    } else if (allowedInstalacionIds) {
      where.medidor = { instalacionId: { in: allowedInstalacionIds } };
    }
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
      volumenRecargado: (r as unknown as { volumenRecargado?: number | null }).volumenRecargado ?? null,
      nivelPosterior: (r as unknown as { nivelPosterior?: number | null }).nivelPosterior ?? null,
      observaciones: r.observaciones,
      createdAt: r.createdAt,
    }));
  }
}
