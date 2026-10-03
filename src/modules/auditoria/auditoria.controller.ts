import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { AuditoriaService } from "./auditoria.service.js";
import { FiltroAuditoriaSchema } from "./auditoria.schema.js";
import { DomainError } from "../../core/errors.js";

export function createAuditoriaController(service: AuditoriaService): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    // Listar Eventos de Auditoría (Solo ADMIN)
    app.get("/auditoria", async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const queryParsed = FiltroAuditoriaSchema.safeParse(request.query);
        if (!queryParsed.success) {
          return reply.status(400).send({
            error: "VALIDATION_ERROR",
            message: "Parámetros de búsqueda de auditoría inválidos",
            details: queryParsed.error.issues,
          });
        }

        const eventos = await service.listarEventos(queryParsed.data);
        return reply.status(200).send(eventos);
      } catch (error: unknown) {
        if (error instanceof DomainError) {
          return reply.status(error.statusCode).send({
            error: error.code,
            message: error.message,
          });
        }
        if (error instanceof ZodError) {
          return reply.status(400).send({
            error: "VALIDATION_ERROR",
            message: error.issues.map((i) => i.message).join(", "),
          });
        }
        return reply.status(500).send({
          error: "INTERNAL_ERROR",
          message: "Error al consultar la pista de auditoría",
        });
      }
    });
  };
}
