import crypto from "node:crypto";
import {
  CrearWebhookInput,
  CrearWebhookInputSchema,
  ActualizarWebhookInput,
  ActualizarWebhookInputSchema,
  WebhookEndpointResponse,
  WebhookEntregaResponse,
  WebhookPayload,
  WebhookEventType,
  TestWebhookResult,
  WebhookNotFoundError,
} from "./webhooks.schema.js";

export interface WebhookEntity {
  id: string;
  url: string;
  descripcion: string;
  secret?: string | null;
  eventos: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEntregaEntity {
  id: string;
  webhookId: string;
  evento: string;
  url: string;
  statusCode?: number | null;
  exitoso: boolean;
  error?: string | null;
  duracionMs?: number | null;
  createdAt: Date;
}

export interface IWebhooksRepository {
  create(data: Omit<WebhookEntity, "id" | "createdAt" | "updatedAt">): Promise<WebhookEntity>;
  findById(id: string): Promise<WebhookEntity | null>;
  update(id: string, data: Partial<WebhookEntity>): Promise<WebhookEntity>;
  delete(id: string): Promise<void>;
  list(filtro?: { activo?: boolean }): Promise<WebhookEntity[]>;
  createEntrega(data: Omit<WebhookEntregaEntity, "id" | "createdAt">): Promise<WebhookEntregaEntity>;
  listEntregas(webhookId?: string, limit?: number): Promise<WebhookEntregaEntity[]>;
}

export class WebhookDispatcherService {
  constructor(private readonly repository: IWebhooksRepository) {}

