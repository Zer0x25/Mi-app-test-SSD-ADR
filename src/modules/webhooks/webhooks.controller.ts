import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { WebhookDispatcherService } from "./webhooks.service.js";
import {
  CrearWebhookInputSchema,
  ActualizarWebhookInputSchema,
  TestWebhookInputSchema,
  WebhookNotFoundError,
  WebhookInvalidoError,
  WebhookDispatchError,
} from "./webhooks.schema.js";

export interface ICalibracionesChecker {
  verificarCalibracionesProximas(diasAnticipacion?: number): Promise<{
    medidoresEvaluados: number;
    eventosDespachados: number;
    detalles: Array<{ medidorCodigo: string; fechaProximaCalibracion: Date; estado: "PROXIMA" | "VENCIDA" }>;
  }>;
}

export function createWebhooksController(
  service: WebhookDispatcherService,
  calibracionesChecker?: ICalibracionesChecker
): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    // Listar todos los webhooks
    app.get("/", async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const list = await service.listarWebhooks();
        return reply.status(200).send(list);
      } catch (error: unknown) {
        return handleError(reply, error, "Error al listar webhooks");
      }
    });

    // Crear un nuevo webhook
    app.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const input = CrearWebhookInputSchema.parse(request.body);
        const created = await service.crearWebhook(input);
        return reply.status(201).send(created);
      } catch (error: unknown) {
        return handleError(reply, error, "Error al crear webhook");
      }
    });

    // Obtener detalle de un webhook
    app.get("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const item = await service.obtenerWebhook(id);
        return reply.status(200).send(item);
      } catch (error: unknown) {
        return handleError(reply, error, "Error al obtener webhook");
      }
    });

    // Actualizar un webhook
    app.patch(
      "/:id",
      async (
        request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
        reply: FastifyReply
      ) => {
        try {
          const { id } = request.params;
          const input = ActualizarWebhookInputSchema.parse(request.body);
          const updated = await service.actualizarWebhook(id, input);
          return reply.status(200).send(updated);
        } catch (error: unknown) {
          return handleError(reply, error, "Error al actualizar webhook");
        }
      }
    );

    // Eliminar un webhook
    app.delete(
      "/:id",
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          const { id } = request.params;
          await service.eliminarWebhook(id);
          return reply.status(204).send();
        } catch (error: unknown) {
          return handleError(reply, error, "Error al eliminar webhook");
        }
      }
    );

    // Disparar test ping a un webhook
    app.post(
      "/:id/test",
      async (
        request: FastifyRequest<{ Params: { id: string }; Body?: unknown }>,
        reply: FastifyReply
      ) => {
        try {
          const { id } = request.params;
          const input = request.body ? TestWebhookInputSchema.parse(request.body) : undefined;
          const result = await service.testWebhook(id, input?.evento);
          return reply.status(200).send(result);
        } catch (error: unknown) {
          return handleError(reply, error, "Error al probar webhook");
        }
      }
    );

    // Listar historial de entregas de un webhook
    app.get(
      "/:id/entregas",
      async (
        request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: string } }>,
        reply: FastifyReply
      ) => {
        try {
          const { id } = request.params;
          const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
          const entregas = await service.listarEntregas(id, limit);
          return reply.status(200).send(entregas);
        } catch (error: unknown) {
          return handleError(reply, error, "Error al listar entregas de webhook");
        }
      }
    );

    // Disparar evaluación de calibraciones próximas y vencidas
    app.post("/check-calibraciones", async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!calibracionesChecker) {
          return reply.status(200).send({
            medidoresEvaluados: 0,
            eventosDespachados: 0,
            detalles: [],
            message: "Verificador de calibraciones no configurado en este runtime.",
          });
        }
        const resultado = await calibracionesChecker.verificarCalibracionesProximas(30);
        return reply.status(200).send(resultado);
      } catch (error: unknown) {
        return handleError(reply, error, "Error al evaluar calibraciones");
      }
    });
  };
}

function handleError(reply: FastifyReply, error: unknown, defaultMessage: string) {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: "VALIDATION_ERROR",
      message: error.issues.map((i) => i.message).join(", "),
      details: error.issues,
    });
  }

  if (error instanceof WebhookNotFoundError) {
    return reply.status(404).send({
      error: error.code,
      message: error.message,
    });
  }

  if (error instanceof WebhookInvalidoError) {
    return reply.status(400).send({
      error: error.code,
      message: error.message,
    });
  }

  if (error instanceof WebhookDispatchError) {
    return reply.status(502).send({
      error: error.code,
      message: error.message,
    });
  }

  const message = error instanceof Error ? error.message : defaultMessage;
  return reply.status(500).send({
    error: "INTERNAL_ERROR",
    message,
  });
}
