import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { UsuariosService } from "./usuarios.service.js";
import { isDomainError } from "../../core/errors.js";
import {
  RegistroUsuarioInput,
  LoginInput,
  CambiarPasswordInput,
  ResetPasswordInput,
  EditarUsuarioInput,
  NoAutorizadoError,
  AccesoDenegadoError,
  TokenPayload,
} from "./usuarios.schema.js";

function extractUser(request: FastifyRequest, service: UsuariosService): TokenPayload {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new NoAutorizadoError("Cabecera Authorization con formato Bearer <token> requerida.");
  }

  const token = authHeader.slice(7).trim();
  try {
    return service.verificarToken(token);
  } catch {
    throw new NoAutorizadoError("Token de autenticación inválido o expirado.");
  }
}

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
      {
        config: {
          rateLimit: {
            max: 5,
            timeWindow: 60 * 1000,
          },
        },
      },
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
        const payload = extractUser(request, service);
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

    // --------------------------------------------------------------------------
    // POST /auth/cambiar-password - Auto-servicio cambio contraseña usuario activo
    // --------------------------------------------------------------------------
    fastify.post(
      "/auth/cambiar-password",
      async (request: FastifyRequest<{ Body: CambiarPasswordInput }>, reply: FastifyReply) => {
        try {
          const user = extractUser(request, service);
          await service.cambiarPassword(user.userId, request.body);
          return reply.status(200).send({
            status: "ok",
            message: "Contraseña actualizada exitosamente.",
          });
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
            message: "Error interno al cambiar contraseña.",
          });
        }
      }
    );

    // --------------------------------------------------------------------------
    // GET /usuarios - Listar todos los usuarios con sus asignaciones (ADMIN)
    // --------------------------------------------------------------------------
    fastify.get("/usuarios", async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = extractUser(request, service);
        if (user.rol !== "ADMIN") {
          throw new AccesoDenegadoError("gestionar usuarios", user.rol);
        }
        const lista = await service.listarUsuarios();
        return reply.status(200).send(lista);
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
          message: "Error interno al listar usuarios.",
        });
      }
    });

    // --------------------------------------------------------------------------
    // PATCH /usuarios/:id - Editar usuario y sincronizar instalaciones (ADMIN)
    // --------------------------------------------------------------------------
    fastify.patch(
      "/usuarios/:id",
      async (
        request: FastifyRequest<{ Params: { id: string }; Body: EditarUsuarioInput }>,
        reply: FastifyReply
      ) => {
        try {
          const user = extractUser(request, service);
          if (user.rol !== "ADMIN") {
            throw new AccesoDenegadoError("editar usuarios", user.rol);
          }
          const actualizado = await service.editarUsuario(
            request.params.id,
            request.body,
            user.userId
          );
          return reply.status(200).send(actualizado);
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
            message: "Error interno al editar usuario.",
          });
        }
      }
    );

    // --------------------------------------------------------------------------
    // POST /usuarios/:id/reset-password - Restablecimiento administrativo de clave (ADMIN)
    // --------------------------------------------------------------------------
    fastify.post(
      "/usuarios/:id/reset-password",
      async (
        request: FastifyRequest<{ Params: { id: string }; Body: ResetPasswordInput }>,
        reply: FastifyReply
      ) => {
        try {
          const user = extractUser(request, service);
          if (user.rol !== "ADMIN") {
            throw new AccesoDenegadoError("restablecer contraseñas", user.rol);
          }
          await service.resetPasswordAdmin(request.params.id, request.body, user.userId);
          return reply.status(200).send({
            status: "ok",
            message: "Contraseña restablecida exitosamente por el administrador.",
          });
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
            message: "Error interno al restablecer contraseña.",
          });
        }
      }
    );
  };
}
