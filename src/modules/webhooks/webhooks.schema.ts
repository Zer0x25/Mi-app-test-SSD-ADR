import { z } from "zod";

export const WebhookEventTypes = [
  "alerta.incidente_detectado",
  "alerta.incidente_resuelto",
  "medidor.calibracion_proxima",
  "medidor.calibracion_vencida",
  "sistema.error_critico",
  "test.ping",
] as const;

export type WebhookEventType = (typeof WebhookEventTypes)[number];

export const WebhookSeverities = ["INFO", "WARNING", "CRITICAL"] as const;
export type WebhookSeverity = (typeof WebhookSeverities)[number];

export interface SistemaErrorCriticoPayload {
  reqId?: string;
  method: string;
  url: string;
  statusCode: number;
  errorName: string;
  timestamp: string;
}

export interface WebhookPayload<T = unknown> {
  id: string;
  event: WebhookEventType;
  timestamp: string;
  severity: WebhookSeverity;
  title: string;
  message: string;
  data: T;
}

export const CrearWebhookInputSchema = z.object({
  url: z.string().url("URL de destino inválida"),
  descripcion: z.string().trim().min(3, "La descripción debe tener al menos 3 caracteres"),
  secret: z.string().trim().min(8, "El secret debe tener al menos 8 caracteres").optional().nullable(),
  eventos: z.array(z.string()).default(["*"]),
  activo: z.boolean().default(true),
});

export type CrearWebhookInput = z.input<typeof CrearWebhookInputSchema>;

export const ActualizarWebhookInputSchema = z.object({
  url: z.string().url("URL de destino inválida").optional(),
  descripcion: z.string().trim().min(3).optional(),
  secret: z.string().trim().min(8).optional().nullable(),
  eventos: z.array(z.string()).optional(),
  activo: z.boolean().optional(),
});

export type ActualizarWebhookInput = z.input<typeof ActualizarWebhookInputSchema>;

export const TestWebhookInputSchema = z.object({
  evento: z.enum(WebhookEventTypes).default("test.ping"),
});

export type TestWebhookInput = z.infer<typeof TestWebhookInputSchema>;

export interface WebhookEndpointResponse {
  id: string;
  url: string;
  descripcion: string;
  eventos: string[];
  activo: boolean;
  hasSecret: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEntregaResponse {
  id: string;
  webhookId: string;
  evento: string;
  url: string;
  statusCode: number | null;
  exitoso: boolean;
  error: string | null;
  duracionMs: number | null;
  createdAt: Date;
}

export interface TestWebhookResult {
  exitoso: boolean;
  statusCode: number | null;
  duracionMs: number;
  error: string | null;
}

export type WebhooksErrorCode =
  | "WEBHOOK_NOT_FOUND"
  | "WEBHOOK_INVALIDO"
  | "WEBHOOK_DISPATCH_ERROR";

export class WebhookNotFoundError extends Error {
  readonly code: WebhooksErrorCode = "WEBHOOK_NOT_FOUND";
  constructor(id: string) {
    super(`Webhook con ID «${id}» no encontrado.`);
    this.name = "WebhookNotFoundError";
  }
}

export class WebhookInvalidoError extends Error {
  readonly code: WebhooksErrorCode = "WEBHOOK_INVALIDO";
  constructor(message: string) {
    super(message);
    this.name = "WebhookInvalidoError";
  }
}

export class WebhookDispatchError extends Error {
  readonly code: WebhooksErrorCode = "WEBHOOK_DISPATCH_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "WebhookDispatchError";
  }
}
