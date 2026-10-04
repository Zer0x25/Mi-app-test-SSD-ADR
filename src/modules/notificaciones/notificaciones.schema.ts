import { z } from "zod";

export const CanalNotificacionTypes = ["TELEGRAM", "WEB_PUSH"] as const;
export type CanalNotificacionType = (typeof CanalNotificacionTypes)[number];

export const NotificacionEventTypes = [
  "alerta.incidente_detectado",
  "alerta.incidente_resuelto",
  "sistema.error_critico",
  "notificacion.test",
] as const;
export type NotificacionEventType = (typeof NotificacionEventTypes)[number];

export const NotificacionSeveridadTypes = ["INFO", "WARNING", "CRITICAL"] as const;
export type NotificacionSeveridad = (typeof NotificacionSeveridadTypes)[number];

export interface NotificacionMensaje {
  evento: NotificacionEventType;
  severidad: NotificacionSeveridad;
  titulo: string;
  mensaje: string;
  datos?: Record<string, unknown>;
  url?: string;
}

export const SuscripcionPushSchema = z.object({
  endpoint: z.string().url("Endpoint de suscripción debe ser una URL válida"),
  keys: z.object({
    p256dh: z.string().min(1, "Clave p256dh requerida"),
    auth: z.string().min(1, "Clave auth requerida"),
  }),
});
export type SuscripcionPushDTO = z.infer<typeof SuscripcionPushSchema>;

export const DesuscripcionPushSchema = z.object({
  endpoint: z.string().url("Endpoint requerido para desuscribir"),
});
export type DesuscripcionPushDTO = z.infer<typeof DesuscripcionPushSchema>;

export const TelegramTestSchema = z.object({
  chatId: z.string().optional(),
  mensaje: z.string().default("Mensaje de prueba desde Sistema Medidores"),
});
export type TelegramTestDTO = z.infer<typeof TelegramTestSchema>;

export const PushTestSchema = z.object({
  titulo: z.string().default("Notificación de prueba"),
  mensaje: z.string().default("El canal Web Push está operando correctamente"),
});
export type PushTestDTO = z.infer<typeof PushTestSchema>;

export const VapidPublicKeyResponseSchema = z.object({
  publicKey: z.string().min(1),
});
export type VapidPublicKeyResponse = z.infer<typeof VapidPublicKeyResponseSchema>;

export const NotificacionHistorialItemSchema = z.object({
  id: z.string().uuid(),
  canal: z.enum(CanalNotificacionTypes),
  destinatario: z.string(),
  evento: z.string(),
  severidad: z.string(),
  titulo: z.string(),
  exitoso: z.boolean(),
  statusCode: z.number().nullable(),
  error: z.string().nullable(),
  duracionMs: z.number().nullable(),
  createdAt: z.date(),
});
export type NotificacionHistorialItem = z.infer<typeof NotificacionHistorialItemSchema>;

export interface NotificacionEntregaResult {
  canal: CanalNotificacionType;
  destinatario: string;
  exitoso: boolean;
  statusCode?: number | null;
  error?: string | null;
  duracionMs?: number | null;
}
