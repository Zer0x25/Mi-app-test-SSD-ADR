import { PrismaClient, Prisma } from "@prisma/client";
import {
  IWebhooksRepository,
  WebhookEntity,
  WebhookEntregaEntity,
} from "./webhooks.service.js";

export class PrismaWebhooksRepository implements IWebhooksRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: Omit<WebhookEntity, "id" | "createdAt" | "updatedAt">): Promise<WebhookEntity> {
    const record = await this.prisma.webhookEndpoint.create({
      data: {
        url: data.url,
        descripcion: data.descripcion,
        secret: data.secret,
        eventos: data.eventos,
        activo: data.activo,
      },
    });

    return record;
  }

  async findById(id: string): Promise<WebhookEntity | null> {
    const record = await this.prisma.webhookEndpoint.findUnique({
      where: { id },
    });
    return record;
  }

  async update(id: string, data: Partial<WebhookEntity>): Promise<WebhookEntity> {
    const updateInput: Prisma.WebhookEndpointUpdateInput = {};
    if (data.url !== undefined) updateInput.url = data.url;
    if (data.descripcion !== undefined) updateInput.descripcion = data.descripcion;
    if (data.secret !== undefined) updateInput.secret = data.secret;
    if (data.eventos !== undefined) updateInput.eventos = data.eventos;
    if (data.activo !== undefined) updateInput.activo = data.activo;

    const record = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: updateInput,
    });
    return record;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.webhookEndpoint.delete({
      where: { id },
    });
  }

  async list(filtro?: { activo?: boolean }): Promise<WebhookEntity[]> {
    const where: Prisma.WebhookEndpointWhereInput = {};
    if (filtro?.activo !== undefined) {
      where.activo = filtro.activo;
    }

    const records = await this.prisma.webhookEndpoint.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return records;
  }

  async createEntrega(
    data: Omit<WebhookEntregaEntity, "id" | "createdAt">
  ): Promise<WebhookEntregaEntity> {
    const record = await this.prisma.webhookEntrega.create({
      data: {
        webhookId: data.webhookId,
        evento: data.evento,
        url: data.url,
        statusCode: data.statusCode ?? null,
        exitoso: data.exitoso,
        error: data.error ?? null,
        duracionMs: data.duracionMs ?? null,
      },
    });
    return record;
  }

  async listEntregas(webhookId?: string, limit: number = 50): Promise<WebhookEntregaEntity[]> {
    const where: Prisma.WebhookEntregaWhereInput = {};
    if (webhookId) {
      where.webhookId = webhookId;
    }

    const records = await this.prisma.webhookEntrega.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return records;
  }
}
