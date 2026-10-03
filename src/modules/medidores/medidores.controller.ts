import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { MedidoresService } from "./medidores.service.js";
import { isDomainError } from "../../core/errors.js";
import { CrearTipoMedidorInput, CrearMedidorInput } from "./medidores.schema.js";

export function createMedidoresController(service: MedidoresService): FastifyPluginAsync {
  return async function (fastify: FastifyInstance) {
    // --------------------------------------------------------------------------
    // Catálogo de Tipos de Medidor
    // --------------------------------------------------------------------------
    fastify.post(
      "/tipos-medidor",
      async (request: FastifyRequest<{ Body: CrearTipoMedidorInput }>, reply: FastifyReply) => {
        try {
          const result = await service.crearTipoMedidor(request.body);
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

    fastify.get("/tipos-medidor", async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await service.listarTiposMedidor();
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
    });

    // --------------------------------------------------------------------------
    // Medidores Físicos
    // --------------------------------------------------------------------------
    fastify.post(
      "/medidores",
      async (request: FastifyRequest<{ Body: CrearMedidorInput }>, reply: FastifyReply) => {
        try {
          const result = await service.crearMedidor(request.body);
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
      "/medidores",
      async (
        request: FastifyRequest<{ Querystring: { instalacionId?: string } }>,
        reply: FastifyReply
      ) => {
        try {
          if (request.query.instalacionId) {
            const result = await service.listarMedidoresPorInstalacion(
              request.query.instalacionId
            );
            return reply.status(200).send(result);
          }
          return reply.status(200).send([]);
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
      "/medidores/:id",
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          const result = await service.obtenerMedidorPorId(request.params.id);
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
      "/medidores/:id/desactivar",
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          const result = await service.desactivarMedidor(request.params.id);
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

    fastify.get(
      "/instalaciones/:instalacionId/medidores",
      async (request: FastifyRequest<{ Params: { instalacionId: string } }>, reply: FastifyReply) => {
        try {
          const result = await service.listarMedidoresPorInstalacion(
            request.params.instalacionId
          );
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