  private parseEventos(raw: string): string[] {
    if (!raw) return ["*"];
    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Fallback a coma
      }
    }
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }

  private mapEndpointResponse(entity: WebhookEntity): WebhookEndpointResponse {
    return {
      id: entity.id,
      url: entity.url,
      descripcion: entity.descripcion,
      eventos: this.parseEventos(entity.eventos),
      activo: entity.activo,
      hasSecret: Boolean(entity.secret && entity.secret.trim().length > 0),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  async crearWebhook(rawInput: CrearWebhookInput): Promise<WebhookEndpointResponse> {
    const input = CrearWebhookInputSchema.parse(rawInput);
    const created = await this.repository.create({
      url: input.url,
      descripcion: input.descripcion,
      secret: input.secret ?? null,
      eventos: JSON.stringify(input.eventos),
      activo: input.activo,
    });
    return this.mapEndpointResponse(created);
  }

  async actualizarWebhook(
    id: string,
    rawInput: ActualizarWebhookInput
  ): Promise<WebhookEndpointResponse> {
    const input = ActualizarWebhookInputSchema.parse(rawInput);
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new WebhookNotFoundError(id);
    }

    const updateData: Partial<WebhookEntity> = {};
    if (input.url !== undefined) updateData.url = input.url;
    if (input.descripcion !== undefined) updateData.descripcion = input.descripcion;
    if (input.secret !== undefined) updateData.secret = input.secret;
    if (input.eventos !== undefined) updateData.eventos = JSON.stringify(input.eventos);
    if (input.activo !== undefined) updateData.activo = input.activo;

    const updated = await this.repository.update(id, updateData);
    return this.mapEndpointResponse(updated);
  }

  async obtenerWebhook(id: string): Promise<WebhookEndpointResponse> {
    const item = await this.repository.findById(id);
    if (!item) {
      throw new WebhookNotFoundError(id);
    }
    return this.mapEndpointResponse(item);
  }

  async eliminarWebhook(id: string): Promise<void> {
    const item = await this.repository.findById(id);
    if (!item) {
      throw new WebhookNotFoundError(id);
    }
    await this.repository.delete(id);
  }

  async listarWebhooks(filtro?: { activo?: boolean }): Promise<WebhookEndpointResponse[]> {
    const list = await this.repository.list(filtro);
    return list.map((item) => this.mapEndpointResponse(item));
  }

  calcularFirma(payloadString: string, secret: string): string {
    const hmac = crypto.createHmac("sha256", secret).update(payloadString).digest("hex");
    return `sha256=${hmac}`;
  }

  async despacharEvento(
    eventoInput: Omit<WebhookPayload, "id" | "timestamp"> & {
      id?: string;
      timestamp?: string;
    }
  ): Promise<WebhookEntregaResponse[]> {
    const fullPayload: WebhookPayload = {
      id: eventoInput.id ?? crypto.randomUUID(),
      timestamp: eventoInput.timestamp ?? new Date().toISOString(),
      event: eventoInput.event,
      severity: eventoInput.severity,
      title: eventoInput.title,
      message: eventoInput.message,
      data: eventoInput.data,
    };

    const payloadString = JSON.stringify(fullPayload);
    const endpoints = await this.repository.list({ activo: true });

    // Filtrar solo endpoints suscritos al evento o a "*"
    const endpointsSuscritos = endpoints.filter((ep) => {
      const evs = this.parseEventos(ep.eventos);
      return evs.includes("*") || evs.includes(fullPayload.event);
    });

    if (endpointsSuscritos.length === 0) {
      return [];
    }

    const envios = endpointsSuscritos.map(async (endpoint): Promise<WebhookEntregaResponse> => {
      return this.enviarAEndpoint(endpoint, fullPayload, payloadString);
    });

    const resultados = await Promise.allSettled(envios);

    return resultados
      .filter(
        (r): r is PromiseFulfilledResult<WebhookEntregaResponse> => r.status === "fulfilled"
      )
      .map((r) => r.value);
  }

  private async enviarAEndpoint(
    endpoint: WebhookEntity,
    payload: WebhookPayload,
    payloadString: string
  ): Promise<WebhookEntregaResponse> {
    const startTime = Date.now();
    const deliveryId = crypto.randomUUID();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "SistemaMedidores-Webhook-Dispatcher/1.0",
      "X-Webhook-Event": payload.event,
      "X-Webhook-Delivery-Id": deliveryId,
      "X-Webhook-Timestamp": payload.timestamp,
    };

    if (endpoint.secret && endpoint.secret.trim().length > 0) {
      headers["X-Webhook-Signature"] = this.calcularFirma(payloadString, endpoint.secret);
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 5000);

    let statusCode: number | null = null;
    let exitoso = false;
    let errorMsg: string | null = null;

    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      statusCode = response.status;
      exitoso = response.ok;
      if (!response.ok) {
        const bodySnippet = await response.text().catch(() => "");
        errorMsg = `HTTP ${response.status}: ${bodySnippet.slice(0, 200)}`;
      }
    } catch (err: unknown) {
      exitoso = false;
      if (err instanceof Error) {
        errorMsg = err.name === "AbortError" ? "Timeout de conexión (5000ms)" : err.message;
      } else {
        errorMsg = String(err);
      }
    } finally {
      clearTimeout(timeoutHandle);
    }

    const duracionMs = Date.now() - startTime;

    const entrega = await this.repository.createEntrega({
      webhookId: endpoint.id,
      evento: payload.event,
      url: endpoint.url,
      statusCode,
      exitoso,
      error: errorMsg,
      duracionMs,
    });

    return {
      id: entrega.id,
      webhookId: entrega.webhookId,
      evento: entrega.evento,
      url: entrega.url,
      statusCode: entrega.statusCode ?? null,
      exitoso: entrega.exitoso,
      error: entrega.error ?? null,
      duracionMs: entrega.duracionMs ?? null,
      createdAt: entrega.createdAt,
    };
  }

  async testWebhook(id: string, evento: WebhookEventType = "test.ping"): Promise<TestWebhookResult> {
    const endpoint = await this.repository.findById(id);
    if (!endpoint) {
      throw new WebhookNotFoundError(id);
    }

    const testPayload: WebhookPayload = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      event: evento,
      severity: "INFO",
      title: "Test Ping de Conectividad - Sistema Medidores",
      message: "Este es un mensaje de prueba para verificar la integración con el enrutador de webhooks.",
      data: {
        webhookId: endpoint.id,
        descripcion: endpoint.descripcion,
        timestamp: new Date().toISOString(),
      },
    };

    const entrega = await this.enviarAEndpoint(endpoint, testPayload, JSON.stringify(testPayload));

    return {
      exitoso: entrega.exitoso,
      statusCode: entrega.statusCode,
      duracionMs: entrega.duracionMs ?? 0,
      error: entrega.error,
    };
  }

  async listarEntregas(webhookId?: string, limit: number = 50): Promise<WebhookEntregaResponse[]> {
    const list = await this.repository.listEntregas(webhookId, limit);
    return list.map((e) => ({
      id: e.id,
      webhookId: e.webhookId,
      evento: e.evento,
      url: e.url,
      statusCode: e.statusCode ?? null,
      exitoso: e.exitoso,
      error: e.error ?? null,
      duracionMs: e.duracionMs ?? null,
      createdAt: e.createdAt,
    }));
  }
}
