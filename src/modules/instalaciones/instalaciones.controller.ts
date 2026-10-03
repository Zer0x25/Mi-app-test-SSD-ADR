import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { InstalacionesService } from "./instalaciones.service.js";
import { isDomainError } from "../../core/errors.js";
import { CrearInstalacionInput } from "./instalaciones.schema.js";

export function createInstalacionesController(service: InstalacionesService): FastifyPluginAsync {
  return async function (fastify: FastifyInstance) {
    fastify.post(
      "/instalaciones",
      async (request: FastifyRequest<{ Body: CrearInstalacionInput }>, reply: FastifyReply) => {
        try {
          const result = await service.crearInstalacion(request.body);
          return reply.status(201).send(result);
        } catch (error) {
          if (isDomainError(error)) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
              details: error.details,
            });
          }
          return reply.status(500).send({
            error: "INTERNAL_SERVER_ERROR",
            message: "Error interno del servidor",
          });
        }
      }
    );

    fastify.get(
      "/instalaciones/:id",
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          const result = await service.obtenerPorId(request.params.id);
          return reply.status(200).send(result);
        } catch (error) {
          if (isDomainError(error)) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
              details: error.details,
            });
          }
          return reply.status(500).send({
            error: "INTERNAL_SERVER_ERROR",
            message: "Error interno del servidor",
          });
        }
      }
    );

    fastify.patch(
      "/instalaciones/:id/desactivar",
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          const result = await service.desactivarInstalacion(request.params.id);
          return reply.status(200).send(result);
        } catch (error) {
          if (isDomainError(error)) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
              details: error.details,
            });
          }
          return reply.status(500).send({
            error: "INTERNAL_SERVER_ERROR",
            message: "Error interno del servidor",
          });
        }
      }
    );

    fastify.post(
      "/instalaciones/:id/operadores",
      async (
        request: FastifyRequest<{ Params: { id: string }; Body: { usuarioId: string } }>,
        reply: FastifyReply
      ) => {
        try {
          const result = await service.asignarOperador({
            instalacionId: request.params.id,
            usuarioId: request.body.usuarioId,
          });
          return reply.status(201).send(result);
        } catch (error) {
          if (isDomainError(error)) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
              details: error.details,
            });
          }
          return reply.status(500).send({
            error: "INTERNAL_SERVER_ERROR",
            message: "Error interno del servidor",
          });
        }
      }
    );

    fastify.get(
      "/operadores/:usuarioId/instalaciones",
      async (request: FastifyRequest<{ Params: { usuarioId: string } }>, reply: FastifyReply) => {
        try {
          const result = await service.listarInstalacionesDeOperador(request.params.usuarioId);
          return reply.status(200).send(result);
        } catch (error) {
          if (isDomainError(error)) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
              details: error.details,
            });
          }
          return reply.status(500).send({
            error: "INTERNAL_SERVER_ERROR",
            message: "Error interno del servidor",
          });
        }
      }
    );
  };
}
