import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import {
  UsuariosService,
  IUsuariosRepository,
  UsuarioEntity,
  UsuarioConAsignacionesEntity,
} from "../../../src/modules/usuarios/usuarios.service.js";
import { createUsuariosController } from "../../../src/modules/usuarios/usuarios.controller.js";
import crypto from "node:crypto";

class InMemoryUsuariosRepository implements IUsuariosRepository {
  public usuarios: UsuarioEntity[] = [];
  public asignaciones: { instalacionId: string; usuarioId: string }[] = [];

  async findById(id: string): Promise<UsuarioEntity | null> {
    return this.usuarios.find((u) => u.id === id) || null;
  }

  async findByEmail(email: string): Promise<UsuarioEntity | null> {
    return this.usuarios.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async create(data: Omit<UsuarioEntity, "id" | "createdAt" | "updatedAt">): Promise<UsuarioEntity> {
    const usuario: UsuarioEntity = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.usuarios.push(usuario);
    return usuario;
  }

  async update(id: string, data: Partial<UsuarioEntity>): Promise<UsuarioEntity> {
    const idx = this.usuarios.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error("Usuario no encontrado en memoria");
    const updated = {
      ...this.usuarios[idx],
      ...data,
      updatedAt: new Date(),
    };
    this.usuarios[idx] = updated;
    return updated;
  }

  async listAll(): Promise<UsuarioConAsignacionesEntity[]> {
    return this.usuarios.map((u) => ({
      ...u,
      asignaciones: this.asignaciones
        .filter((a) => a.usuarioId === u.id)
        .map((a) => ({
          instalacionId: a.instalacionId,
          instalacion: { id: a.instalacionId, nombre: `Sede ${a.instalacionId.slice(0, 4)}` },
        })),
    }));
  }

  async syncAsignaciones(usuarioId: string, instalacionesIds: string[]): Promise<void> {
    this.asignaciones = this.asignaciones.filter((a) => a.usuarioId !== usuarioId);
    for (const instId of instalacionesIds) {
      this.asignaciones.push({ usuarioId, instalacionId: instId });
    }
  }

  async isUsuarioAssignedToInstalacion(usuarioId: string, instalacionId: string): Promise<boolean> {
    return this.asignaciones.some(
      (a) => a.usuarioId === usuarioId && a.instalacionId === instalacionId
    );
  }
}

describe("UsuariosController HTTP Integration Suite", () => {
  let app: FastifyInstance;
  let repo: InMemoryUsuariosRepository;
  let service: UsuariosService;
  const JWT_SECRET = "super-test-jwt-secret-key-32-chars-long";

  beforeEach(async () => {
    repo = new InMemoryUsuariosRepository();
    service = new UsuariosService(repo, JWT_SECRET);
    app = Fastify();
    await app.register(createUsuariosController(service), { prefix: "/api" });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("POST /api/auth/register debe registrar un usuario y retornar 201 Created", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "supervisor@planta.cl",
        password: "password123",
        nombre: "María González",
        rol: "SUPERVISOR",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.email).toBe("supervisor@planta.cl");
    expect(body.rol).toBe("SUPERVISOR");
    expect(body.passwordHash).toBeUndefined(); // No expone el hash
  });

  it("POST /api/auth/register debe retornar 409 si el email ya existe", async () => {
    await service.registrar({
      email: "existente@planta.cl",
      password: "password123",
      nombre: "Existente",
      rol: "OPERADOR",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "existente@planta.cl",
        password: "otraPassword",
        nombre: "Duplicado",
        rol: "OPERADOR",
      },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error).toBe("USUARIO_EMAIL_DUPLICADO");
  });

  it("POST /api/auth/login debe autenticar y retornar 200 con JWT válido", async () => {
    await service.registrar({
      email: "admin@medidores.cl",
      password: "adminPassword123",
      nombre: "Administrador Central",
      rol: "ADMIN",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "admin@medidores.cl",
        password: "adminPassword123",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(body.usuario.rol).toBe("ADMIN");
  });

  it("POST /api/auth/login con credenciales erróneas debe retornar 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "nadie@medidores.cl",
        password: "passwordInvalida",
      },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error).toBe("CREDENCIALES_INVALIDAS");
  });

  it("GET /api/auth/me debe retornar datos del usuario con token Bearer válido", async () => {
    const usuario = await service.registrar({
      email: "operador1@planta.cl",
      password: "password123",
      nombre: "Juan Operador",
      rol: "OPERADOR",
    });

    const loginRes = await service.login({
      email: "operador1@planta.cl",
      password: "password123",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: {
        authorization: `Bearer ${loginRes.token}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(usuario.id);
    expect(body.email).toBe("operador1@planta.cl");
    expect(body.rol).toBe("OPERADOR");
  });

  it("GET /api/auth/me sin cabecera Authorization debe retornar 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
    });

    expect(res.statusCode).toBe(401);
  });

  describe("Cambio de Contraseña (Self-Service)", () => {
    it("POST /api/auth/cambiar-password con clave correcta retorna 200 OK", async () => {
      await service.registrar({
        email: "user@planta.cl",
        password: "miPasswordVieja123",
        nombre: "Usuario Test",
        rol: "OPERADOR",
      });

      const login = await service.login({
        email: "user@planta.cl",
        password: "miPasswordVieja123",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/cambiar-password",
        headers: { authorization: `Bearer ${login.token}` },
        payload: {
          passwordActual: "miPasswordVieja123",
          passwordNueva: "nuevaClaveSuperSegura456",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("ok");

      // Verificar que ahora se puede iniciar sesión con la nueva clave
      const nuevoLogin = await service.login({
        email: "user@planta.cl",
        password: "nuevaClaveSuperSegura456",
      });
      expect(nuevoLogin.token).toBeDefined();
    });

    it("POST /api/auth/cambiar-password con clave actual incorrecta retorna 401", async () => {
      await service.registrar({
        email: "error@planta.cl",
        password: "claveCorrecta123",
        nombre: "Usuario Error",
        rol: "OPERADOR",
      });

      const login = await service.login({
        email: "error@planta.cl",
        password: "claveCorrecta123",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/cambiar-password",
        headers: { authorization: `Bearer ${login.token}` },
        payload: {
          passwordActual: "claveEquivocada999",
          passwordNueva: "nuevaClaveSegura123",
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("PASSWORD_ACTUAL_INVALIDA");
    });
  });

  describe("Gestión de Usuarios (Admin RBAC)", () => {
    let adminToken: string;
    let supervisorToken: string;
    let operadorToken: string;
    let operadorId: string;

    beforeEach(async () => {
      await service.registrar({
        email: "admin@central.cl",
        password: "adminPass123",
        nombre: "Admin Principal",
        rol: "ADMIN",
      });
      const loginAdmin = await service.login({
        email: "admin@central.cl",
        password: "adminPass123",
      });
      adminToken = loginAdmin.token;

      await service.registrar({
        email: "sup@central.cl",
        password: "supPass123",
        nombre: "Supervisor Terreno",
        rol: "SUPERVISOR",
      });
      const loginSup = await service.login({
        email: "sup@central.cl",
        password: "supPass123",
      });
      supervisorToken = loginSup.token;

      const op = await service.registrar({
        email: "op@central.cl",
        password: "opPass123",
        nombre: "Operador Base",
        rol: "OPERADOR",
      });
      operadorId = op.id;
      const loginOp = await service.login({
        email: "op@central.cl",
        password: "opPass123",
      });
      operadorToken = loginOp.token;
    });

    it("GET /api/usuarios debe retornar 200 con listado para ADMIN", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/usuarios",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const list = res.json();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(3);
    });

    it("GET /api/usuarios debe retornar 403 Forbidden para SUPERVISOR y OPERADOR", async () => {
      const resSup = await app.inject({
        method: "GET",
        url: "/api/usuarios",
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      expect(resSup.statusCode).toBe(403);
      expect(resSup.json().error).toBe("ACCESO_DENEGADO");

      const resOp = await app.inject({
        method: "GET",
        url: "/api/usuarios",
        headers: { authorization: `Bearer ${operadorToken}` },
      });
      expect(resOp.statusCode).toBe(403);
      expect(resOp.json().error).toBe("ACCESO_DENEGADO");
    });

    it("PATCH /api/usuarios/:id debe permitir a ADMIN modificar rol y sedes", async () => {
      const instId = crypto.randomUUID();
      const res = await app.inject({
        method: "PATCH",
        url: `/api/usuarios/${operadorId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          nombre: "Operador Promovido",
          rol: "SUPERVISOR",
          instalacionesIds: [instId],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.nombre).toBe("Operador Promovido");
      expect(body.rol).toBe("SUPERVISOR");

      // Comprobar que en repo la asignación se sincronizó
      const asignado = await repo.isUsuarioAssignedToInstalacion(operadorId, instId);
      expect(asignado).toBe(true);
    });

    it("PATCH /api/usuarios/:id debe rechazar a un no-admin con 403 Forbidden", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/usuarios/${operadorId}`,
        headers: { authorization: `Bearer ${operadorToken}` },
        payload: {
          nombre: "Hack",
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("ACCESO_DENEGADO");
    });

    it("POST /api/usuarios/:id/reset-password debe permitir a ADMIN resetear contraseña", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/usuarios/${operadorId}/reset-password`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          passwordNueva: "nuevaClaveReseteada999",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("ok");

      // Operador puede ingresar con la nueva clave reseteada
      const login = await service.login({
        email: "op@central.cl",
        password: "nuevaClaveReseteada999",
      });
      expect(login.token).toBeDefined();
    });

    it("POST /api/usuarios/:id/reset-password debe retornar 403 Forbidden para SUPERVISOR", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/usuarios/${operadorId}/reset-password`,
        headers: { authorization: `Bearer ${supervisorToken}` },
        payload: {
          passwordNueva: "hackPassword123",
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("ACCESO_DENEGADO");
    });
  });
});
