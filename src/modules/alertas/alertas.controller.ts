import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { AlertasService } from "./alertas.service.js";
import {
  CrearReglaAlertaInputSchema,
  ResolverIncidenteInputSchema,
  FiltroIncidentesSchema,
  TipoAlerta,
  SeveridadAlerta,
  EstadoIncidente,
} from "./alertas.schema.js";
import { DomainError } from "../../core/errors.js";

export function createAlertasController(service: AlertasService): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    // 1. Listar Incidentes
    app.get(
      "/alertas/incidentes",
      async (
        request: FastifyRequest<{
          Querystring: {
            instalacionId?: string;
            estado?: EstadoIncidente;
            severidad?: SeveridadAlerta;
            tipo?: TipoAlerta;
          };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const parsed = FiltroIncidentesSchema.safeParse(request.query);
          if (!parsed.success) {
            return reply.status(400).send({
              error: "VALIDATION_ERROR",
              message: "Parámetros de filtro inválidos",
              details: parsed.error.issues,
            });
          }

          const user = (request as unknown as { user?: { rol: string; allowedInstalacionIds?: string[] } }).user;
          const allowedIds = user && user.rol !== "ADMIN" ? (user.allowedInstalacionIds || []) : undefined;

          const resultado = await service.listarIncidentes(parsed.data, allowedIds);
          return reply.status(200).send(resultado);
        } catch (error: unknown) {
          if (error instanceof DomainError) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
            });
          }
          return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Error al listar incidentes" });
        }
      }
    );

    // 2. Resolver Incidente
    app.post(
      "/alertas/incidentes/:id/resolver",
      async (
        request: FastifyRequest<{
          Params: { id: string };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const parsed = ResolverIncidenteInputSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.status(400).send({
              error: "VALIDATION_ERROR",
              message: "Datos de resolución inválidos",
              details: parsed.error.issues,
            });
          }

          const user = (request as unknown as { user?: { rol: string; allowedInstalacionIds?: string[] } }).user;
          const allowedIds = user && user.rol !== "ADMIN" ? (user.allowedInstalacionIds || []) : undefined;

          const resultado = await service.resolverIncidente(request.params.id, parsed.data, allowedIds);
          return reply.status(200).send(resultado);
        } catch (error: unknown) {
          if (error instanceof DomainError) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
            });
          }
          return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Error al resolver incidente" });
        }
      }
    );

    // 3. Ejecutar Evaluación de Reglas
    app.post(
      "/alertas/evaluar",
      async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
          const nuevos = await service.evaluarReglas();
          return reply.status(200).send({
            status: "ok",
            evaluados: true,
            totalNuevos: nuevos.length,
            incidentes: nuevos,
          });
        } catch (error: unknown) {
          if (error instanceof DomainError) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
            });
          }
          return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Error al evaluar alertas" });
        }
      }
    );

    // 4. Resumen de Métricas de Alertas
    app.get(
      "/alertas/resumen",
      async (
        request: FastifyRequest<{ Querystring: { instalacionId?: string } }>,
        reply: FastifyReply
      ) => {
        try {
          const user = (request as unknown as { user?: { rol: string; allowedInstalacionIds?: string[] } }).user;
          const allowedIds = user && user.rol !== "ADMIN" ? (user.allowedInstalacionIds || []) : undefined;

          const resumen = await service.obtenerResumen(request.query.instalacionId, allowedIds);
          return reply.status(200).send(resumen);
        } catch (error: unknown) {
          if (error instanceof DomainError) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
            });
          }
          return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Error al obtener resumen de alertas" });
        }
      }
    );

    // 5. Configuración de Reglas
    app.get(
      "/alertas/reglas",
      async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
          const reglas = await service.listarReglas();
          return reply.status(200).send(reglas);
        } catch {
          return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Error al listar reglas" });
        }
      }
    );

    app.post(
      "/alertas/reglas",
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const parsed = CrearReglaAlertaInputSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.status(400).send({
              error: "VALIDATION_ERROR",
              message: "Configuración de regla inválida",
              details: parsed.error.issues,
            });
          }

          const regla = await service.crearRegla(parsed.data);
          return reply.status(201).send(regla);
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
          return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Error al crear regla" });
        }
      }
    );
  };
}
