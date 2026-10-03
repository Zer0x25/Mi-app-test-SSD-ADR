import {
  RegistroUsuarioInput,
  RegistroUsuarioInputSchema,
  LoginInput,
  LoginInputSchema,
  UsuarioResponse,
  UsuarioResponseSchema,
  AuthResponse,
  TokenPayload,
  RolUsuario,
  CambiarPasswordInput,
  CambiarPasswordInputSchema,
  ResetPasswordInput,
  ResetPasswordInputSchema,
  EditarUsuarioInput,
  EditarUsuarioInputSchema,
  UsuarioConAsignacionesResponse,
  UsuarioConAsignacionesResponseSchema,
  UsuarioEmailDuplicadoError,
  CredencialesInvalidasError,
  UsuarioInactivoError,
  AccesoDenegadoError,
  InstalacionNoAsignadaError,
  PasswordActualInvalidaError,
  UsuarioNotFoundError,
} from "./usuarios.schema.js";
import { hashPassword, verifyPassword, signJwt, verifyJwt } from "./auth.utils.js";

export interface UsuarioEntity {
  id: string;
  email: string;
  passwordHash: string;
  nombre: string;
  rol: RolUsuario;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsuarioConAsignacionesEntity extends UsuarioEntity {
  asignaciones: {
    instalacionId: string;
    instalacion: {
      id: string;
      nombre: string;
    };
  }[];
}

export interface IUsuariosRepository {
  findById(id: string): Promise<UsuarioEntity | null>;
  findByEmail(email: string): Promise<UsuarioEntity | null>;
  create(data: Omit<UsuarioEntity, "id" | "createdAt" | "updatedAt">): Promise<UsuarioEntity>;
  update(id: string, data: Partial<UsuarioEntity>): Promise<UsuarioEntity>;
  listAll(): Promise<UsuarioConAsignacionesEntity[]>;
  syncAsignaciones(usuarioId: string, instalacionesIds: string[]): Promise<void>;
  isUsuarioAssignedToInstalacion(usuarioId: string, instalacionId: string): Promise<boolean>;
}

export class UsuariosService {
  constructor(
    private readonly repository: IUsuariosRepository,
    private readonly jwtSecret: string
  ) {}

  /**
   * Registra un nuevo usuario con contraseña hasheada y rol especificado.
   */
  async registrar(rawInput: RegistroUsuarioInput): Promise<UsuarioResponse> {
    const input = RegistroUsuarioInputSchema.parse(rawInput);

    const existente = await this.repository.findByEmail(input.email);
    if (existente) {
      throw new UsuarioEmailDuplicadoError(input.email);
    }

    const passwordHash = await hashPassword(input.password);

    const usuario = await this.repository.create({
      email: input.email,
      passwordHash,
      nombre: input.nombre,
      rol: input.rol,
      activo: true,
    });

    return UsuarioResponseSchema.parse(usuario);
  }

  /**
   * Autentica credenciales y emite un token JWT firmado.
   */
  async login(rawInput: LoginInput): Promise<AuthResponse> {
    const input = LoginInputSchema.parse(rawInput);

    const usuario = await this.repository.findByEmail(input.email);
    if (!usuario) {
      throw new CredencialesInvalidasError();
    }

    if (!usuario.activo) {
      throw new UsuarioInactivoError(usuario.id);
    }

    const validPassword = await verifyPassword(input.password, usuario.passwordHash);
    if (!validPassword) {
      throw new CredencialesInvalidasError();
    }

    const payload: TokenPayload = {
      userId: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      rol: usuario.rol,
    };

    const token = signJwt(payload, this.jwtSecret);

    return {
      token,
      usuario: UsuarioResponseSchema.parse(usuario),
    };
  }

  /**
   * Valida un token JWT y retorna su payload decodificado.
   */
  verificarToken(token: string): TokenPayload {
    return verifyJwt(token, this.jwtSecret);
  }

