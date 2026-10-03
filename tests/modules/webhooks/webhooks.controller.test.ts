import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { createWebhooksController } from "../../../src/modules/webhooks/webhooks.controller.js";
import {
  WebhookDispatcherService,
  IWebhooksRepository,
  WebhookEntity,
  WebhookEntregaEntity,
} from "../../../src/modules/webhooks/webhooks.service.js";
import { WebhookNotFoundError } from "../../../src/modules/webhooks/webhooks.schema.js";

class MockWebhooksRepository implements IWebhooksRepository {
  public webhooks: WebhookEntity[] = [];
  public entregas: WebhookEntregaEntity[] = [];

  async create(data: Omit<WebhookEntity, "id" | "createdAt" | "updatedAt">): Promise<WebhookEntity> {
    const item: WebhookEntity = {
      id: "webhook-test-1",
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
      id: "entrega-test-1",
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
    if (limit) {
      result = result.slice(0, limit);
    }
    return result;
  }
}

describe("WebhooksController HTTP Suite (Agentic TDD)", () => {
  let app: FastifyInstance;
  let repo: MockWebhooksRepository;
  let service: WebhookDispatcherService;

  beforeEach(async () => {
    repo = new MockWebhooksRepository();
    service = new WebhookDispatcherService(repo);

    app = Fastify();
    await app.register(createWebhooksController(service), { prefix: "/api/webhooks" });
  });

  describe("GET /api/webhooks", () => {
    it("debe listar los webhooks registrados", async () => {
      await repo.create({
        url: "https://router.mismapp.internal/alerts",
        descripcion: "Router Central Mismapp",
        secret: "supersecret123",
        eventos: JSON.stringify(["*"]),
        activo: true,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/webhooks",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
      expect(data[0].url).toBe("https://router.mismapp.internal/alerts");
      expect(data[0].hasSecret).toBe(true);
      expect(data[0].secret).toBeUndefined(); // no expone secreto plano
    });
  });

  describe("POST /api/webhooks", () => {
    it("debe crear un webhook con datos válidos", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/webhooks",
        payload: {
          url: "https://webhook.site/test-1",
          descripcion: "Webhook Site Test",
          secret: "secreto_valido_123",
          eventos: ["alerta.incidente_detectado"],
          activo: true,
        },
      });

      expect(response.statusCode).toBe(201);
      const data = response.json();
      expect(data.id).toBeDefined();
      expect(data.url).toBe("https://webhook.site/test-1");
      expect(data.hasSecret).toBe(true);
    });

    it("debe retornar 400 si los datos de entrada son inválidos", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/webhooks",
        payload: {
          url: "no-es-una-url",
          descripcion: "ab", // menos de 3 chars
        },
      });

      expect(response.statusCode).toBe(400);
      const data = response.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/webhooks/:id", () => {
    it("debe retornar los detalles de un webhook", async () => {
      const created = await repo.create({
        url: "https://hook.test",
        descripcion: "Detalle Test",
        eventos: JSON.stringify(["*"]),
        activo: true,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/webhooks/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.id).toBe(created.id);
      expect(data.descripcion).toBe("Detalle Test");
    });

    it("debe retornar 404 si el webhook no existe", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/webhooks/inexistente-123",
      });

      expect(response.statusCode).toBe(404);
      const data = response.json();
      expect(data.error).toBe("WEBHOOK_NOT_FOUND");
    });
  });

  describe("PATCH /api/webhooks/:id", () => {
    it("debe actualizar un webhook", async () => {
      const created = await repo.create({
        url: "https://old.test",
        descripcion: "Viejo",
        eventos: JSON.stringify(["*"]),
        activo: true,
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/api/webhooks/${created.id}`,
        payload: {
          url: "https://nuevo.test",
          activo: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.url).toBe("https://nuevo.test");
      expect(data.activo).toBe(false);
    });
  });

  describe("DELETE /api/webhooks/:id", () => {
    it("debe eliminar un webhook exitosamente", async () => {
      const created = await repo.create({
        url: "https://del.test",
        descripcion: "Para Eliminar",
        eventos: JSON.stringify(["*"]),
        activo: true,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/webhooks/${created.id}`,
      });

      expect(response.statusCode).toBe(204);
      expect(repo.webhooks.length).toBe(0);
    });
  });

  describe("POST /api/webhooks/:id/test", () => {
    it("debe invocar test ping y retornar resultado de entrega", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue("OK"),
      });
      global.fetch = fetchMock;

      const created = await repo.create({
        url: "https://test-ping.test/hook",
        descripcion: "Ping Webhook",
        eventos: JSON.stringify(["*"]),
        activo: true,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/webhooks/${created.id}/test`,
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.exitoso).toBe(true);
      expect(data.statusCode).toBe(200);
    });
  });

  describe("GET /api/webhooks/:id/entregas", () => {
    it("debe listar el historial de entregas de un webhook", async () => {
      const created = await repo.create({
        url: "https://entregas.test",
        descripcion: "Con Entregas",
        eventos: JSON.stringify(["*"]),
        activo: true,
      });

      await repo.createEntrega({
        webhookId: created.id,
        evento: "alerta.incidente_detectado",
        url: created.url,
        statusCode: 200,
        exitoso: true,
        duracionMs: 120,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/webhooks/${created.id}/entregas`,
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
      expect(data[0].evento).toBe("alerta.incidente_detectado");
      expect(data[0].exitoso).toBe(true);
    });
  });

  describe("POST /api/webhooks/check-calibraciones", () => {
    it("debe disparar la evaluación de calibraciones y responder con el resultado", async () => {
      const mockChecker = {
        verificarCalibracionesProximas: vi.fn().mockResolvedValue({
          medidoresEvaluados: 5,
          eventosDespachados: 2,
          detalles: [
            {
              medidorCodigo: "MED-AGUA-01",
              fechaProximaCalibracion: new Date("2026-10-15"),
              estado: "PROXIMA",
            },
          ],
        }),
      };

      const customApp = Fastify();
      await customApp.register(createWebhooksController(service, mockChecker), {
        prefix: "/api/webhooks",
      });

      const response = await customApp.inject({
        method: "POST",
        url: "/api/webhooks/check-calibraciones",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.medidoresEvaluados).toBe(5);
      expect(data.eventosDespachados).toBe(2);
      expect(data.detalles.length).toBe(1);
      expect(mockChecker.verificarCalibracionesProximas).toHaveBeenCalledWith(30);
    });
  });
});

