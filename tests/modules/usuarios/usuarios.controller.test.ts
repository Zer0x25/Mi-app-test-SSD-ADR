import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { UsuariosService, IUsuariosRepository, UsuarioEntity } from "../../../src/modules/usuarios/usuarios.service.js";
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
});
