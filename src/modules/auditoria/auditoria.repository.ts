import { PrismaClient, Prisma } from "@prisma/client";
import {
  IAuditoriaRepository,
  AuditoriaEntity,
} from "./auditoria.service.js";
import { FiltroAuditoria } from "./auditoria.schema.js";

export class PrismaAuditoriaRepository implements IAuditoriaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: Omit<AuditoriaEntity, "id" | "createdAt">): Promise<AuditoriaEntity> {
    const record = await this.prisma.auditoriaEvento.create({
      data: {
        usuarioId: data.usuarioId,
        accion: data.accion,
        entidad: data.entidad,
        entidadId: data.entidadId,
        detalles: data.detalles,
        ip: data.ip,
      },
    });

    return record;
  }

  async list(filtro?: FiltroAuditoria): Promise<AuditoriaEntity[]> {
    const where: Prisma.AuditoriaEventoWhereInput = {};

    if (filtro?.accion) {
      where.accion = filtro.accion;
    }

    if (filtro?.entidad) {
      where.entidad = filtro.entidad;
    }

    if (filtro?.entidadId) {
      where.entidadId = filtro.entidadId;
    }

    if (filtro?.usuarioId) {
      where.usuarioId = filtro.usuarioId;
    }

    if (filtro?.desde || filtro?.hasta) {
      where.createdAt = {};
      if (filtro.desde) {
        where.createdAt.gte = filtro.desde;
      }
      if (filtro.hasta) {
        where.createdAt.lte = filtro.hasta;
      }
    }

    const records = await this.prisma.auditoriaEvento.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      take: filtro?.limit ?? 50,
      skip: filtro?.offset ?? 0,
    });

    return records;
  }
}
