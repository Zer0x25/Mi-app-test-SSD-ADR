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
      unidadMedida: tipo.unidad,
      tipoMedicion: tipo.tipoMedicion as TipoMedicion,
      multiplicador: (tipo as unknown as { multiplicador?: number }).multiplicador ?? 1,
      capacidadMaxima: (tipo as unknown as { capacidadMaxima?: number | null }).capacidadMaxima ?? null,
    };
  }

  async findTipoByNombre(nombre: string): Promise<TipoMedidorEntity | null> {
    const tipo = await this.prisma.tipoMedidor.findUnique({ where: { nombre } });
    if (!tipo) return null;
    return {
      ...tipo,
      recurso: tipo.recurso as RecursoMedidor,
      unidad: tipo.unidad as UnidadMedida,
      unidadMedida: tipo.unidad,
      tipoMedicion: tipo.tipoMedicion as TipoMedicion,
      multiplicador: (tipo as unknown as { multiplicador?: number }).multiplicador ?? 1,
      capacidadMaxima: (tipo as unknown as { capacidadMaxima?: number | null }).capacidadMaxima ?? null,
    };
  }

  async createTipo(
    data: Omit<TipoMedidorEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<TipoMedidorEntity> {
    const tipo = await this.prisma.tipoMedidor.create({
      data: {
        nombre: data.nombre,
        recurso: data.recurso,
        unidad: data.unidad,
        tipoMedicion: data.tipoMedicion,
        multiplicador: data.multiplicador ?? 1,
        capacidadMaxima: data.capacidadMaxima ?? null,
        activo: data.activo,
      },
    });
    return {
      ...tipo,
      recurso: tipo.recurso as RecursoMedidor,
      unidad: tipo.unidad as UnidadMedida,
      unidadMedida: tipo.unidad,
      tipoMedicion: tipo.tipoMedicion as TipoMedicion,
      multiplicador: (tipo as unknown as { multiplicador?: number }).multiplicador ?? 1,
      capacidadMaxima: (tipo as unknown as { capacidadMaxima?: number | null }).capacidadMaxima ?? null,
    };
  }

  async listTiposActivos(): Promise<TipoMedidorEntity[]> {
    return this.listTipos("activos");
  }

  async listTipos(estado: "activos" | "archivados" | "todos" = "activos"): Promise<TipoMedidorEntity[]> {
    const where = estado === "activos" ? { activo: true } : estado === "archivados" ? { activo: false } : {};
    const list = await this.prisma.tipoMedidor.findMany({ where });
    return list.map((tipo) => ({
      ...tipo,
      recurso: tipo.recurso as RecursoMedidor,
      unidad: tipo.unidad as UnidadMedida,
      unidadMedida: tipo.unidad,
      tipoMedicion: tipo.tipoMedicion as TipoMedicion,
      multiplicador: (tipo as unknown as { multiplicador?: number }).multiplicador ?? 1,
      capacidadMaxima: (tipo as unknown as { capacidadMaxima?: number | null }).capacidadMaxima ?? null,
    }));
  }

  async updateTipo(id: string, data: Partial<TipoMedidorEntity>): Promise<TipoMedidorEntity> {
    const tipo = await this.prisma.tipoMedidor.update({
      where: { id },
      data: {
        ...(data.nombre !== undefined && { nombre: data.nombre }),
        ...(data.recurso !== undefined && { recurso: data.recurso }),
        ...(data.unidad !== undefined && { unidad: data.unidad }),
        ...(data.tipoMedicion !== undefined && { tipoMedicion: data.tipoMedicion }),
        ...(data.multiplicador !== undefined && { multiplicador: data.multiplicador }),
        ...(data.capacidadMaxima !== undefined && { capacidadMaxima: data.capacidadMaxima }),
        ...(data.activo !== undefined && { activo: data.activo }),
      },
    });
    return {
      ...tipo,
      recurso: tipo.recurso as RecursoMedidor,
      unidad: tipo.unidad as UnidadMedida,
      unidadMedida: tipo.unidad,
      tipoMedicion: tipo.tipoMedicion as TipoMedicion,
      multiplicador: (tipo as unknown as { multiplicador?: number }).multiplicador ?? 1,
      capacidadMaxima: (tipo as unknown as { capacidadMaxima?: number | null }).capacidadMaxima ?? null,
    };
  }

  async deleteTipoFisico(id: string): Promise<boolean> {
    const res = await this.prisma.tipoMedidor.delete({ where: { id } });
    return !!res;
  }

  async countMedidoresByTipo(tipoId: string): Promise<number> {
    return await this.prisma.medidor.count({ where: { tipoMedidorId: tipoId } });
  }

  async findMedidorById(id: string): Promise<MedidorEntity | null> {
    const m = await this.prisma.medidor.findUnique({
      where: { id },
      include: {
        tipoMedidor: true,
        lecturas: {
          orderBy: { fechaLectura: "desc" },
          take: 1,
        },
      },
    });
    if (!m) return null;
    const ult = m.lecturas?.[0];
    return {
      ...m,
      tipoMedidor: m.tipoMedidor
        ? {
            ...m.tipoMedidor,
            recurso: m.tipoMedidor.recurso as RecursoMedidor,
            unidad: m.tipoMedidor.unidad as UnidadMedida,
            unidadMedida: m.tipoMedidor.unidad,
            tipoMedicion: m.tipoMedidor.tipoMedicion as TipoMedicion,
          }
        : undefined,
      ultimaLectura: ult
        ? {
            valor: ult.valor,
            timestamp: ult.fechaLectura,
            fechaLectura: ult.fechaLectura,
            fecha: ult.fechaLectura,
          }
        : null,
    };
  }

  async findMedidorByCodigo(codigo: string): Promise<MedidorEntity | null> {
    const m = await this.prisma.medidor.findUnique({ where: { codigo } });
    if (!m) return null;
    return m as unknown as MedidorEntity;
  }

  async findMedidorByCodigoExterno(codigoExterno: string): Promise<MedidorEntity | null> {
    const m = await this.prisma.medidor.findUnique({ where: { codigoExterno } });
    if (!m) return null;
    return m as unknown as MedidorEntity;
  }

  async createMedidor(
    data: Omit<MedidorEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<MedidorEntity> {
    return (await this.prisma.medidor.create({
      data: {
        instalacionId: data.instalacionId,
        tipoMedidorId: data.tipoMedidorId,
        codigo: data.codigo,
        codigoExterno: data.codigoExterno ?? null,
        factorInstalacion: data.factorInstalacion ?? null,
        numeroSerie: data.numeroSerie,
        ubicacionInterna: data.ubicacionInterna,
        activo: data.activo,
      },
    })) as unknown as MedidorEntity;
  }

  async updateMedidor(id: string, data: Partial<MedidorEntity>): Promise<MedidorEntity> {
    return (await this.prisma.medidor.update({
      where: { id },
      data: {
        ...(data.tipoMedidorId !== undefined && { tipoMedidorId: data.tipoMedidorId }),
        ...(data.codigo !== undefined && { codigo: data.codigo }),
        ...(data.codigoExterno !== undefined && { codigoExterno: data.codigoExterno }),
        ...(data.factorInstalacion !== undefined && { factorInstalacion: data.factorInstalacion }),
        ...(data.numeroSerie !== undefined && { numeroSerie: data.numeroSerie }),
        ...(data.ubicacionInterna !== undefined && { ubicacionInterna: data.ubicacionInterna }),
        ...(data.activo !== undefined && { activo: data.activo }),
      },
    })) as unknown as MedidorEntity;
  }

  async countLecturas(medidorId: string): Promise<number> {
    return await this.prisma.lectura.count({
      where: { medidorId },
    });
  }

  async deleteMedidorFisico(id: string): Promise<boolean> {
    const res = await this.prisma.medidor.delete({
      where: { id },
    });
    return !!res;
  }

  async listMedidoresByInstalacion(
    instalacionId: string,
    estado?: "activos" | "archivados" | "todos"
  ): Promise<MedidorEntity[]> {
    const where: { instalacionId: string; activo?: boolean } = { instalacionId };
    if (estado === "activos" || !estado) {
      where.activo = true;
    } else if (estado === "archivados") {
      where.activo = false;
    }
    const list = await this.prisma.medidor.findMany({
      where,
      include: {
        tipoMedidor: true,
        lecturas: {
          orderBy: { fechaLectura: "desc" },
          take: 1,
        },
      },
    });
    return list.map((m) => {
      const ult = m.lecturas?.[0];
      return {
        ...m,
        tipoMedidor: m.tipoMedidor
          ? {
              ...m.tipoMedidor,
              recurso: m.tipoMedidor.recurso as RecursoMedidor,
              unidad: m.tipoMedidor.unidad as UnidadMedida,
              unidadMedida: m.tipoMedidor.unidad,
              tipoMedicion: m.tipoMedidor.tipoMedicion as TipoMedicion,
            }
          : undefined,
        ultimaLectura: ult
          ? {
              valor: ult.valor,
              timestamp: ult.fechaLectura,
              fechaLectura: ult.fechaLectura,
              fecha: ult.fechaLectura,
            }
          : null,
      };
    });
  }

  async listMedidores(
    instalacionIds?: string[],
    estado?: "activos" | "archivados" | "todos"
  ): Promise<MedidorEntity[]> {
    const where: { activo?: boolean; instalacionId?: { in: string[] } } = {};
    if (estado === "activos" || !estado) {
      where.activo = true;
    } else if (estado === "archivados") {
      where.activo = false;
    }
    if (instalacionIds !== undefined) {
      where.instalacionId = { in: instalacionIds };
    }
    const list = await this.prisma.medidor.findMany({
      where,
      include: {
        tipoMedidor: true,
        lecturas: {
          orderBy: { fechaLectura: "desc" },
          take: 1,
        },
      },
    });
    return list.map((m) => {
      const ult = m.lecturas?.[0];
      return {
        ...m,
        tipoMedidor: m.tipoMedidor
          ? {
              ...m.tipoMedidor,
              recurso: m.tipoMedidor.recurso as RecursoMedidor,
              unidad: m.tipoMedidor.unidad as UnidadMedida,
              unidadMedida: m.tipoMedidor.unidad,
              tipoMedicion: m.tipoMedidor.tipoMedicion as TipoMedicion,
            }
          : undefined,
        ultimaLectura: ult
          ? {
              valor: ult.valor,
              timestamp: ult.fechaLectura,
              fechaLectura: ult.fechaLectura,
              fecha: ult.fechaLectura,
            }
          : null,
      };
    });
  }
}
