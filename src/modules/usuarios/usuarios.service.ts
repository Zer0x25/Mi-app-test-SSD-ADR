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
  UsuarioEmailDuplicadoError,
  CredencialesInvalidasError,
  UsuarioInactivoError,
  AccesoDenegadoError,
  InstalacionNoAsignadaError,
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

export interface IUsuariosRepository {
  findById(id: string): Promise<UsuarioEntity | null>;
  findByEmail(email: string): Promise<UsuarioEntity | null>;
  create(data: Omit<UsuarioEntity, "id" | "createdAt" | "updatedAt">): Promise<UsuarioEntity>;
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
    // ADMIN pasa libremente
  }
}
