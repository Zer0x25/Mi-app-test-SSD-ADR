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

  async update(id: string, data: Partial<UsuarioEntity>): Promise<UsuarioEntity> {
    const updateData: {
      nombre?: string;
      rol?: string;
      activo?: boolean;
      passwordHash?: string;
    } = {};
    if (data.nombre !== undefined) updateData.nombre = data.nombre;
    if (data.rol !== undefined) updateData.rol = data.rol;
    if (data.activo !== undefined) updateData.activo = data.activo;
    if (data.passwordHash !== undefined) updateData.passwordHash = data.passwordHash;

    const u = await this.prisma.usuario.update({
      where: { id },
      data: updateData,
    });
    return this.mapToEntity(u);
  }

  async listAll(): Promise<
    (UsuarioEntity & { asignaciones: { instalacionId: string; instalacion: { id: string; nombre: string } }[] })[]
  > {
    const usuarios = await this.prisma.usuario.findMany({
      orderBy: { nombre: "asc" },
      include: {
        asignaciones: {
          include: {
            instalacion: {
              select: { id: true, nombre: true },
            },
          },
        },
      },
    });

    return usuarios.map((u) => ({
      ...this.mapToEntity(u),
      asignaciones: u.asignaciones.map((a) => ({
        instalacionId: a.instalacionId,
        instalacion: {
          id: a.instalacion.id,
          nombre: a.instalacion.nombre,
        },
      })),
    }));
  }

  async syncAsignaciones(usuarioId: string, instalacionesIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.asignacionOperador.deleteMany({
        where: { usuarioId },
      });
      if (instalacionesIds.length > 0) {
        await tx.asignacionOperador.createMany({
          data: instalacionesIds.map((instalacionId) => ({
            usuarioId,
            instalacionId,
          })),
        });
      }
    });
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
