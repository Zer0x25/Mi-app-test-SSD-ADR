import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  WebhookDispatcherService,
  IWebhooksRepository,
  WebhookEntity,
  WebhookEntregaEntity,
} from "../../../src/modules/webhooks/webhooks.service.js";
import {
  WebhookNotFoundError,
} from "../../../src/modules/webhooks/webhooks.schema.js";
import crypto from "node:crypto";

class InMemoryWebhooksRepository implements IWebhooksRepository {
  private webhooks: WebhookEntity[] = [];
  private entregas: WebhookEntregaEntity[] = [];

  async create(data: Omit<WebhookEntity, "id" | "createdAt" | "updatedAt">): Promise<WebhookEntity> {
    const item: WebhookEntity = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.webhooks.push(item);
    return item;
  }

  async findById(id: string): Promise<WebhookEntity | null> {
    return this.webhooks.find((w) => w.id === id) ?? null;
  }

  async update(id: string, data: Partial<WebhookEntity>): Promise<WebhookEntity> {
    const idx = this.webhooks.findIndex((w) => w.id === id);
    if (idx === -1) throw new WebhookNotFoundError(id);
    this.webhooks[idx] = {
      ...this.webhooks[idx],
      ...data,
      updatedAt: new Date(),
    };
    return this.webhooks[idx];
  }

  async delete(id: string): Promise<void> {
    this.webhooks = this.webhooks.filter((w) => w.id !== id);
  }

  async list(filtro?: { activo?: boolean }): Promise<WebhookEntity[]> {
    if (filtro && filtro.activo !== undefined) {
      return this.webhooks.filter((w) => w.activo === filtro.activo);
    }
    return [...this.webhooks];
  }

  async createEntrega(data: Omit<WebhookEntregaEntity, "id" | "createdAt">): Promise<WebhookEntregaEntity> {
    const entrega: WebhookEntregaEntity = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
    };
    this.entregas.push(entrega);
    return entrega;
  }

  async listEntregas(webhookId?: string, limit?: number): Promise<WebhookEntregaEntity[]> {
    let result = [...this.entregas];
    if (webhookId) {
      result = result.filter((e) => e.webhookId === webhookId);
    }
    result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (limit) {
      result = result.slice(0, limit);
    }
    return result;
  }
}

