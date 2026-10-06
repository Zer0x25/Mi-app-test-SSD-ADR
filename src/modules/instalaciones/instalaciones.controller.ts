import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { InstalacionesService } from "./instalaciones.service.js";
import { isDomainError } from "../../core/errors.js";
import { CrearInstalacionInput, EditarInstalacionInput } from "./instalaciones.schema.js";

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
      "/instalaciones/:id",
      async (
        request: FastifyRequest<{ Params: { id: string }; Body: EditarInstalacionInput }>,
        reply: FastifyReply
      ) => {
        try {
          const user = (request as unknown as { user?: { id?: string } }).user;
          const result = await service.editarInstalacion(request.params.id, request.body, {
            usuarioId: user?.id,
            ip: request.ip,
          });
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
      "/instalaciones/:id/archivar",
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          const user = (request as unknown as { user?: { id?: string } }).user;
          const result = await service.archivarInstalacion(request.params.id, {
            usuarioId: user?.id,
            ip: request.ip,
          });
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
      "/instalaciones/:id/restaurar",
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          const user = (request as unknown as { user?: { id?: string } }).user;
          const result = await service.restaurarInstalacion(request.params.id, {
            usuarioId: user?.id,
            ip: request.ip,
          });
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

    fastify.delete(
      "/instalaciones/:id",
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          const user = (request as unknown as { user?: { id?: string } }).user;
          await service.eliminarInstalacionFisica(request.params.id, {
            usuarioId: user?.id,
            ip: request.ip,
          });
          return reply.status(200).send({ success: true, message: "Instalación eliminada definitivamente" });
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

    const handleDesasignar = async (
      request: FastifyRequest<{ Params: { id: string; usuarioId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        await service.desasignarOperador(request.params.id, request.params.usuarioId);
        return reply.status(200).send({ success: true, message: "Asignación removida" });
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
    };

    fastify.delete("/instalaciones/:id/operadores/:usuarioId", handleDesasignar);
    fastify.delete("/instalaciones/:id/remover-operador/:usuarioId", handleDesasignar);

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
