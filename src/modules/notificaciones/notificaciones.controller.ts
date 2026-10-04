import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { NotificacionesService } from "./notificaciones.service.js";
import {
  SuscripcionPushSchema,
  DesuscripcionPushSchema,
  TelegramTestSchema,
  PushTestSchema,
} from "./notificaciones.schema.js";

export function createNotificacionesController(
  service: NotificacionesService
): FastifyPluginAsync {
  return async function notificacionesRoutes(fastify) {
    // 1. Obtener clave pública VAPID para suscripción del navegador
    fastify.get(
      "/vapid-public-key",
      async (_req: FastifyRequest, reply: FastifyReply) => {
        const publicKey = service.getVapidPublicKey();
        return reply.code(200).send({ publicKey });
      }
    );

    // 2. Registrar o reactivar suscripción Web Push
    fastify.post(
      "/push/subscribe",
      async (req: FastifyRequest, reply: FastifyReply) => {
        const parseResult = SuscripcionPushSchema.safeParse(req.body);
        if (!parseResult.success) {
          return reply.code(400).send({
            error: "Datos de suscripción inválidos",
            detalles: parseResult.error.issues,
          });
        }

        const usuarioId = (req as { user?: { id?: string } }).user?.id ?? null;
        const suscripcion = await service.guardarSuscripcion(
          parseResult.data,
          usuarioId
        );

        return reply.code(201).send(suscripcion);
      }
    );

    // 3. Desuscribir endpoint de Web Push
    fastify.post(
      "/push/unsubscribe",
      async (req: FastifyRequest, reply: FastifyReply) => {
        const parseResult = DesuscripcionPushSchema.safeParse(req.body);
        if (!parseResult.success) {
          return reply.code(400).send({
            error: "Endpoint requerido",
            detalles: parseResult.error.issues,
          });
        }

        const exito = await service.desactivarSuscripcion(
          parseResult.data.endpoint
        );
        return reply.code(200).send({ desuscrito: exito });
      }
    );

    // 4. Enviar mensaje de prueba a Telegram
    fastify.post(
      "/telegram/test",
      async (req: FastifyRequest, reply: FastifyReply) => {
        const parseResult = TelegramTestSchema.safeParse(req.body || {});
        if (!parseResult.success) {
          return reply.code(400).send({
            error: "Parámetros inválidos",
            detalles: parseResult.error.issues,
          });
        }

        const resultado = await service.enviarTelegram(
          {
            evento: "notificacion.test",
            severidad: "INFO",
            titulo: "Diagnóstico de Notificaciones",
            mensaje: parseResult.data.mensaje,
          },
          parseResult.data.chatId
        );

        return reply.code(200).send(resultado);
      }
    );

    // 5. Enviar notificación Web Push de prueba
    fastify.post(
      "/push/test",
      async (req: FastifyRequest, reply: FastifyReply) => {
        const parseResult = PushTestSchema.safeParse(req.body || {});
        if (!parseResult.success) {
          return reply.code(400).send({
            error: "Parámetros inválidos",
            detalles: parseResult.error.issues,
          });
        }

        const resultados = await service.enviarWebPush({
          evento: "notificacion.test",
          severidad: "INFO",
          titulo: parseResult.data.titulo,
          mensaje: parseResult.data.mensaje,
        });

        return reply.code(200).send({
          entregas: resultados,
          total: resultados.length,
        });
      }
    );

    // 6. Consultar bitácora de historial de notificaciones
    fastify.get(
      "/historial",
      async (req: FastifyRequest, reply: FastifyReply) => {
        const query = req.query as { limit?: string };
        const limit = query.limit ? parseInt(query.limit, 10) : 50;
        const historial = await service.obtenerHistorial(limit);
        return reply.code(200).send(historial);
      }
    );
  };
}
