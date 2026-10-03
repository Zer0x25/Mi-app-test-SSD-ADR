import { PrismaClient } from "@prisma/client";
import { IUsuariosRepository, UsuarioEntity } from "./usuarios.service.js";
import { RolUsuario } from "./usuarios.schema.js";

export class PrismaUsuariosRepository implements IUsuariosRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<UsuarioEntity | null> {
    const u = await this.prisma.usuario.findUnique({
      where: { id },
    });
    if (!u) return null;
    return this.mapToEntity(u);
  }

  async findByEmail(email: string): Promise<UsuarioEntity | null> {
    const u = await this.prisma.usuario.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!u) return null;
    return this.mapToEntity(u);
  }

  async create(data: Omit<UsuarioEntity, "id" | "createdAt" | "updatedAt">): Promise<UsuarioEntity> {
    const u = await this.prisma.usuario.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        nombre: data.nombre,
        rol: data.rol,
        activo: data.activo,
      },
    });
    return this.mapToEntity(u);
  }

  async isUsuarioAssignedToInstalacion(usuarioId: string, instalacionId: string): Promise<boolean> {
    const asignacion = await this.prisma.asignacionOperador.findUnique({
      where: {
        instalacionId_usuarioId: {
          instalacionId,
          usuarioId,
        },
      },
    });
    return !!asignacion;
  }

  private mapToEntity(u: {
    id: string;
    email: string;
    passwordHash: string;
    nombre: string;
    rol: string;
    activo: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): UsuarioEntity {
    return {
      id: u.id,
      email: u.email,
      passwordHash: u.passwordHash,
      nombre: u.nombre,
      rol: u.rol as RolUsuario,
      activo: u.activo,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }
}
