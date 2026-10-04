import { PrismaClient } from "@prisma/client";
import {
  INotificacionesRepository,
  SuscripcionPushEntity,
  NotificacionHistorialEntity,
} from "./notificaciones.service.js";

export class PrismaNotificacionesRepository implements INotificacionesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertSuscripcion(data: {
    endpoint: string;
    p256dh: string;
    auth: string;
    usuarioId?: string | null;
  }): Promise<SuscripcionPushEntity> {
    const record = await this.prisma.suscripcionPush.upsert({
      where: { endpoint: data.endpoint },
      create: {
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        usuarioId: data.usuarioId ?? null,
        activa: true,
      },
      update: {
        p256dh: data.p256dh,
        auth: data.auth,
        usuarioId: data.usuarioId ?? undefined,
        activa: true,
      },
    });

    return record;
  }

  async desactivarSuscripcion(endpoint: string): Promise<boolean> {
    try {
      await this.prisma.suscripcionPush.update({
        where: { endpoint },
        data: { activa: false },
      });
      return true;
    } catch {
      return false;
    }
  }

  async findSuscripcionesActivas(): Promise<SuscripcionPushEntity[]> {
    return this.prisma.suscripcionPush.findMany({
      where: { activa: true },
    });
  }

  async crearHistorial(
    data: Omit<NotificacionHistorialEntity, "id" | "createdAt">
  ): Promise<NotificacionHistorialEntity> {
    return this.prisma.notificacionHistorial.create({
      data: {
        canal: data.canal,
        destinatario: data.destinatario,
        evento: data.evento,
        severidad: data.severidad,
        titulo: data.titulo,
        exitoso: data.exitoso,
        statusCode: data.statusCode ?? null,
        error: data.error ?? null,
        duracionMs: data.duracionMs ?? null,
      },
    });
  }

  async listHistorial(limit = 50): Promise<NotificacionHistorialEntity[]> {
    return this.prisma.notificacionHistorial.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
    });
  }
}
