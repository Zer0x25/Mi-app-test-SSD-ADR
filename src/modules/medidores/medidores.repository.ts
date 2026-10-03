import { PrismaClient } from "@prisma/client";
import {
  IMedidoresRepository,
  TipoMedidorEntity,
  MedidorEntity,
} from "./medidores.service.js";
import { RecursoMedidor, UnidadMedida, TipoMedicion } from "./medidores.schema.js";

export class PrismaMedidoresRepository implements IMedidoresRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findTipoById(id: string): Promise<TipoMedidorEntity | null> {
    const tipo = await this.prisma.tipoMedidor.findUnique({ where: { id } });
    if (!tipo) return null;
    return {
      ...tipo,
      recurso: tipo.recurso as RecursoMedidor,
      unidad: tipo.unidad as UnidadMedida,
      tipoMedicion: tipo.tipoMedicion as TipoMedicion,
    };
  }

  async findTipoByNombre(nombre: string): Promise<TipoMedidorEntity | null> {
    const tipo = await this.prisma.tipoMedidor.findUnique({ where: { nombre } });
    if (!tipo) return null;
    return {
      ...tipo,
      recurso: tipo.recurso as RecursoMedidor,
      unidad: tipo.unidad as UnidadMedida,
      tipoMedicion: tipo.tipoMedicion as TipoMedicion,
    };
  }

  async createTipo(
    data: Omit<TipoMedidorEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<TipoMedidorEntity> {
    const tipo = await this.prisma.tipoMedidor.create({ data });
    return {
      ...tipo,
      recurso: tipo.recurso as RecursoMedidor,
      unidad: tipo.unidad as UnidadMedida,
      tipoMedicion: tipo.tipoMedicion as TipoMedicion,
    };
  }

  async listTiposActivos(): Promise<TipoMedidorEntity[]> {
    const list = await this.prisma.tipoMedidor.findMany({ where: { activo: true } });
    return list.map((tipo) => ({
      ...tipo,
      recurso: tipo.recurso as RecursoMedidor,
      unidad: tipo.unidad as UnidadMedida,
      tipoMedicion: tipo.tipoMedicion as TipoMedicion,
    }));
  }

  async findMedidorById(id: string): Promise<MedidorEntity | null> {
    const m = await this.prisma.medidor.findUnique({
      where: { id },
      include: { tipoMedidor: true },
    });
    if (!m) return null;
    return {
      ...m,
      tipoMedidor: m.tipoMedidor
        ? {
            ...m.tipoMedidor,
            recurso: m.tipoMedidor.recurso as RecursoMedidor,
            unidad: m.tipoMedidor.unidad as UnidadMedida,
            tipoMedicion: m.tipoMedidor.tipoMedicion as TipoMedicion,
          }
        : undefined,
    };
  }

  async findMedidorByCodigo(codigo: string): Promise<MedidorEntity | null> {
    const m = await this.prisma.medidor.findUnique({ where: { codigo } });
    if (!m) return null;
    return m;
  }

  async createMedidor(
    data: Omit<MedidorEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<MedidorEntity> {
    return await this.prisma.medidor.create({
      data: {
        instalacionId: data.instalacionId,
        tipoMedidorId: data.tipoMedidorId,
        codigo: data.codigo,
        numeroSerie: data.numeroSerie,
        ubicacionInterna: data.ubicacionInterna,
        activo: data.activo,
      },
    });
  }

  async updateMedidor(id: string, data: Partial<MedidorEntity>): Promise<MedidorEntity> {
    return await this.prisma.medidor.update({
      where: { id },
      data: {
        ...(data.codigo !== undefined && { codigo: data.codigo }),
        ...(data.numeroSerie !== undefined && { numeroSerie: data.numeroSerie }),
        ...(data.ubicacionInterna !== undefined && { ubicacionInterna: data.ubicacionInterna }),
        ...(data.activo !== undefined && { activo: data.activo }),
      },
    });
  }

  async listMedidoresByInstalacion(instalacionId: string): Promise<MedidorEntity[]> {
    const list = await this.prisma.medidor.findMany({
      where: { instalacionId, activo: true },
      include: { tipoMedidor: true },
    });
    return list.map((m) => ({
      ...m,
      tipoMedidor: m.tipoMedidor
        ? {
            ...m.tipoMedidor,
            recurso: m.tipoMedidor.recurso as RecursoMedidor,
            unidad: m.tipoMedidor.unidad as UnidadMedida,
            tipoMedicion: m.tipoMedidor.tipoMedicion as TipoMedicion,
          }
        : undefined,
    }));
  }
}
