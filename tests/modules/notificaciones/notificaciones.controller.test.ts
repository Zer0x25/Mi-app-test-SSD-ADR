import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { createNotificacionesController } from "../../../src/modules/notificaciones/notificaciones.controller.js";
import {
  NotificacionesService,
  INotificacionesRepository,
  SuscripcionPushEntity,
  NotificacionHistorialEntity,
} from "../../../src/modules/notificaciones/notificaciones.service.js";
import crypto from "node:crypto";

class MockNotificacionesRepository implements INotificacionesRepository {
  public suscripciones: SuscripcionPushEntity[] = [];
  public historial: NotificacionHistorialEntity[] = [];

  async upsertSuscripcion(data: {
    endpoint: string;
    p256dh: string;
    auth: string;
    usuarioId?: string | null;
  }): Promise<SuscripcionPushEntity> {
    const item: SuscripcionPushEntity = {
      id: "sub-1",
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      usuarioId: data.usuarioId ?? null,
      activa: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.suscripciones.push(item);
    return item;
  }

  async desactivarSuscripcion(endpoint: string): Promise<boolean> {
    const s = this.suscripciones.find((x) => x.endpoint === endpoint);
    if (!s) return false;
    s.activa = false;
    return true;
  }

  async findSuscripcionesActivas(): Promise<SuscripcionPushEntity[]> {
    return this.suscripciones.filter((x) => x.activa);
  }

  async crearHistorial(
    data: Omit<NotificacionHistorialEntity, "id" | "createdAt">
  ): Promise<NotificacionHistorialEntity> {
    const item: NotificacionHistorialEntity = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
    };
    this.historial.push(item);
    return item;
  }

  async listHistorial(limit = 50): Promise<NotificacionHistorialEntity[]> {
    return this.historial.slice(0, limit);
  }
}

describe("NotificacionesController HTTP Suite", () => {
  let app: FastifyInstance;
  let repo: MockNotificacionesRepository;
  let service: NotificacionesService;

  beforeEach(async () => {
    vi.restoreAllMocks();
    repo = new MockNotificacionesRepository();
    service = new NotificacionesService(repo, {
      telegramBotToken: "TEST_TOKEN",
      telegramChatId: "-1001",
      vapidPublicKey: "TEST_VAPID_PUB_KEY_12345",
      vapidPrivateKey: "TEST_VAPID_PRIV_KEY",
      vapidSubject: "mailto:admin@medidores.local",
    });

    app = Fastify();
    await app.register(createNotificacionesController(service), {
      prefix: "/api/notificaciones",
    });
  });

  describe("GET /api/notificaciones/vapid-public-key", () => {
    it("debe retornar la clave pública VAPID en JSON", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/notificaciones/vapid-public-key",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.publicKey).toBe("TEST_VAPID_PUB_KEY_12345");
    });
  });

  describe("POST /api/notificaciones/push/subscribe", () => {
    it("debe rechazar body incompleto con HTTP 400", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/notificaciones/push/subscribe",
        payload: {
          endpoint: "not-a-valid-url",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("debe registrar suscripción válida con HTTP 201", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/notificaciones/push/subscribe",
        payload: {
          endpoint: "https://push.browser.com/sub/12345",
          keys: {
            p256dh: "p256dh_key_sample",
            auth: "auth_key_sample",
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const data = response.json();
      expect(data.activa).toBe(true);
      expect(data.endpoint).toBe("https://push.browser.com/sub/12345");
    });
  });

  describe("POST /api/notificaciones/push/unsubscribe", () => {
    it("debe desuscribir un endpoint con HTTP 200", async () => {
      repo.suscripciones.push({
        id: "sub-1",
        endpoint: "https://push.browser.com/sub/12345",
        p256dh: "key",
        auth: "auth",
        usuarioId: null,
        activa: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/notificaciones/push/unsubscribe",
        payload: {
          endpoint: "https://push.browser.com/sub/12345",
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.desuscrito).toBe(true);
    });
  });

  describe("POST /api/notificaciones/telegram/test", () => {
    it("debe enviar mensaje de prueba y retornar resultado", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const response = await app.inject({
        method: "POST",
        url: "/api/notificaciones/telegram/test",
        payload: {
          mensaje: "Diagnóstico manual",
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.canal).toBe("TELEGRAM");
      expect(data.exitoso).toBe(true);
    });
  });

  describe("GET /api/notificaciones/historial", () => {
    it("debe retornar listado de historial de notificaciones", async () => {
      await repo.crearHistorial({
        canal: "TELEGRAM",
        destinatario: "-1001",
        evento: "notificacion.test",
        severidad: "INFO",
        titulo: "Test",
        exitoso: true,
        statusCode: 200,
        error: null,
        duracionMs: 45,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/notificaciones/historial",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);
      expect(data[0].canal).toBe("TELEGRAM");
    });
  });
});
