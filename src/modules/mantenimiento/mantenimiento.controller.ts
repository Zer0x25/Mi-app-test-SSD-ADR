import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { MantenimientoService } from "./mantenimiento.service.js";
import {
  RegistrarMantenimientoInputSchema,
  FiltroMantenimientosSchema,
  TipoMantenimiento,
} from "./mantenimiento.schema.js";
import { DomainError } from "../../core/errors.js";

export function createMantenimientoController(service: MantenimientoService): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    // 1. Registrar Evento de Mantenimiento
    app.post(
      "/mantenimiento",
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const parsed = RegistrarMantenimientoInputSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.status(400).send({
              error: "VALIDATION_ERROR",
              message: "Datos de mantenimiento inválidos",
              details: parsed.error.issues,
            });
          }

          const resultado = await service.registrarMantenimiento(parsed.data);
          return reply.status(201).send(resultado);
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
          return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Error al registrar mantenimiento" });
        }
      }
    );

    // 2. Listar Bitácora de Mantenimientos
    app.get(
      "/mantenimiento",
      async (
        request: FastifyRequest<{
          Querystring: {
            medidorId?: string;
            instalacionId?: string;
            tipo?: TipoMantenimiento;
          };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const parsed = FiltroMantenimientosSchema.safeParse(request.query);
          if (!parsed.success) {
            return reply.status(400).send({
              error: "VALIDATION_ERROR",
              message: "Parámetros de filtro inválidos",
              details: parsed.error.issues,
            });
          }

          const resultado = await service.listarMantenimientos(parsed.data);
          return reply.status(200).send(resultado);
        } catch (error: unknown) {
          if (error instanceof DomainError) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
            });
          }
          return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Error al listar mantenimientos" });
        }
      }
    );

    // 3. Ficha Técnica y Bitácora de un Medidor
    app.get(
      "/mantenimiento/medidor/:id",
      async (
        request: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply
      ) => {
        try {
          const resultado = await service.obtenerFichaMedidor(request.params.id);
          return reply.status(200).send(resultado);
        } catch (error: unknown) {
          if (error instanceof DomainError) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
            });
          }
          return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Error al obtener ficha de medidor" });
        }
      }
    );
  };
}
