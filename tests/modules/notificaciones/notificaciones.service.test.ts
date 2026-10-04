import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  NotificacionesService,
  INotificacionesRepository,
  SuscripcionPushEntity,
  NotificacionHistorialEntity,
} from "../../../src/modules/notificaciones/notificaciones.service.js";
import {
  NotificacionMensaje,
} from "../../../src/modules/notificaciones/notificaciones.schema.js";
import crypto from "node:crypto";

class InMemoryNotificacionesRepository implements INotificacionesRepository {
  private suscripciones: SuscripcionPushEntity[] = [];
  private historial: NotificacionHistorialEntity[] = [];

  async upsertSuscripcion(data: {
    endpoint: string;
    p256dh: string;
    auth: string;
    usuarioId?: string | null;
  }): Promise<SuscripcionPushEntity> {
    const existingIdx = this.suscripciones.findIndex((s) => s.endpoint === data.endpoint);
    if (existingIdx >= 0) {
      this.suscripciones[existingIdx] = {
        ...this.suscripciones[existingIdx],
        ...data,
        activa: true,
        updatedAt: new Date(),
      };
      return this.suscripciones[existingIdx];
    }
    const item: SuscripcionPushEntity = {
      id: crypto.randomUUID(),
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
    const item = this.suscripciones.find((s) => s.endpoint === endpoint);
    if (!item) return false;
    item.activa = false;
    item.updatedAt = new Date();
    return true;
  }

  async findSuscripcionesActivas(): Promise<SuscripcionPushEntity[]> {
    return this.suscripciones.filter((s) => s.activa);
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
    return [...this.historial]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}

describe("NotificacionesService Suite", () => {
  let repo: InMemoryNotificacionesRepository;
  let service: NotificacionesService;

  beforeEach(() => {
    vi.restoreAllMocks();
    repo = new InMemoryNotificacionesRepository();
    service = new NotificacionesService(repo, {
      telegramBotToken: "TEST_BOT_TOKEN",
      telegramChatId: "-100123456",
      vapidPublicKey: "TEST_VAPID_PUBLIC",
      vapidPrivateKey: "TEST_VAPID_PRIVATE",
      vapidSubject: "mailto:test@medidores.local",
    });
  });

  describe("VAPID Keys & Push Subscriptions", () => {
    it("debe retornar la clave pública VAPID configurada o generada", () => {
      const publicKey = service.getVapidPublicKey();
      expect(publicKey).toBeDefined();
      expect(typeof publicKey).toBe("string");
      expect(publicKey.length).toBeGreaterThan(10);
    });

    it("debe guardar y reactivar suscripción push correctamente", async () => {
      const sub = await service.guardarSuscripcion(
        {
          endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
          keys: {
            p256dh: "p256dh-key-sample",
            auth: "auth-key-sample",
          },
        },
        "usuario-uuid-1"
      );

      expect(sub.endpoint).toBe("https://fcm.googleapis.com/fcm/send/abc123");
      expect(sub.activa).toBe(true);
      expect(sub.usuarioId).toBe("usuario-uuid-1");

      const activas = await repo.findSuscripcionesActivas();
      expect(activas).toHaveLength(1);
    });

    it("debe desactivar suscripción push existente", async () => {
      await service.guardarSuscripcion(
        {
          endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
          keys: {
            p256dh: "key",
            auth: "auth",
          },
        },
        "usuario-uuid-1"
      );

      const desactivada = await service.desactivarSuscripcion("https://fcm.googleapis.com/fcm/send/abc123");
      expect(desactivada).toBe(true);

      const activas = await repo.findSuscripcionesActivas();
      expect(activas).toHaveLength(0);
    });
  });

  describe("Canal Telegram Dispatcher", () => {
    it("debe despachar mensaje a Telegram con formato HTML y registrar historial exitoso", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { message_id: 999 } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const mensaje: NotificacionMensaje = {
        evento: "alerta.incidente_detectado",
        severidad: "CRITICAL",
        titulo: "🚨 Fuga Continua en Medidor AGUA-01",
        mensaje: "Flujo nocturno detectado sin interrupciones durante 6 horas",
        datos: { medidorCodigo: "AGUA-01", valor: 154.2 },
      };

      const resultado = await service.enviarTelegram(mensaje);
      expect(resultado.exitoso).toBe(true);
      expect(resultado.statusCode).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toContain("https://api.telegram.org/botTEST_BOT_TOKEN/sendMessage");
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(body.chat_id).toBe("-100123456");
      expect(body.parse_mode).toBe("HTML");
      expect(body.text).toContain("🚨 Fuga Continua");

      const historial = await service.obtenerHistorial();
      expect(historial).toHaveLength(1);
      expect(historial[0].canal).toBe("TELEGRAM");
      expect(historial[0].exitoso).toBe(true);
    });

    it("debe registrar error en historial cuando Telegram rechaza la petición sin lanzar excepción no controlada", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "Chat not found",
      });
      vi.stubGlobal("fetch", fetchMock);

      const mensaje: NotificacionMensaje = {
        evento: "notificacion.test",
        severidad: "INFO",
        titulo: "Prueba Telegram",
        mensaje: "Mensaje de diagnóstico",
      };

      const resultado = await service.enviarTelegram(mensaje);
      expect(resultado.exitoso).toBe(false);
      expect(resultado.statusCode).toBe(400);

      const historial = await service.obtenerHistorial();
      expect(historial).toHaveLength(1);
      expect(historial[0].exitoso).toBe(false);
    });

    it("debe omitir el canal si Telegram no está configurado", async () => {
      const unconfiguredService = new NotificacionesService(repo, {});
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const mensaje: NotificacionMensaje = {
        evento: "notificacion.test",
        severidad: "INFO",
        titulo: "Prueba",
        mensaje: "Sin config",
      };

      const resultado = await unconfiguredService.enviarTelegram(mensaje);
      expect(resultado.exitoso).toBe(false);
      expect(resultado.error).toBe("TELEGRAM_NO_CONFIGURADO");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("Despacho Global Multicanal y Fail-Safe", () => {
    it("debe despachar a Telegram y Web Push en paralelo mediante allSettled", async () => {
      // Registrar 1 suscripción push
      await service.guardarSuscripcion({
        endpoint: "https://push.example.com/send/sub1",
        keys: { p256dh: "key1", auth: "auth1" },
      });

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const spyWebPush = vi.spyOn(service, "enviarWebPush").mockResolvedValue([
        {
          canal: "WEB_PUSH",
          destinatario: "sub1",
          exitoso: true,
          statusCode: 201,
        },
      ]);

      const mensaje: NotificacionMensaje = {
        evento: "alerta.incidente_detectado",
        severidad: "CRITICAL",
        titulo: "Alerta Crítica",
        mensaje: "Se detectó sobreconsumo",
      };

      const resultados = await service.despacharNotificacion(mensaje);
      expect(resultados).toHaveLength(2); // 1 Telegram + 1 Push
      expect(spyWebPush).toHaveBeenCalledTimes(1);
    });
  });
});
