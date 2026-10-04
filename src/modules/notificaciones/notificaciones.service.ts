import webpush from "web-push";
import {
  NotificacionMensaje,
  NotificacionEntregaResult,
  SuscripcionPushDTO,
} from "./notificaciones.schema.js";

export interface SuscripcionPushEntity {
  id: string;
  usuarioId: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  activa: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificacionHistorialEntity {
  id: string;
  canal: string;
  destinatario: string;
  evento: string;
  severidad: string;
  titulo: string;
  exitoso: boolean;
  statusCode: number | null;
  error: string | null;
  duracionMs: number | null;
  createdAt: Date;
}

export interface INotificacionesRepository {
  upsertSuscripcion(data: {
    endpoint: string;
    p256dh: string;
    auth: string;
    usuarioId?: string | null;
  }): Promise<SuscripcionPushEntity>;
  desactivarSuscripcion(endpoint: string): Promise<boolean>;
  findSuscripcionesActivas(): Promise<SuscripcionPushEntity[]>;
  crearHistorial(
    data: Omit<NotificacionHistorialEntity, "id" | "createdAt">
  ): Promise<NotificacionHistorialEntity>;
  listHistorial(limit?: number): Promise<NotificacionHistorialEntity[]>;
}

export interface NotificacionesServiceOptions {
  telegramBotToken?: string;
  telegramChatId?: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export class NotificacionesService {
  private telegramBotToken?: string;
  private telegramChatId?: string;
  private vapidPublicKey: string;
  private vapidPrivateKey: string;
  private vapidSubject: string;

  constructor(
    private readonly repository: INotificacionesRepository,
    options: NotificacionesServiceOptions = {}
  ) {
    this.telegramBotToken = options.telegramBotToken;
    this.telegramChatId = options.telegramChatId;
    this.vapidSubject = options.vapidSubject || "mailto:admin@medidores.local";

    if (options.vapidPublicKey && options.vapidPrivateKey) {
      this.vapidPublicKey = options.vapidPublicKey;
      this.vapidPrivateKey = options.vapidPrivateKey;
    } else {
      const generated = webpush.generateVAPIDKeys();
      this.vapidPublicKey = generated.publicKey;
      this.vapidPrivateKey = generated.privateKey;
    }

    try {
      webpush.setVapidDetails(
        this.vapidSubject,
        this.vapidPublicKey,
        this.vapidPrivateKey
      );
    } catch {
      // Manejo seguro en entornos de prueba con claves mock
    }
  }

  getVapidPublicKey(): string {
    return this.vapidPublicKey;
  }

  async guardarSuscripcion(
    dto: SuscripcionPushDTO,
    usuarioId?: string | null
  ): Promise<SuscripcionPushEntity> {
    return this.repository.upsertSuscripcion({
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      usuarioId: usuarioId ?? null,
    });
  }

  async desactivarSuscripcion(endpoint: string): Promise<boolean> {
    return this.repository.desactivarSuscripcion(endpoint);
  }

  async enviarTelegram(
    mensaje: NotificacionMensaje,
    customChatId?: string
  ): Promise<NotificacionEntregaResult> {
    const chatId = customChatId || this.telegramChatId;
    const inicio = Date.now();

    if (!this.telegramBotToken || !chatId) {
      const res: NotificacionEntregaResult = {
        canal: "TELEGRAM",
        destinatario: chatId || "SIN_CHAT_ID",
        exitoso: false,
        error: "TELEGRAM_NO_CONFIGURADO",
        duracionMs: 0,
      };
      return res;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const emoji =
      mensaje.severidad === "CRITICAL"
        ? "🚨"
        : mensaje.severidad === "WARNING"
          ? "⚠️"
          : "ℹ️";

    let textHtml = `<b>${emoji} [${mensaje.severidad}] ${escapeHtml(mensaje.titulo)}</b>\n\n`;
    textHtml += `${escapeHtml(mensaje.mensaje)}\n\n`;

    if (mensaje.datos && Object.keys(mensaje.datos).length > 0) {
      textHtml += `<b>Detalles:</b>\n`;
      for (const [k, v] of Object.entries(mensaje.datos)) {
        textHtml += `• <i>${escapeHtml(k)}</i>: <code>${escapeHtml(String(v))}</code>\n`;
      }
      textHtml += `\n`;
    }
    textHtml += `<i>Sistema Medidores • ${new Date().toLocaleString("es-CL")}</i>`;

    try {
      const url = `https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: textHtml,
          parse_mode: "HTML",
        }),
        signal: controller.signal,
      });

      const duracionMs = Date.now() - inicio;
      const exitoso = response.ok;
      const errorText = exitoso ? null : await response.text().catch(() => "Error en respuesta");

      await this.repository.crearHistorial({
        canal: "TELEGRAM",
        destinatario: chatId,
        evento: mensaje.evento,
        severidad: mensaje.severidad,
        titulo: mensaje.titulo,
        exitoso,
        statusCode: response.status,
        error: errorText,
        duracionMs,
      });

      return {
        canal: "TELEGRAM",
        destinatario: chatId,
        exitoso,
        statusCode: response.status,
        error: errorText,
        duracionMs,
      };
    } catch (err: unknown) {
      const duracionMs = Date.now() - inicio;
      const errorMsg = err instanceof Error ? err.message : "Error desconocido al conectar con Telegram";

      await this.repository.crearHistorial({
        canal: "TELEGRAM",
        destinatario: chatId,
        evento: mensaje.evento,
        severidad: mensaje.severidad,
        titulo: mensaje.titulo,
        exitoso: false,
        statusCode: null,
        error: errorMsg,
        duracionMs,
      });

      return {
        canal: "TELEGRAM",
        destinatario: chatId,
        exitoso: false,
        statusCode: null,
        error: errorMsg,
        duracionMs,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async enviarWebPush(mensaje: NotificacionMensaje): Promise<NotificacionEntregaResult[]> {
    const suscripciones = await this.repository.findSuscripcionesActivas();
    if (suscripciones.length === 0) return [];

    const payload = JSON.stringify({
      title: mensaje.titulo,
      body: mensaje.mensaje,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: mensaje.url || "/",
      severidad: mensaje.severidad,
      evento: mensaje.evento,
    });

    const envios = suscripciones.map(async (sub) => {
      const inicio = Date.now();
      const destinatarioAbrev = sub.endpoint.slice(-20);

      try {
        const response = await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload,
          { TTL: 86400 }
        );

        const duracionMs = Date.now() - inicio;
        await this.repository.crearHistorial({
          canal: "WEB_PUSH",
          destinatario: destinatarioAbrev,
          evento: mensaje.evento,
          severidad: mensaje.severidad,
          titulo: mensaje.titulo,
          exitoso: true,
          statusCode: response.statusCode,
          error: null,
          duracionMs,
        });

        return {
          canal: "WEB_PUSH" as const,
          destinatario: destinatarioAbrev,
          exitoso: true,
          statusCode: response.statusCode,
          duracionMs,
        };
      } catch (err: unknown) {
        const duracionMs = Date.now() - inicio;
        const statusCode = (err as { statusCode?: number })?.statusCode || null;
        const errorMsg = err instanceof Error ? err.message : "Error enviando Web Push";

        // Si el endpoint ya no existe (404 o 410 Gone), desactivamos la suscripción
        if (statusCode === 404 || statusCode === 410) {
          await this.repository.desactivarSuscripcion(sub.endpoint);
        }

        await this.repository.crearHistorial({
          canal: "WEB_PUSH",
          destinatario: destinatarioAbrev,
          evento: mensaje.evento,
          severidad: mensaje.severidad,
          titulo: mensaje.titulo,
          exitoso: false,
          statusCode,
          error: errorMsg,
          duracionMs,
        });

        return {
          canal: "WEB_PUSH" as const,
          destinatario: destinatarioAbrev,
          exitoso: false,
          statusCode,
          error: errorMsg,
          duracionMs,
        };
      }
    });

    const settled = await Promise.allSettled(envios);
    return settled.map((res) => {
      if (res.status === "fulfilled") {
        return res.value;
      }
      return {
        canal: "WEB_PUSH" as const,
        destinatario: "unknown",
        exitoso: false,
        error: String(res.reason),
      };
    });
  }

  async despacharNotificacion(
    mensaje: NotificacionMensaje
  ): Promise<NotificacionEntregaResult[]> {
    const promises = [
      this.enviarTelegram(mensaje),
      this.enviarWebPush(mensaje),
    ];

    const results = await Promise.allSettled(promises);
    const entregas: NotificacionEntregaResult[] = [];

    for (const r of results) {
      if (r.status === "fulfilled") {
        if (Array.isArray(r.value)) {
          entregas.push(...r.value);
        } else {
          entregas.push(r.value);
        }
      }
    }

    return entregas;
  }

  async obtenerHistorial(limit = 50): Promise<NotificacionHistorialEntity[]> {
    return this.repository.listHistorial(limit);
  }
}
