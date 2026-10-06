import { PrismaClient } from "@prisma/client";
import {
  IInstalacionesRepository,
  InstalacionEntity,
  AsignacionEntity,
} from "./instalaciones.service.js";

export class PrismaInstalacionesRepository implements IInstalacionesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<InstalacionEntity | null> {
    return await this.prisma.instalacion.findUnique({
      where: { id },
    });
  }

  async findByNombre(nombre: string): Promise<InstalacionEntity | null> {
    return await this.prisma.instalacion.findUnique({
      where: { nombre },
    });
  }

  async findByCodigo(codigo: string): Promise<InstalacionEntity | null> {
    return await this.prisma.instalacion.findUnique({
      where: { codigo },
    });
  }

  async countMedidores(instalacionId: string): Promise<number> {
    return await this.prisma.medidor.count({
      where: { instalacionId },
    });
  }

  async countMedidoresActivos(instalacionId: string): Promise<number> {
    return await this.prisma.medidor.count({
      where: { instalacionId, activo: true },
    });
  }

  async deleteFisico(id: string): Promise<boolean> {
    const res = await this.prisma.instalacion.delete({
      where: { id },
    });
    return !!res;
  }

  async listAll(
    filtros?: { estado?: "activas" | "archivadas" | "todas"; allowedIds?: string[] }
  ): Promise<InstalacionEntity[]> {
    const where: { activa?: boolean; id?: { in: string[] } } = {};
    if (filtros?.allowedIds !== undefined) {
      where.id = { in: filtros.allowedIds };
    }
    if (filtros?.estado === "activas") {
      where.activa = true;
    } else if (filtros?.estado === "archivadas") {
      where.activa = false;
    }
    return await this.prisma.instalacion.findMany({
      where,
      orderBy: { nombre: "asc" },
    });
  }

  async create(
    data: Omit<InstalacionEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<InstalacionEntity> {
    return await this.prisma.instalacion.create({
      data,
    });
  }

  async update(id: string, data: Partial<InstalacionEntity>): Promise<InstalacionEntity> {
    return await this.prisma.instalacion.update({
      where: { id },
      data,
    });
  }

  async findAsignacion(
    instalacionId: string,
    usuarioId: string
  ): Promise<AsignacionEntity | null> {
    return await this.prisma.asignacionOperador.findUnique({
      where: {
        instalacionId_usuarioId: {
          instalacionId,
          usuarioId,
        },
      },
    });
  }

  async createAsignacion(
    instalacionId: string,
    usuarioId: string
  ): Promise<AsignacionEntity> {
    return await this.prisma.asignacionOperador.create({
      data: {
        instalacionId,
        usuarioId,
      },
    });
  }

  async deleteAsignacion(instalacionId: string, usuarioId: string): Promise<boolean> {
    const res = await this.prisma.asignacionOperador.deleteMany({
      where: {
        instalacionId,
        usuarioId,
      },
    });
    return res.count > 0;
  }

  async listInstalacionesByOperador(usuarioId: string): Promise<InstalacionEntity[]> {
    const asignaciones = await this.prisma.asignacionOperador.findMany({
      where: { usuarioId },
      include: {
        instalacion: true,
      },
    });

    return asignaciones
      .map((a) => a.instalacion)
      .filter((i) => i.activa === true);
  }
}
