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
  PasswordActualInvalidaError,
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

  async update(id: string, data: Partial<UsuarioEntity>): Promise<UsuarioEntity> {
    const idx = this.usuarios.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error("Usuario no encontrado en mock");
    this.usuarios[idx] = {
      ...this.usuarios[idx],
      ...data,
      updatedAt: new Date(),
    };
    return this.usuarios[idx];
  }

  async listAll(): Promise<
    (UsuarioEntity & { asignaciones: { instalacionId: string; instalacion: { id: string; nombre: string } }[] })[]
  > {
    return this.usuarios.map((u) => ({
      ...u,
      asignaciones: this.asignaciones
        .filter((a) => a.usuarioId === u.id)
        .map((a) => ({
          instalacionId: a.instalacionId,
          instalacion: { id: a.instalacionId, nombre: `Sede ${a.instalacionId}` },
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

  describe("Cambio de Contraseña (Self-Service)", () => {
    it("debe cambiar la contraseña exitosamente si la actual es correcta", async () => {
      const passHash = await hashPassword("originalPass123");
      const user = await repo.create({
        email: "usuario@cambio.cl",
        passwordHash: passHash,
        nombre: "Usuario Cambio",
        rol: "OPERADOR",
        activo: true,
      });

      await expect(
        service.cambiarPassword(user.id, {
          passwordActual: "originalPass123",
          passwordNueva: "nuevaSuperPass456",
        })
      ).resolves.not.toThrow();

      // Debe poder autenticar con la nueva clave
      const auth = await service.login({
        email: "usuario@cambio.cl",
        password: "nuevaSuperPass456",
      });
      expect(auth.token).toBeDefined();

      // La clave antigua ya no debe funcionar
      await expect(
        service.login({
          email: "usuario@cambio.cl",
          password: "originalPass123",
        })
      ).rejects.toThrow(CredencialesInvalidasError);
    });

    it("debe rechazar el cambio si la contraseña actual es errónea", async () => {
      const passHash = await hashPassword("originalPass123");
      const user = await repo.create({
        email: "usuario2@cambio.cl",
        passwordHash: passHash,
        nombre: "Usuario 2",
        rol: "OPERADOR",
        activo: true,
      });

      await expect(
        service.cambiarPassword(user.id, {
          passwordActual: "passwordEquivocada",
          passwordNueva: "nuevaSuperPass456",
        })
      ).rejects.toThrow(PasswordActualInvalidaError);
    });
  });

  describe("Gestión de Usuarios y Reset de Contraseña por Admin", () => {
    it("debe permitir a ADMIN resetear contraseña sin requerir la anterior", async () => {
      const passHash = await hashPassword("claveAntigua123");
      const user = await repo.create({
        email: "olvido@planta.cl",
        passwordHash: passHash,
        nombre: "Operador Olvidadizo",
        rol: "OPERADOR",
        activo: true,
      });

      await expect(
        service.resetPasswordAdmin(user.id, {
          passwordNueva: "claveReseteada789",
        })
      ).resolves.not.toThrow();

      // Puede iniciar sesión con la clave reseteada
      const auth = await service.login({
        email: "olvido@planta.cl",
        password: "claveReseteada789",
      });
      expect(auth.token).toBeDefined();
    });

    it("debe listar usuarios con sus instalaciones asignadas", async () => {
      const passHash = await hashPassword("pass123456");
      const u1 = await repo.create({
        email: "sup1@planta.cl",
        passwordHash: passHash,
        nombre: "Supervisor 1",
        rol: "SUPERVISOR",
        activo: true,
      });
      const instId = crypto.randomUUID();
      repo.asignaciones.push({ usuarioId: u1.id, instalacionId: instId });

      const lista = await service.listarUsuarios();
      expect(lista.length).toBeGreaterThan(0);
      const sup = lista.find((u) => u.id === u1.id);
      expect(sup?.instalaciones.length).toBe(1);
      expect(sup?.instalaciones[0].id).toBe(instId);
    });

    it("debe editar nombre, rol, estado y sincronizar instalaciones del usuario", async () => {
      const passHash = await hashPassword("pass123456");
      const user = await repo.create({
        email: "ascenso@planta.cl",
        passwordHash: passHash,
        nombre: "Operador Prometedor",
        rol: "OPERADOR",
        activo: true,
      });

      const instA = crypto.randomUUID();
      const instB = crypto.randomUUID();

      const editado = await service.editarUsuario(user.id, {
        nombre: "Supervisor Promovido",
        rol: "SUPERVISOR",
        activo: true,
        instalacionesIds: [instA, instB],
      });

      expect(editado.nombre).toBe("Supervisor Promovido");
      expect(editado.rol).toBe("SUPERVISOR");

      // Verificar que las instalaciones se sincronizaron en el repo
      const asignadoA = await repo.isUsuarioAssignedToInstalacion(user.id, instA);
      const asignadoB = await repo.isUsuarioAssignedToInstalacion(user.id, instB);
      expect(asignadoA).toBe(true);
      expect(asignadoB).toBe(true);
    });
  });
});
