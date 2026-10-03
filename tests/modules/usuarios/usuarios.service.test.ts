import crypto from "node:crypto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  UsuariosService,
  IUsuariosRepository,
  UsuarioEntity,
} from "../../../src/modules/usuarios/usuarios.service.js";
import {
  UsuarioEmailDuplicadoError,
  CredencialesInvalidasError,
  UsuarioInactivoError,
  AccesoDenegadoError,
  InstalacionNoAsignadaError,
} from "../../../src/modules/usuarios/usuarios.schema.js";
import { hashPassword } from "../../../src/modules/usuarios/auth.utils.js";

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

describe("UsuariosService & RBAC Suite", () => {
  let repo: InMemoryUsuariosRepository;
  let service: UsuariosService;
  const JWT_SECRET = "test-secret-key-32-chars-long-123456";

  beforeEach(() => {
    repo = new InMemoryUsuariosRepository();
    service = new UsuariosService(repo, JWT_SECRET);
  });

  describe("Registro y Gestión de Usuarios", () => {
    it("debe registrar un usuario exitosamente con contraseña hasheada", async () => {
      const usuario = await service.registrar({
        email: "operador@planta.cl",
        password: "password123",
        nombre: "Juan Pérez",
        rol: "OPERADOR",
      });

      expect(usuario.id).toBeDefined();
      expect(usuario.email).toBe("operador@planta.cl");
      expect(usuario.rol).toBe("OPERADOR");
      expect(usuario.activo).toBe(true);

      const enBd = await repo.findByEmail("operador@planta.cl");
      expect(enBd?.passwordHash).not.toBe("password123");
      expect(enBd?.passwordHash).toContain(":");
    });

    it("debe rechazar el registro con email duplicado", async () => {
      await service.registrar({
        email: "admin@medidores.cl",
        password: "password123",
        nombre: "Admin Principal",
        rol: "ADMIN",
      });

      await expect(
        service.registrar({
          email: "ADMIN@medidores.cl",
          password: "otraPassword",
          nombre: "Admin Clon",
          rol: "ADMIN",
        })
      ).rejects.toThrow(UsuarioEmailDuplicadoError);
    });
  });

  describe("Autenticación y Login", () => {
    beforeEach(async () => {
      const passHash = await hashPassword("superPassword123");
      await repo.create({
        email: "supervisor@planta.cl",
        passwordHash: passHash,
        nombre: "Carlos Supervisor",
        rol: "SUPERVISOR",
        activo: true,
      });

      await repo.create({
        email: "inactivo@planta.cl",
        passwordHash: passHash,
        nombre: "Ex Operador",
        rol: "OPERADOR",
        activo: false,
      });
    });

    it("debe autenticar credenciales correctas y retornar JWT firmado", async () => {
      const auth = await service.login({
        email: "supervisor@planta.cl",
        password: "superPassword123",
      });

      expect(auth.token).toBeDefined();
      expect(auth.usuario.email).toBe("supervisor@planta.cl");
      expect(auth.usuario.rol).toBe("SUPERVISOR");

      const payload = service.verificarToken(auth.token);
      expect(payload.email).toBe("supervisor@planta.cl");
      expect(payload.rol).toBe("SUPERVISOR");
    });

    it("debe rechazar contraseña incorrecta con CredencialesInvalidasError", async () => {
      await expect(
        service.login({
          email: "supervisor@planta.cl",
          password: "passwordErronea",
        })
      ).rejects.toThrow(CredencialesInvalidasError);
    });

    it("debe rechazar usuario inexistente con CredencialesInvalidasError", async () => {
      await expect(
        service.login({
          email: "noexiste@planta.cl",
          password: "passwordCualquiera",
        })
      ).rejects.toThrow(CredencialesInvalidasError);
    });

    it("debe rechazar usuario inactivo con UsuarioInactivoError", async () => {
      await expect(
        service.login({
          email: "inactivo@planta.cl",
          password: "superPassword123",
        })
      ).rejects.toThrow(UsuarioInactivoError);
    });
  });

  describe("Matriz de Permisos RBAC (Admin, Supervisor, Operador)", () => {
    it("solo ADMIN puede crear instalaciones; SUPERVISOR y OPERADOR son rechazados", async () => {
      // ADMIN pasa sin lanzar error
      await expect(service.verificarPermisoCrearInstalacion("ADMIN")).resolves.not.toThrow();

      // SUPERVISOR rechazado
      await expect(service.verificarPermisoCrearInstalacion("SUPERVISOR")).rejects.toThrow(
        AccesoDenegadoError
      );

      // OPERADOR rechazado
      await expect(service.verificarPermisoCrearInstalacion("OPERADOR")).rejects.toThrow(
        AccesoDenegadoError
      );
    });

    it("creación de medidores: ADMIN puede en cualquier sede; SUPERVISOR solo en sus asignadas; OPERADOR nunca", async () => {
      repo.asignaciones.push({
        usuarioId: "usr-sup-1",
        instalacionId: "inst-maipu",
      });

      // 1. ADMIN en cualquier instalación
      await expect(
        service.verificarPermisoCrearMedidor("ADMIN", "usr-admin", "inst-quilicura")
      ).resolves.not.toThrow();

      // 2. SUPERVISOR en su instalación asignada (inst-maipu)
      await expect(
        service.verificarPermisoCrearMedidor("SUPERVISOR", "usr-sup-1", "inst-maipu")
      ).resolves.not.toThrow();

      // 3. SUPERVISOR en instalación NO asignada (inst-quilicura) -> InstalacionNoAsignadaError
      await expect(
        service.verificarPermisoCrearMedidor("SUPERVISOR", "usr-sup-1", "inst-quilicura")
      ).rejects.toThrow(InstalacionNoAsignadaError);

      // 4. OPERADOR siempre denegado
      await expect(
        service.verificarPermisoCrearMedidor("OPERADOR", "usr-op-1", "inst-maipu")
      ).rejects.toThrow(AccesoDenegadoError);
    });
  });
});