describe("WebhookDispatcherService Suite (Agentic TDD)", () => {
  let repository: InMemoryWebhooksRepository;
  let service: WebhookDispatcherService;

  beforeEach(() => {
    repository = new InMemoryWebhooksRepository();
    service = new WebhookDispatcherService(repository);
    vi.restoreAllMocks();
  });

  describe("CRUD de WebhookEndpoints", () => {
    it("debe crear un webhook exitosamente", async () => {
      const created = await service.crearWebhook({
        url: "https://router.mismapp.internal/alerts",
        descripcion: "Router Central Mismapp",
        secret: "supersecret123",
        eventos: ["alerta.incidente_detectado"],
        activo: true,
      });

      expect(created.id).toBeDefined();
      expect(created.url).toBe("https://router.mismapp.internal/alerts");
      expect(created.descripcion).toBe("Router Central Mismapp");
      expect(created.hasSecret).toBe(true);
      expect(created.eventos).toEqual(["alerta.incidente_detectado"]);
      expect(created.activo).toBe(true);
    });

    it("debe listar webhooks ocultando el secreto plano (hasSecret: true)", async () => {
      await service.crearWebhook({
        url: "https://webhook1.test",
        descripcion: "Webhook 1",
        secret: "secreto12345",
      });
      await service.crearWebhook({
        url: "https://webhook2.test",
        descripcion: "Webhook 2",
        secret: null,
      });

      const list = await service.listarWebhooks();
      expect(list.length).toBe(2);
      expect(list[0].hasSecret).toBe(true);
      expect(list[1].hasSecret).toBe(false);
    });

    it("debe actualizar un webhook existente", async () => {
      const created = await service.crearWebhook({
        url: "https://old.test",
        descripcion: "Old Webhook",
      });

      const updated = await service.actualizarWebhook(created.id, {
        url: "https://new.test",
        activo: false,
      });

      expect(updated.url).toBe("https://new.test");
      expect(updated.activo).toBe(false);
    });

    it("debe lanzar WebhookNotFoundError al intentar actualizar un webhook inexistente", async () => {
      await expect(
        service.actualizarWebhook("id-inexistente", { descripcion: "Test" })
      ).rejects.toThrow(WebhookNotFoundError);
    });

    it("debe eliminar un webhook existente", async () => {
      const created = await service.crearWebhook({
        url: "https://todelete.test",
        descripcion: "Para Borrar",
      });

      await service.eliminarWebhook(created.id);
      const list = await service.listarWebhooks();
      expect(list.length).toBe(0);
    });
  });

  describe("Cálculo de Firma Criptográfica HMAC-SHA256", () => {
    it("debe calcular la firma HMAC-SHA256 correcta", () => {
      const secret = "mi_secreto_super_seguro";
      const payloadString = JSON.stringify({ test: "data", num: 42 });

      const expectedHmac = crypto
        .createHmac("sha256", secret)
        .update(payloadString)
        .digest("hex");

      const signature = service.calcularFirma(payloadString, secret);
      expect(signature).toBe(`sha256=${expectedHmac}`);
    });
  });

  describe("Despacho de Eventos (Fail-Safe & Multi-Endpoint)", () => {
    it("debe despachar evento a todos los endpoints activos suscritos", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue("OK"),
      });
      global.fetch = fetchMock;

      // Endpoint 1: suscrito a todos ("*") con secret
      await service.crearWebhook({
        url: "https://router.mismapp.internal/events",
        descripcion: "Mismapp Router",
        secret: "clave_secreta_123",
        eventos: ["*"],
        activo: true,
      });

      // Endpoint 2: suscrito específicamente a incidente_detectado sin secret
      await service.crearWebhook({
        url: "https://slack-bridge.internal/hook",
        descripcion: "Slack Bridge",
        secret: null,
        eventos: ["alerta.incidente_detectado"],
        activo: true,
      });

      // Endpoint 3: inactivo
      await service.crearWebhook({
        url: "https://inactive.internal/hook",
        descripcion: "Inactivo",
        eventos: ["*"],
        activo: false,
      });

      // Endpoint 4: activo pero suscrito solo a calibracion
      await service.crearWebhook({
        url: "https://calibracion-only.internal/hook",
        descripcion: "Solo Calibración",
        eventos: ["medidor.calibracion_proxima"],
        activo: true,
      });

      const entregas = await service.despacharEvento({
        event: "alerta.incidente_detectado",
        severity: "CRITICAL",
        title: "Fuga detectada",
        message: "Medidor AGUA-01 presenta flujo continuo",
        data: { medidorCodigo: "AGUA-01", tipo: "FUGA_PROBABLE" },
      });

      // Solo los endpoints 1 y 2 deben recibir la petición
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(entregas.length).toBe(2);
      expect(entregas.every((e) => e.exitoso)).toBe(true);

      // Verificar cabeceras del primer fetch
      const firstCallArgs = fetchMock.mock.calls[0];
      const headers = firstCallArgs[1].headers;
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["X-Webhook-Event"]).toBe("alerta.incidente_detectado");
      expect(headers["X-Webhook-Delivery-Id"]).toBeDefined();
      expect(headers["X-Webhook-Timestamp"]).toBeDefined();
      expect(headers["X-Webhook-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);

      // Historial de entregas en repositorio
      const historial = await service.listarEntregas();
      expect(historial.length).toBe(2);
    });

    it("debe ser fail-safe y no arrojar excepción si un webhook externo responde 500 o falla de red", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("Connection refused (ECONNREFUSED)"));
      global.fetch = fetchMock;

      await service.crearWebhook({
        url: "https://caido.external.com/webhook",
        descripcion: "Servicio Caído",
        activo: true,
        eventos: ["*"],
      });

      // Despacho no debe arrojar excepción
      const entregas = await service.despacharEvento({
        event: "alerta.incidente_detectado",
        severity: "WARNING",
        title: "Salto de consumo",
        message: "Aumento del 60%",
        data: { medidorCodigo: "LUZ-02" },
      });

      expect(entregas.length).toBe(1);
      expect(entregas[0].exitoso).toBe(false);
      expect(entregas[0].error).toContain("Connection refused");

      const historial = await service.listarEntregas();
      expect(historial.length).toBe(1);
      expect(historial[0].exitoso).toBe(false);
      expect(historial[0].statusCode).toBeNull();
    });
  });

  describe("Diagnóstico Inmediato (testWebhook)", () => {
    it("debe enviar un ping sintético al webhook y retornar resultado exitoso", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue("pong"),
      });
      global.fetch = fetchMock;

      const created = await service.crearWebhook({
        url: "https://ping.test/hook",
        descripcion: "Ping Target",
        secret: "secret12345",
      });

      const resultado = await service.testWebhook(created.id);
      expect(resultado.exitoso).toBe(true);
      expect(resultado.statusCode).toBe(200);
      expect(resultado.duracionMs).toBeGreaterThanOrEqual(0);
      expect(resultado.error).toBeNull();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.event).toBe("test.ping");
      expect(body.title).toContain("Test Ping");
    });

    it("debe registrar y retornar error si el ping falla", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: vi.fn().mockResolvedValue("Endpoint Not Found"),
      });
      global.fetch = fetchMock;

      const created = await service.crearWebhook({
        url: "https://ping.test/hook-404",
        descripcion: "Ping Target 404",
      });

      const resultado = await service.testWebhook(created.id);
      expect(resultado.exitoso).toBe(false);
      expect(resultado.statusCode).toBe(404);
      expect(resultado.error).toContain("HTTP 404");
    });
  });
});
