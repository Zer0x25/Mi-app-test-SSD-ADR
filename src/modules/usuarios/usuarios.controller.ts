import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { UsuariosService } from "./usuarios.service.js";
import { isDomainError } from "../../core/errors.js";
import { RegistroUsuarioInput, LoginInput } from "./usuarios.schema.js";

export function createUsuariosController(service: UsuariosService): FastifyPluginAsync {
  return async function (fastify: FastifyInstance) {
    // --------------------------------------------------------------------------
    // POST /auth/register - Registrar un nuevo usuario
    // --------------------------------------------------------------------------
    fastify.post(
      "/auth/register",
      async (request: FastifyRequest<{ Body: RegistroUsuarioInput }>, reply: FastifyReply) => {
        try {
          const result = await service.registrar(request.body);
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
            message: "Error interno del servidor al registrar usuario",
          });
        }
      }
    );

    // --------------------------------------------------------------------------
    // POST /auth/login - Autenticación con credenciales y emisión de JWT
    // --------------------------------------------------------------------------
    fastify.post(
      "/auth/login",
      async (request: FastifyRequest<{ Body: LoginInput }>, reply: FastifyReply) => {
        try {
          const result = await service.login(request.body);
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
            message: "Error interno al procesar el inicio de sesión",
          });
        }
      }
    );

    // --------------------------------------------------------------------------
    // GET /auth/me - Obtener información del usuario autenticado
    // --------------------------------------------------------------------------
    fastify.get("/auth/me", async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return reply.status(401).send({
            error: "UNAUTHORIZED",
            message: "Cabecera Authorization con formato Bearer <token> requerida.",
          });
        }

        const token = authHeader.slice(7).trim();
        const payload = service.verificarToken(token);

        return reply.status(200).send({
          id: payload.userId,
          email: payload.email,
          nombre: payload.nombre,
          rol: payload.rol,
        });
      } catch (error) {
        if (isDomainError(error)) {
          return reply.status(error.statusCode).send({
            error: error.code,
            message: error.message,
            details: error.details,
          });
        }
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "Token de autenticación inválido o expirado.",
        });
      }
    });
  };
}