  /**
   * Auto-servicio de Cambio de Contraseña:
   * Valida que la contraseña actual coincida antes de hashear y actualizar la nueva.
   */
  async cambiarPassword(usuarioId: string, rawInput: CambiarPasswordInput): Promise<void> {
    const input = CambiarPasswordInputSchema.parse(rawInput);

    const usuario = await this.repository.findById(usuarioId);
    if (!usuario) {
      throw new UsuarioNotFoundError(usuarioId);
    }

    const valida = await verifyPassword(input.passwordActual, usuario.passwordHash);
    if (!valida) {
      throw new PasswordActualInvalidaError();
    }

    const nuevoHash = await hashPassword(input.passwordNueva);
    await this.repository.update(usuarioId, { passwordHash: nuevoHash });
  }

  /**
   * Restablecimiento administrativo de contraseña (por ADMIN):
   * Actualiza la contraseña del usuario sin necesidad de ingresar la clave anterior.
   */
  async resetPasswordAdmin(usuarioId: string, rawInput: ResetPasswordInput): Promise<void> {
    const input = ResetPasswordInputSchema.parse(rawInput);

    const usuario = await this.repository.findById(usuarioId);
    if (!usuario) {
      throw new UsuarioNotFoundError(usuarioId);
    }

    const nuevoHash = await hashPassword(input.passwordNueva);
    await this.repository.update(usuarioId, { passwordHash: nuevoHash });
  }

  /**
   * Listado de todos los usuarios con sus instalaciones asignadas (para ADMIN).
   */
  async listarUsuarios(): Promise<UsuarioConAsignacionesResponse[]> {
    const lista = await this.repository.listAll();
    return lista.map((u) =>
      UsuarioConAsignacionesResponseSchema.parse({
        id: u.id,
        email: u.email,
        nombre: u.nombre,
        rol: u.rol,
        activo: u.activo,
        createdAt: u.createdAt,
        instalaciones: u.asignaciones.map((a) => ({
          id: a.instalacion.id,
          nombre: a.instalacion.nombre,
        })),
      })
    );
  }

  /**
   * Edita los atributos del usuario y sincroniza sus instalaciones asignadas (ADMIN).
   */
  async editarUsuario(id: string, rawInput: EditarUsuarioInput): Promise<UsuarioResponse> {
    const input = EditarUsuarioInputSchema.parse(rawInput);

    const usuario = await this.repository.findById(id);
    if (!usuario) {
      throw new UsuarioNotFoundError(id);
    }

    const updateData: Partial<UsuarioEntity> = {};
    if (input.nombre !== undefined) updateData.nombre = input.nombre;
    if (input.rol !== undefined) updateData.rol = input.rol;
    if (input.activo !== undefined) updateData.activo = input.activo;

    const actualizado = await this.repository.update(id, updateData);

    if (input.instalacionesIds !== undefined) {
      await this.repository.syncAsignaciones(id, input.instalacionesIds);
    }

    return UsuarioResponseSchema.parse(actualizado);
  }

  /**
   * Regla de Negocio RBAC: Solo el rol ADMIN puede crear instalaciones.
   */
  async verificarPermisoCrearInstalacion(rol: RolUsuario): Promise<void> {
    if (rol !== "ADMIN") {
      throw new AccesoDenegadoError("Crear Instalación", rol);
    }
  }

  /**
   * Regla de Negocio RBAC:
   * - ADMIN: puede crear medidores en cualquier instalación.
   * - SUPERVISOR: solo puede crear medidores en sus instalaciones asignadas.
   * - OPERADOR: no puede crear medidores bajo ninguna circunstancia.
   */
  async verificarPermisoCrearMedidor(
    rol: RolUsuario,
    usuarioId: string,
    instalacionId: string
  ): Promise<void> {
    if (rol === "OPERADOR") {
      throw new AccesoDenegadoError("Crear Medidor", rol);
    }

    if (rol === "SUPERVISOR") {
      const asignado = await this.repository.isUsuarioAssignedToInstalacion(
        usuarioId,
        instalacionId
      );
      if (!asignado) {
        throw new InstalacionNoAsignadaError(usuarioId, instalacionId);
      }
    }
  }
}
